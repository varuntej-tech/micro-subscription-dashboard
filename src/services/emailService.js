const nodemailer = require('nodemailer');

// In-memory dev mailbox store for real-time inspection in browser & tests
const devMailbox = [];

let transporter = null;

// Initialize Transporter
const initTransporter = async () => {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '587', 10);

  if (process.env.RESEND_API_KEY) {
    transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY.trim(),
      },
    });
    console.log('[EmailService] 🚀 Connected to Resend SMTP (smtp.resend.com) with live API key.');
  } else if (host && user) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
    console.log('[EmailService] Configured with custom SMTP:', host);
  } else {
    // Ethereal Zero-Cost Test Account (Auto-generated on startup)
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('[EmailService] ⚡ Nodemailer test account ready via Ethereal (smtp.ethereal.email).');
      console.log(`[EmailService] Ethereal User: ${testAccount.user}`);
    } catch (etherealErr) {
      console.warn('[EmailService] Ethereal account creation warning:', etherealErr.message);
      console.log('[EmailService] Falling back to Local Dev Mailbox mode. Outgoing emails logged to /api/dev/emails');
    }
  }
};

initTransporter().catch(err => {
  console.warn('[EmailService] Transporter init warning:', err.message);
});

/**
 * Dispatch an email
 */
const sendMail = async ({ to, subject, html, text, meta = {} }) => {
  const mailRecord = {
    id: 'mail_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    to,
    from: (process.env.RESEND_API_KEY && (!process.env.SMTP_FROM || process.env.SMTP_FROM.includes('.local')))
      ? 'MicroSub <onboarding@resend.dev>'
      : (process.env.SMTP_FROM || 'Micro Subscriptions <no-reply@microsub.local>'),
    subject,
    html,
    text: text || html.replace(/<[^>]*>?/gm, ''),
    sentAt: new Date().toISOString(),
    meta
  };

  // Keep dev mailbox capped at 50 latest emails
  devMailbox.unshift(mailRecord);
  if (devMailbox.length > 50) {
    devMailbox.pop();
  }

  console.log(`[EmailService] 📧 Email sent to: ${to} | Subject: "${subject}"`);

  // 1. Direct Resend HTTPS REST API (Fastest & never blocked by cloud firewalls on Render/AWS)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: mailRecord.from,
          to: [mailRecord.to],
          subject: mailRecord.subject,
          text: mailRecord.text,
          html: mailRecord.html,
        }),
      });

      const resendJson = await resendRes.json().catch(() => ({}));

      if (!resendRes.ok) {
        const errorMsg = resendJson.message || `Resend error status ${resendRes.status}`;
        console.warn('[EmailService] Resend API delivery warning:', errorMsg);
        mailRecord.smtpError = errorMsg;
      } else {
        console.log(`[EmailService] 🚀 Delivered instantly via Resend HTTPS API! ID: ${resendJson.id}`);
        mailRecord.resendId = resendJson.id;
      }
    } catch (err) {
      console.warn('[EmailService] Resend API error:', err.message);
      mailRecord.smtpError = err.message;
    }
  } else if (transporter) {
    // 2. Fallback to Nodemailer transporter (Ethereal test accounts or custom SMTP)
    try {
      const info = await transporter.sendMail({
        from: mailRecord.from,
        to: mailRecord.to,
        subject: mailRecord.subject,
        text: mailRecord.text,
        html: mailRecord.html
      });
      console.log('[EmailService] Delivery confirmed via SMTP:', info.messageId);
      mailRecord.smtpMessageId = info.messageId;
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        mailRecord.previewUrl = previewUrl;
        console.log(`[EmailService] 🔗 [Ethereal Preview URL]: ${previewUrl}`);
      }
    } catch (error) {
      console.warn('[EmailService] SMTP delivery failed, email retained in dev mailbox:', error.message);
      mailRecord.smtpError = error.message;
    }
  }

  return mailRecord;
};

/**
 * Send Verification Email (Link + 6-digit OTP)
 */
const sendVerificationEmail = async ({ to, token, otp, expiresAt }) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const verificationLink = `${appUrl}/#verify-email?token=${token}&email=${encodeURIComponent(to)}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { text-align: center; margin-bottom: 24px; }
        .logo { font-size: 20px; font-weight: 700; color: #4f46e5; letter-spacing: -0.5px; }
        .title { font-size: 22px; font-weight: 700; margin-top: 12px; margin-bottom: 8px; color: #0f172a; }
        .otp-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4f46e5; }
        .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-top: 16px; }
        .footer { margin-top: 32px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚡ Micro-Subscription Dashboard</div>
          <h1 class="title">Verify Your Email Address</h1>
          <p style="color: #64748b; font-size: 14px; margin: 0;">Use the 6-digit code or click the button below to verify your account.</p>
        </div>

        <div class="otp-box">
          <div style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 6px;">Your 6-Digit Verification Code</div>
          <div class="otp-code">${otp}</div>
          <div style="font-size: 12px; color: #ef4444; margin-top: 6px;">⏰ Expires in 15 minutes</div>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <p style="font-size: 14px; color: #475569; margin-bottom: 12px;">Or verify instantly with a single click:</p>
          <a href="${verificationLink}" class="btn">Verify Email Now</a>
        </div>

        <div style="background-color: #f8fafc; border-radius: 6px; padding: 10px; font-size: 12px; word-break: break-all; color: #64748b; margin-top: 16px;">
          Direct link: <a href="${verificationLink}" style="color: #4f46e5;">${verificationLink}</a>
        </div>

        <div class="footer">
          If you didn't create an account with Micro-Subscription Dashboard, you can safely ignore this email.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendMail({
    to,
    subject: `🔐 Verify your email (${otp}) - Micro-Subscription Dashboard`,
    html,
    meta: {
      type: 'VERIFICATION',
      token,
      otp,
      expiresAt
    }
  });
};

/**
 * Send 48-Hour Renewal Warning Email
 */
const sendRenewalReminderEmail = async ({ to, serviceName, cost, currency, nextRenewalDate, billingCycle }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .container { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .badge { display: inline-block; background-color: #fef2f2; color: #ef4444; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; }
        .title { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a; }
        .details-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #edf2f7; }
        .row:last-child { border-bottom: none; }
        .label { color: #64748b; font-size: 14px; }
        .value { font-weight: 600; color: #0f172a; font-size: 14px; }
        .footer { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <span class="badge">⚠️ Renewal in 48 Hours</span>
        <h1 class="title">Hey! Your ${serviceName} subscription renews in 2 days</h1>
        <p style="color: #64748b; font-size: 14px; line-height: 1.5;">This is a smart reminder from your Micro-Subscription & Smart Renewal Dashboard to help you track recurring charges before your card gets billed.</p>

        <div class="details-card">
          <div class="row">
            <span class="label">Service</span>
            <span class="value">${serviceName}</span>
          </div>
          <div class="row">
            <span class="label">Amount</span>
            <span class="value">${currency} ${Number(cost).toFixed(2)}</span>
          </div>
          <div class="row">
            <span class="label">Billing Cycle</span>
            <span class="value" style="text-transform: capitalize;">${billingCycle}</span>
          </div>
          <div class="row">
            <span class="label">Next Renewal Date</span>
            <span class="value">${nextRenewalDate}</span>
          </div>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
          If you no longer use this service, remember to cancel it on their platform before the renewal date.
        </p>

        <div class="footer">
          Micro-Subscription & Smart Renewal Dashboard &bull; Automated 48-Hour Alert
        </div>
      </div>
    </body>
    </html>
  `;

  return sendMail({
    to,
    subject: `🔔 Reminder: ${serviceName} renews in 2 days (${currency} ${Number(cost).toFixed(2)})`,
    html,
    meta: {
      type: 'RENEWAL_ALERT',
      serviceName,
      cost,
      currency,
      nextRenewalDate,
      billingCycle
    }
  });
};

/**
 * Send Plain-Text Email OTP
 * Requirement: Send a clean, simple text email containing the raw text OTP and its expiration duration.
 */
const sendOtpEmail = async ({ to, otp, expirationMinutes = 5 }) => {
  const text = `Your one-time login verification code is: ${otp}\n\nThis code is valid for exactly ${expirationMinutes} minutes.\nIf you did not request this OTP, you can safely disregard this email.`;

  return sendMail({
    to,
    subject: `Your OTP Code: ${otp}`,
    text,
    html: `<pre style="font-family: monospace; font-size: 15px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; color: #1e293b;">${text}</pre>`,
    meta: {
      type: 'EMAIL_OTP',
      otp,
      expirationMinutes
    }
  });
};

const getDevMailbox = () => devMailbox;
const clearDevMailbox = () => { devMailbox.length = 0; };

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendRenewalReminderEmail,
  sendOtpEmail,
  getDevMailbox,
  clearDevMailbox
};

