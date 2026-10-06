// In-memory rate limiting map for verification email resends
// Key: email (normalized lowercase) or client IP
const resendRateLimitMap = new Map();

const COOLDOWN_SECONDS = 60; // 60 seconds rate limit window

const resendVerificationLimiter = (req, res, next) => {
  const email = (req.body && req.body.email) ? req.body.email.trim().toLowerCase() : req.ip;
  const now = Date.now();
  const lastRequestTime = resendRateLimitMap.get(email);

  if (lastRequestTime) {
    const elapsedSeconds = Math.floor((now - lastRequestTime) / 1000);
    if (elapsedSeconds < COOLDOWN_SECONDS) {
      const waitTime = COOLDOWN_SECONDS - elapsedSeconds;
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitTime} second${waitTime > 1 ? 's' : ''} before requesting another verification email.`,
        retryAfterSeconds: waitTime
      });
    }
  }

  // Update timestamp
  resendRateLimitMap.set(email, now);

  // Periodic cleanup of stale entries (older than 5 minutes)
  if (resendRateLimitMap.size > 1000) {
    for (const [key, timestamp] of resendRateLimitMap.entries()) {
      if (now - timestamp > 300000) {
        resendRateLimitMap.delete(key);
      }
    }
  }

  next();
};

module.exports = {
  resendVerificationLimiter,
  COOLDOWN_SECONDS
};
