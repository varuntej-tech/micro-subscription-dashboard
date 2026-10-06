const express = require('express');
const router = express.Router();
const { runDailyRenewalCheck } = require('../services/cronService');

// POST /api/cron/trigger-now
// Trigger the scheduled daily renewal logic manually for testing & simulation
router.post('/trigger-now', async (req, res) => {
  try {
    const { simulatedDate } = req.body || {};
    const results = await runDailyRenewalCheck(simulatedDate);
    return res.json({
      success: true,
      message: 'Daily renewal check automation completed successfully',
      results
    });
  } catch (error) {
    console.error('[CronRoute] Execution error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Cron execution failed' 
    });
  }
});

module.exports = router;
