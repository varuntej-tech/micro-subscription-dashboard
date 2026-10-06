const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getAsync, runAsync } = require('../db/database');
const { sendVerificationEmail } = require('../services/emailService');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const TOKEN_EXPIRY_MINUTES = 15;

/**
 * Generate a random 6-digit OTP
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate secure random token
 */
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * POST /api/auth/signup
 */
const signup = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide a valid email address' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters long' 
      });
    }

    // Check existing user
    const existingUser = await getAsync(
      `SELECT user_id, email, is_verified FROM users WHERE email = ?`,
      [normalizedEmail]
    );

    if (existingUser) {
      if (existingUser.is_verified) {
        return res.status(409).json({ 
          success: false, 
          error: 'An account with this email already exists. Please log in.' 
        });
      }

      // Existing unverified account: regenerate token and OTP
      const token = generateToken();
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
      const combinedToken = `${token}:${otp}`;

      // Update password hash as well in case they changed it
      const passwordHash = await bcrypt.hash(password, 10);

      await runAsync(
        `UPDATE users SET password_hash = ?, verification_token = ?, token_expires_at = ? WHERE user_id = ?`,
        [passwordHash, combinedToken, expiresAt, existingUser.user_id]
      );

      const mailRecord = await sendVerificationEmail({
        to: normalizedEmail,
        token,
        otp,
        expiresAt
      });

      return res.status(200).json({
        success: true,
        message: 'Account exists but unverified. A new verification email with code and link has been sent.',
        email: normalizedEmail,
        unverified: true,
        previewUrl: mailRecord?.previewUrl
      });
    }

    // New User Registration
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const token = generateToken();
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const combinedToken = `${token}:${otp}`;
    const createdAt = new Date().toISOString();

    await runAsync(
      `INSERT INTO users (user_id, email, password_hash, is_verified, verification_token, token_expires_at, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
      [userId, normalizedEmail, passwordHash, combinedToken, expiresAt, createdAt]
    );

    // Send verification email with both link and OTP
    const mailRecord = await sendVerificationEmail({
      to: normalizedEmail,
      token,
      otp,
      expiresAt
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your inbox for verification code/link.',
      email: normalizedEmail,
      unverified: true,
      previewUrl: mailRecord?.previewUrl
    });
  } catch (error) {
    console.error('[AuthController.signup] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Registration failed. Please try again.' 
    });
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await getAsync(
      `SELECT * FROM users WHERE email = ?`,
      [normalizedEmail]
    );

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }

    // Strict check for is_verified
    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'Your email is not verified yet. Please check your inbox or request a new code.',
        unverified: true,
        email: user.email
      });
    }

    // Issue JWT session token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        is_verified: true,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[AuthController.login] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Login failed. Please try again.' 
    });
  }
};

/**
 * GET or POST /api/auth/verify
 * Supports token via query param (?token=XYZ) or body { token, otp, email }
 */
const verifyEmail = async (req, res) => {
  try {
    const tokenQuery = req.query.token;
    const bodyToken = req.body ? req.body.token : null;
    const bodyOtp = req.body ? req.body.otp : null;
    const email = (req.query.email || (req.body && req.body.email) || '').trim().toLowerCase();

    const inputCode = (tokenQuery || bodyToken || bodyOtp || '').trim();

    if (!inputCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Verification token or 6-digit OTP code is required' 
      });
    }

    const now = new Date().toISOString();

    // Query candidate users
    let user;
    if (email) {
      user = await getAsync(`SELECT * FROM users WHERE email = ?`, [email]);
    } else {
      // Find user where combined token contains the input code
      user = await getAsync(
        `SELECT * FROM users WHERE verification_token LIKE ? AND is_verified = 0`,
        [`%${inputCode}%`]
      );
    }

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or unrecognized verification code/token' 
      });
    }

    if (user.is_verified) {
      // Already verified, generate session token
      const jwtToken = jwt.sign(
        { user_id: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        success: true,
        message: 'Account is already verified.',
        token: jwtToken,
        user: {
          user_id: user.user_id,
          email: user.email,
          is_verified: true
        }
      });
    }

    // Verify token expiry
    if (!user.token_expires_at || new Date(user.token_expires_at) < new Date(now)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Verification code/link has expired. Please request a new one.' 
      });
    }

    // Validate token / OTP match
    // Combined token format: `${hexToken}:${otpCode}`
    const storedToken = user.verification_token || '';
    const [storedHex, storedOtp] = storedToken.split(':');

    const isValid = inputCode === storedHex || inputCode === storedOtp || storedToken === inputCode;
    if (!isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid verification code or link' 
      });
    }

    // Valid token: flip is_verified to true (1) and clear token columns
    await runAsync(
      `UPDATE users 
       SET is_verified = 1, verification_token = NULL, token_expires_at = NULL 
       WHERE user_id = ?`,
      [user.user_id]
    );

    // Issue active JWT session token
    const jwtToken = jwt.sign(
      { user_id: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[AuthController] User verified successfully: ${user.email}`);

    return res.json({
      success: true,
      message: 'Email successfully verified! Welcome aboard.',
      token: jwtToken,
      user: {
        user_id: user.user_id,
        email: user.email,
        is_verified: true,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[AuthController.verifyEmail] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Verification processing failed.' 
    });
  }
};

/**
 * POST /api/auth/resend-verification
 */
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email address is required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'No account found with this email address' 
      });
    }

    if (user.is_verified) {
      return res.status(400).json({ 
        success: false, 
        error: 'This account is already verified. Please log in.' 
      });
    }

    const token = generateToken();
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const combinedToken = `${token}:${otp}`;

    await runAsync(
      `UPDATE users SET verification_token = ?, token_expires_at = ? WHERE user_id = ?`,
      [combinedToken, expiresAt, user.user_id]
    );

    const mailRecord = await sendVerificationEmail({
      to: normalizedEmail,
      token,
      otp,
      expiresAt
    });

    return res.json({
      success: true,
      message: 'A fresh verification code and link have been sent to your email.',
      previewUrl: mailRecord?.previewUrl
    });
  } catch (error) {
    console.error('[AuthController.resendVerification] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to resend verification email' 
    });
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
};

module.exports = {
  signup,
  login,
  verifyEmail,
  resendVerification,
  getMe
};
