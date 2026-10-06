const jwt = require('jsonwebtoken');
const { getAsync } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_subscription_key_123456789';

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication token required' 
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired session token' 
      });
    }

    // Retrieve user from database to ensure fresh state
    const user = await getAsync(
      `SELECT user_id, email, is_verified, created_at FROM users WHERE user_id = ?`,
      [decoded.user_id]
    );

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User account not found' 
      });
    }

    // Route Guarding: Strictly block unverified users from accessing protected data
    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'Account email is not verified. Access to protected resources is restricted.',
        unverified: true,
        email: user.email
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server authentication error' 
    });
  }
};

module.exports = {
  requireAuth,
  JWT_SECRET
};
