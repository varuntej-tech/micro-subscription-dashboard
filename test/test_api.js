const assert = require('assert');
const path = require('path');
const http = require('http');

// Use test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

const { app, server } = require('../src/server');
const { getDevMailbox, clearDevMailbox } = require('../src/services/emailService');
const { runDailyRenewalCheck, formatDate } = require('../src/services/cronService');
const { getAsync } = require('../src/db/database');

const BASE_URL = 'http://localhost:3001';

// HTTP Helper
const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (e) {
          json = rawData;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

async function runTestSuite() {
  console.log('\n========================================');
  console.log('🧪 RUNNING COMPREHENSIVE AUTOMATED TESTS');
  console.log('========================================\n');

  try {
    clearDevMailbox();

    // ----------------------------------------------------
    // TEST 1: User Registration & Email Dispatch
    // ----------------------------------------------------
    console.log('[TEST 1] Testing User Registration (POST /api/auth/signup)...');
    const testEmail = `tester_${Date.now()}@testcorp.com`;
    const testPassword = 'Password123!';

    const signupRes = await request('POST', '/api/auth/signup', {
      email: testEmail,
      password: testPassword
    });

    assert.strictEqual(signupRes.status, 201, 'Signup should return 201 Created');
    assert.strictEqual(signupRes.data.success, true);
    assert.strictEqual(signupRes.data.unverified, true, 'User should start as unverified');

    // Verify user in Database
    const dbUser = await getAsync(`SELECT * FROM users WHERE email = ?`, [testEmail]);
    assert.ok(dbUser, 'User must exist in database');
    assert.strictEqual(dbUser.is_verified, 0, 'is_verified must be 0 initially');
    assert.ok(dbUser.verification_token, 'verification_token must be present');
    assert.ok(dbUser.token_expires_at, 'token_expires_at must be set');
    console.log('  ✅ DB Schema and initial unverified state confirmed.');

    // Verify email was dispatched
    const emails = getDevMailbox();
    assert.ok(emails.length >= 1, 'Verification email must be dispatched to mailbox');
    const verificationEmail = emails.find(e => e.to === testEmail);
    assert.ok(verificationEmail, 'Mailbox must contain email addressed to test user');
    assert.ok(verificationEmail.meta.otp, 'Email meta must include 6-digit OTP');
    assert.ok(verificationEmail.meta.token, 'Email meta must include verification token');
    console.log(`  ✅ Dispatched email verified. OTP: ${verificationEmail.meta.otp}`);

    // ----------------------------------------------------
    // TEST 2: Route Guarding on Login for Unverified Users
    // ----------------------------------------------------
    console.log('\n[TEST 2] Testing Route Guarding: Login blocked for unverified user...');
    const loginAttempt = await request('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword
    });

    assert.strictEqual(loginAttempt.status, 403, 'Unverified user login should be 403 Forbidden');
    assert.strictEqual(loginAttempt.data.unverified, true, 'Must return unverified flag');
    console.log('  ✅ Unverified login strictly blocked with 403 Forbidden.');

    // ----------------------------------------------------
    // TEST 3: Resend Verification Email with Rate Limiting
    // ----------------------------------------------------
    console.log('\n[TEST 3] Testing Resend Verification Email & Rate Limiter...');
    // Rapid duplicate request should trigger 429
    const resendRes1 = await request('POST', '/api/auth/resend-verification', { email: testEmail });
    assert.strictEqual(resendRes1.status, 200, 'First resend request should succeed');

    const resendRes2 = await request('POST', '/api/auth/resend-verification', { email: testEmail });
    assert.strictEqual(resendRes2.status, 429, 'Immediate second resend must be rate-limited (429)');
    assert.ok(resendRes2.data.retryAfterSeconds > 0, 'Should provide retryAfterSeconds cooldown');
    console.log(`  ✅ Rate limiting verified. Cooldown: ${resendRes2.data.retryAfterSeconds}s.`);

    // ----------------------------------------------------
    // TEST 4: Email Verification & Active JWT Issuance
    // ----------------------------------------------------
    console.log('\n[TEST 4] Testing Token Validation (POST /api/auth/verify)...');
    // Fetch latest token from user
    const updatedUser = await getAsync(`SELECT * FROM users WHERE email = ?`, [testEmail]);
    const otp = updatedUser.verification_token.split(':')[1];

    const verifyRes = await request('POST', '/api/auth/verify', {
      email: testEmail,
      otp
    });

    assert.strictEqual(verifyRes.status, 200, 'Verification should return 200 OK');
    assert.strictEqual(verifyRes.data.success, true);
    assert.ok(verifyRes.data.token, 'Should issue active JWT session token');
    assert.strictEqual(verifyRes.data.user.is_verified, true, 'User should now be verified');

    const verifiedDbUser = await getAsync(`SELECT * FROM users WHERE email = ?`, [testEmail]);
    assert.strictEqual(verifiedDbUser.is_verified, 1, 'is_verified must be flipped to 1 in DB');
    assert.strictEqual(verifiedDbUser.verification_token, null, 'verification_token must be cleared');
    assert.strictEqual(verifiedDbUser.token_expires_at, null, 'token_expires_at must be cleared');
    console.log('  ✅ Email verified in DB, tokens cleared, active JWT issued.');

    const userToken = verifyRes.data.token;

    // ----------------------------------------------------
    // TEST 5: Verified Login Success
    // ----------------------------------------------------
    console.log('\n[TEST 5] Testing Login for Verified User...');
    const loginSuccess = await request('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword
    });

    assert.strictEqual(loginSuccess.status, 200, 'Verified login should return 200 OK');
    assert.ok(loginSuccess.data.token, 'JWT session token returned');
    console.log('  ✅ Verified login succeeded.');

    // ----------------------------------------------------
    // TEST 6: Subscriptions CRUD & Relational Mapping
    // ----------------------------------------------------
    console.log('\n[TEST 6] Testing Subscriptions CRUD Operations...');

    // Calculate dates
    const today = new Date();
    const todayStr = formatDate(today);
    
    // Exactly 48 hours (2 days) away
    const renewalIn2Days = new Date(today);
    renewalIn2Days.setDate(renewalIn2Days.getDate() + 2);
    const dateIn2Days = formatDate(renewalIn2Days);

    // Overdue date (5 days ago)
    const overdueDateObj = new Date(today);
    overdueDateObj.setDate(overdueDateObj.getDate() - 5);
    const overdueDateStr = formatDate(overdueDateObj);

    // Add Subscription 1: Monthly (due in 2 days for 48h cron test)
    const sub1Res = await request('POST', '/api/subscriptions', {
      service_name: 'Netflix Premium',
      cost: 649.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: dateIn2Days,
      category: 'Entertainment'
    }, userToken);

    assert.strictEqual(sub1Res.status, 201, 'Should create subscription');
    assert.strictEqual(sub1Res.data.subscription.service_name, 'Netflix Premium');
    assert.strictEqual(sub1Res.data.subscription.cost, 649);

    // Add Subscription 2: Annual
    const sub2Res = await request('POST', '/api/subscriptions', {
      service_name: 'Amazon Prime',
      cost: 1499.00,
      currency: 'INR',
      billing_cycle: 'annual',
      next_renewal_date: '2027-01-15',
      category: 'Entertainment'
    }, userToken);
    assert.strictEqual(sub2Res.status, 201);

    // Add Subscription 3: Overdue Monthly for rollover test
    const sub3Res = await request('POST', '/api/subscriptions', {
      service_name: 'Old Dev Server',
      cost: 500.00,
      currency: 'INR',
      billing_cycle: 'monthly',
      next_renewal_date: overdueDateStr,
      category: 'Cloud & Infra'
    }, userToken);
    assert.strictEqual(sub3Res.status, 201);

    // Fetch subscriptions
    const getSubsRes = await request('GET', '/api/subscriptions', null, userToken);
    assert.strictEqual(getSubsRes.status, 200);
    assert.strictEqual(getSubsRes.data.subscriptions.length, 3, 'Should list all 3 subscriptions');
    console.log('  ✅ Subscriptions created and listed with relational mapping.');

    // ----------------------------------------------------
    // TEST 7: The Daily Financial Runway Calculations
    // ----------------------------------------------------
    console.log('\n[TEST 7] Testing The Daily Financial Runway Metrics...');
    const runwayRes = await request('GET', '/api/subscriptions/runway', null, userToken);
    assert.strictEqual(runwayRes.status, 200);
    const metrics = runwayRes.data.metrics;
    assert.strictEqual(metrics.totalSubscriptions, 3);
    assert.ok(metrics.dailyRunRate > 0, 'Daily run-rate must be calculated');
    assert.ok(metrics.weeklyRunRate > 0, 'Weekly run-rate must be calculated');
    assert.ok(metrics.monthlyRunRate > 0, 'Monthly run-rate must be calculated');
    assert.ok(metrics.annualRunRate > 0, 'Annual run-rate must be calculated');
    assert.ok(metrics.categoryBreakdown['Entertainment'] > 0, 'Category breakdown must include Entertainment');

    console.log(`  ✅ Daily Run-Rate: ₹${metrics.dailyRunRate}/day`);
    console.log(`  ✅ Weekly Run-Rate: ₹${metrics.weeklyRunRate}/week`);
    console.log(`  ✅ Monthly Run-Rate: ₹${metrics.monthlyRunRate}/month`);
    console.log(`  ✅ Annual Spend: ₹${metrics.annualRunRate}/year`);

    // ----------------------------------------------------
    // TEST 8: Background Automation / 48-Hour Cron Check
    // ----------------------------------------------------
    console.log('\n[TEST 8] Testing Background Automation (48-Hour Alerts & Rollover)...');
    
    // Clear mailbox to track new cron alerts
    clearDevMailbox();

    const cronResults = await runDailyRenewalCheck(todayStr);
    assert.strictEqual(cronResults.remindersSent >= 1, true, 'Must send 48-hour reminder for Netflix Premium');
    assert.strictEqual(cronResults.renewalsRolledOver >= 1, true, 'Must roll over overdue subscription');

    // Verify reminder email content
    const cronEmails = getDevMailbox();
    const renewalEmail = cronEmails.find(e => e.meta && e.meta.type === 'RENEWAL_ALERT');
    assert.ok(renewalEmail, 'Renewal alert email must be present in mailbox');
    assert.strictEqual(renewalEmail.meta.serviceName, 'Netflix Premium');
    console.log(`  ✅ Renewal email triggered: "${renewalEmail.subject}"`);

    // Verify overdue subscription rolled over
    const updatedSub3 = await getAsync(`SELECT * FROM subscriptions WHERE sub_id = ?`, [sub3Res.data.subscription.sub_id]);
    assert.ok(updatedSub3.next_renewal_date > overdueDateStr, 'Next renewal date must be advanced into future');
    console.log(`  ✅ Rolled over overdue renewal date from ${overdueDateStr} to ${updatedSub3.next_renewal_date}`);

    console.log('\n========================================');
    console.log('🎉 ALL AUTOMATED TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');

    server.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILURE:', error);
    if (server) server.close();
    process.exit(1);
  }
}

runTestSuite();
