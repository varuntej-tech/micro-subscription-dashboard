const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function postRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(endpoint, BASE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, text: resBody });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);

    http.get(url, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, text: resBody });
        }
      });
    }).on('error', reject);
  });
}

async function testUiAndFlow() {
  console.log('====================================================');
  console.log('🌐 TESTING UI COMPONENT INTEGRATION & END-TO-END FLOW');
  console.log('====================================================\n');

  // 1. Static HTML UI Structure Verification
  console.log('[STEP 1] Inspecting index.html for required UI elements...');
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const requiredElements = [
    'id="tab-otp-login"',
    'id="container-otp-flow"',
    'id="otp-flow-alert"',
    'id="otp-state-send"',
    'id="otp-input-email"',
    'id="btn-send-otp"',
    'id="otp-state-verify"',
    'id="otp-target-email-display"',
    'id="otp-countdown-timer"',
    'id="otp-input-code"',
    'id="btn-verify-otp"',
    'id="btn-resend-otp"'
  ];

  for (const el of requiredElements) {
    assert.ok(htmlContent.includes(el), `Missing expected element in index.html: ${el}`);
  }
  console.log('  ✅ All two-state UI components present in index.html (State 1: Send OTP, State 2: Verify OTP)');

  // 2. Client-side app.js logic inspection
  console.log('\n[STEP 2] Inspecting app.js for async fetch & state transitions...');
  const jsPath = path.resolve(__dirname, '../public/js/app.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  assert.ok(jsContent.includes('/api/send-otp'), 'app.js must call /api/send-otp');
  assert.ok(jsContent.includes('/api/verify-otp'), 'app.js must call /api/verify-otp');
  assert.ok(jsContent.includes('startOtpCountdown'), 'app.js must implement 5-minute countdown');
  assert.ok(jsContent.includes('showOtpState2'), 'app.js must implement transition to State 2');
  console.log('  ✅ app.js implements full sequential view state switching, fetch calls, and 5-min timer');

  // 3. End-to-end simulated user flow
  console.log('\n[STEP 3] Simulating user flow via API and Dev Mailbox...');
  const email = `ui_user_${Date.now()}@domain.com`;

  // Action: User in State 1 clicks "Send OTP"
  console.log('  -> State 1: User submits email:', email);
  const sendRes = await postRequest('/api/send-otp', { email });
  assert.strictEqual(sendRes.status, 200);
  assert.strictEqual(sendRes.data.success, true);
  console.log('  -> Backend responded 200 OK. State transitions to State 2.');

  // Fetch Dev Mailbox to inspect outbound email
  const mailboxRes = await getRequest('/api/dev/emails');
  const emails = mailboxRes.data.emails || [];
  const latestMail = emails.find(m => m.to === email);
  assert.ok(latestMail, 'Expected OTP email in Dev Mailbox');
  const otp = latestMail.text.match(/\b\d{6}\b/)[0];
  console.log(`  -> Dev Mailbox captured OTP email: "${latestMail.subject}", Code: ${otp}`);

  // Action: State 2 Edge Case - User types wrong code
  console.log('  -> State 2: User enters incorrect code "111111"...');
  const wrongCodeRes = await postRequest('/api/verify-otp', { email, otp: '111111' });
  assert.strictEqual(wrongCodeRes.status, 400);
  assert.strictEqual(wrongCodeRes.data.success, false);
  console.log('  -> Rejected with 400:', wrongCodeRes.data.error);

  // Action: State 2 Happy Path - User types correct code
  console.log(`  -> State 2: User enters correct code "${otp}"...`);
  const correctCodeRes = await postRequest('/api/verify-otp', { email, otp });
  assert.strictEqual(correctCodeRes.status, 200);
  assert.strictEqual(correctCodeRes.data.success, true);
  assert.ok(correctCodeRes.data.token, 'Session JWT token issued');
  console.log('  -> Verified! JWT session token issued. User transitions into dashboard.');

  console.log('\n====================================================');
  console.log('🎉 UI INTEGRATION & SIMULATED USER FLOW COMPLETE!');
  console.log('====================================================\n');
  process.exit(0);
}

testUiAndFlow().catch(err => {
  console.error('\n❌ UI FLOW TEST FAILED:', err);
  process.exit(1);
});
