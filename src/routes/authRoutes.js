const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { resendVerificationLimiter } = require('../middleware/rateLimiter');

// Registration (Step 1 & 2)
router.post('/signup', authController.signup);

// Login (Strict verification check)
router.post('/login', authController.login);

// Token / OTP Verification (Step 4)
router.get('/verify', authController.verifyEmail);
router.post('/verify', authController.verifyEmail);

// Resend Verification Email (Step 3 with rate limiting)
router.post('/resend-verification', resendVerificationLimiter, authController.resendVerification);

// Get current user profile
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
