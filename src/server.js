require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const otpRoutes = require('./routes/otpRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const cronRoutes = require('./routes/cronRoutes');
const devRoutes = require('./routes/devRoutes');
const { initCronJobs } = require('./services/cronService');

// Initialize database
require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', otpRoutes); // Directly mounts /api/send-otp and /api/verify-otp
app.use('/api/auth', authRoutes);
app.use('/api/auth', otpRoutes); // Aliases /api/auth/send-otp and /api/auth/verify-otp
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/dev', devRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Micro-Subscription & Smart Renewal API'
  });
});

// SPA Route Fallback
app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Cron scheduler
initCronJobs();

// Listen
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Micro-Subscription & Smart Renewal Dashboard is running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📧 Dev Mailbox: http://localhost:${PORT}/api/dev/emails`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
