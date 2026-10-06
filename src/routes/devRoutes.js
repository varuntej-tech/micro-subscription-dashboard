const express = require('express');
const router = express.Router();
const { getDevMailbox, clearDevMailbox } = require('../services/emailService');

// GET /api/dev/emails - Retrieve outgoing emails
router.get('/emails', (req, res) => {
  return res.json({
    success: true,
    emails: getDevMailbox()
  });
});

// POST /api/dev/emails/clear - Reset dev mailbox
router.post('/emails/clear', (req, res) => {
  clearDevMailbox();
  return res.json({
    success: true,
    message: 'Dev mailbox cleared'
  });
});

module.exports = router;
