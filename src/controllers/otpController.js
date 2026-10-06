const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getAsync, runAsync } = require('../db/database');
const { sendOtpEmail } = require('../services/emailService');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const OTP_EXPIRY_MINUTES = 5;

/**
 * Initialize Supabase Client if credentials are provided in environment
 */
let supabaseClient = null;
const getSupabaseClient = () => {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(url.trim(), key.trim());
      console.log('[OtpController] ⚡ Supabase Auth client connected for worldwide OTP delivery.');
    } catch (err) {
      console.warn('[OtpController] Supabase init warning:', err.message);
    }
  }
  return supabaseClient;
};

// Eager initialize
getSupabaseClient();

/**
 * Generate a random 6-digit numeric OTP code
 */
const generate6DigitOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * POST /api/send-otp
 * Generates 6-digit OTP, bcrypt hashes it, stores with 5-minute expiry, sends email
 */
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
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

    const now = new Date();
    // Clean up expired OTPs globally and delete any previous OTPs for this specific email
    await runAsync(
      `DELETE FROM email_otps WHERE email = ? OR expires_at <= ?`,
      [normalizedEmail, now.toISOString()]
    );

    // 1. If Supabase is active, dispatch OTP worldwide over HTTPS (delivers to ANY email without domain)
    const sb = getSupabaseClient();
    if (sb) {
      try {
        const { data, error } = await sb.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: true
          }
        });

        if (error) {
          console.warn('[OtpController] Supabase send notice:', error.message);
        } else {
          console.log(`[OtpController] 🚀 OTP dispatched worldwide via Supabase to ${normalizedEmail}`);
          return res.status(200).json({
            success: true,
            message: `A 6-digit OTP has been sent to ${normalizedEmail}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
            email: normalizedEmail,
            expiresInMinutes: OTP_EXPIRY_MINUTES,
            provider: 'supabase'
          });
        }
      } catch (sbErr) {
        console.warn('[OtpController] Supabase error:', sbErr.message);
      }
    }

    // 2. Fallback to Local + Resend generation (used for test suite and offline dev)
    const rawOtp = generate6DigitOtp();
    const saltRounds = 10;
    const otpHash = await bcrypt.hash(rawOtp, saltRounds);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const createdAt = now.toISOString();

    await runAsync(
      `INSERT INTO email_otps (email, otp_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [normalizedEmail, otpHash, expiresAt, createdAt]
    );

    const mailRecord = await sendOtpEmail({
      to: normalizedEmail,
      otp: rawOtp,
      expirationMinutes: OTP_EXPIRY_MINUTES
    });

    console.log(`[OtpController] Generated and sent OTP for ${normalizedEmail} (expires in ${OTP_EXPIRY_MINUTES}m)`);

    const responsePayload = {
      success: true,
      message: `A 6-digit OTP has been sent to ${normalizedEmail}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
      email: normalizedEmail,
      expiresInMinutes: OTP_EXPIRY_MINUTES
    };

    if (mailRecord && mailRecord.smtpError) {
      responsePayload.deliveryWarning = mailRecord.smtpError;
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[OtpController.sendOtp] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate and send OTP. Please try again.'
    });
  }
};

/**
 * POST /api/verify-otp
 * Validates OTP against bcrypt hash, verifies expiration, and clears immediately
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Both email and 6-digit OTP code are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    // 1. Try Supabase verification if Supabase is connected
    const sb = getSupabaseClient();
    if (sb) {
      try {
        const { data, error } = await sb.auth.verifyOtp({
          email: normalizedEmail,
          token: cleanOtp,
          type: 'email'
        });

        if (!error && (data?.user || data?.session)) {
          console.log(`[OtpController] ✅ Verified OTP via Supabase for: ${normalizedEmail}`);

          let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
          if (!user) {
            const userId = data.user?.id || uuidv4();
            const dummyHash = await bcrypt.hash(uuidv4(), 10);
            const createdAt = new Date().toISOString();
            await runAsync(
              `INSERT INTO users (user_id, email, password_hash, is_verified, created_at)
               VALUES (?, ?, ?, 1, ?)`,
              [userId, normalizedEmail, dummyHash, createdAt]
            );
            user = await getAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
          } else if (!user.is_verified) {
            await runAsync(`UPDATE users SET is_verified = 1 WHERE user_id = ?`, [user.user_id]);
            user.is_verified = 1;
          }

          const token = jwt.sign(
            { user_id: user.user_id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return res.status(200).json({
            success: true,
            message: 'OTP verified successfully via Supabase. You are now logged in.',
            token,
            user: {
              id: user.user_id,
              email: user.email,
              is_verified: true
            }
          });
        } else if (error) {
          console.log('[OtpController] Supabase OTP verify notice:', error.message);
        }
      } catch (sbErr) {
        console.warn('[OtpController] Supabase verify error:', sbErr.message);
      }
    }

    const now = new Date();

    // 2. Fallback to local SQLite verification (used for tests and offline dev)
    // First purge globally expired records
    await runAsync(`DELETE FROM email_otps WHERE expires_at <= ?`, [now.toISOString()]);

    // Retrieve active OTP record for this email
    const record = await getAsync(
      `SELECT * FROM email_otps WHERE email = ? ORDER BY id DESC LIMIT 1`,
      [normalizedEmail]
    );

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'OTP has expired or is invalid. Please request a new one.'
      });
    }

    // Check expiration timestamp
    if (new Date(record.expires_at) < now) {
      // Clear expired record immediately
      await runAsync(`DELETE FROM email_otps WHERE id = ?`, [record.id]);
      return res.status(400).json({
        success: false,
        error: 'OTP has expired. Please request a new code.'
      });
    }

    // Compare with bcrypt hash
    const isMatch = await bcrypt.compare(cleanOtp, record.otp_hash);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code. Please check and try again.'
      });
    }

    // SECURITY: Once verified successfully, delete immediately from data store
    await runAsync(`DELETE FROM email_otps WHERE email = ?`, [normalizedEmail]);
    console.log(`[OtpController] Successfully verified and cleared OTP for: ${normalizedEmail}`);

    // Find or create verified user account in users table
    let user = await getAsync(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

    if (!user) {
      // Automatically register user as verified if they don't have an account
      const userId = uuidv4();
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const createdAt = new Date().toISOString();

      await runAsync(
        `INSERT INTO users (user_id, email, password_hash, is_verified, created_at)
         VALUES (?, ?, ?, 1, ?)`,
        [userId, normalizedEmail, passwordHash, createdAt]
      );

      user = {
        user_id: userId,
        email: normalizedEmail,
        is_verified: 1,
        created_at: createdAt
      };
    } else if (!user.is_verified) {
      // Flip is_verified to 1
      await runAsync(
        `UPDATE users SET is_verified = 1, verification_token = NULL, token_expires_at = NULL WHERE user_id = ?`,
        [user.user_id]
      );
      user.is_verified = 1;
    }

    // Issue standard JWT session token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully! Welcome to your dashboard.',
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        is_verified: true,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[OtpController.verifyOtp] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'OTP verification failed. Please try again.'
    });
  }
};

module.exports = {
  sendOtp,
  verifyOtp
};
