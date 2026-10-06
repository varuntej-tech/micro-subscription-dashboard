const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const { getAsync, allAsync, runAsync } = require('../src/db/database');

let BASE_URL = 'http://localhost:3000';
let activeServer = null;

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

async function ensureServerRunning() {
  try {
    await getRequest('/api/health');
  } catch (err) {
    const { app } = require('../src/server');
    const testPort = 3004;
    activeServer = app.listen(testPort);
    BASE_URL = `http://localhost:${testPort}`;
    console.log(`[TestHelper] Test server started on port ${testPort}`);
  }
}

async function runTests() {
  await ensureServerRunning();
  console.log('====================================================');
  console.log('🧪 RUNNING EMAIL OTP INTEGRATION & SECURITY TESTS');
  console.log('====================================================\n');

  const testEmail = `agent_tester_${Date.now()}@example.com`;

  // TEST 1: Send OTP
  console.log('[TEST 1] Testing POST /api/send-otp...');
  const sendRes = await postRequest('/api/send-otp', { email: testEmail });
  assert.strictEqual(sendRes.status, 200, `Expected 200 but got ${sendRes.status}: ${JSON.stringify(sendRes.data)}`);
  assert.strictEqual(sendRes.data.success, true);
  console.log('  ✅ /api/send-otp responded 200 OK');

  // Verify in SQLite
  const dbRecord = await getAsync('SELECT * FROM email_otps WHERE email = ? ORDER BY id DESC LIMIT 1', [testEmail]);
  assert.ok(dbRecord, 'Expected OTP record to exist in email_otps table');
  assert.ok(dbRecord.otp_hash.startsWith('$2a$') || dbRecord.otp_hash.startsWith('$2b$'), 'Expected bcrypt hash format');
  assert.notStrictEqual(dbRecord.otp_hash.length, 6, 'Raw OTP must NOT be stored in DB');
  console.log('  ✅ OTP stored securely as bcrypt hash in email_otps table');

  const expiryTime = new Date(dbRecord.expires_at).getTime();
  const createdTime = new Date(dbRecord.created_at).getTime();
  const diffMinutes = Math.round((expiryTime - createdTime) / (60 * 1000));
  assert.strictEqual(diffMinutes, 5, `Expected 5 minutes expiration duration, got ${diffMinutes}`);
  console.log('  ✅ Expiration timestamp set to exactly 5 minutes');

  // Retrieve raw OTP from Dev Mailbox
  const mailRes = await getRequest('/api/dev/emails');
  assert.strictEqual(mailRes.status, 200);
  const emailsList = mailRes.data.emails || [];
  const sentMail = emailsList.find(m => m.to === testEmail);
  assert.ok(sentMail, 'Expected email to be logged in Dev Mailbox');
  assert.ok(sentMail.text.includes('5 minutes'), 'Expected text email to state 5-minute expiration');
  const otpMatch = sentMail.text.match(/\b\d{6}\b/);
  assert.ok(otpMatch, 'Expected 6-digit OTP in email text');
  const rawOtp = otpMatch[0];
  console.log(`  ✅ Dispatched plain-text email with raw OTP (${rawOtp}) captured in Dev Mailbox`);

  // Verify bcrypt hash matches raw OTP
  const isMatch = await bcrypt.compare(rawOtp, dbRecord.otp_hash);
  assert.strictEqual(isMatch, true, 'Bcrypt compare of raw OTP against stored hash must succeed');
  console.log('  ✅ bcrypt.compare validated raw OTP against stored database hash');

  // TEST 2: Verify with Invalid OTP code
  console.log('\n[TEST 2] Testing POST /api/verify-otp with incorrect OTP code...');
  const invalidRes = await postRequest('/api/verify-otp', { email: testEmail, otp: '000000' });
  assert.strictEqual(invalidRes.status, 400);
  assert.strictEqual(invalidRes.data.success, false);
  console.log(`  ✅ Invalid OTP rejected with 400: "${invalidRes.data.error}"`);

  // TEST 3: Verify with Expired OTP
  console.log('\n[TEST 3] Testing POST /api/verify-otp with expired timestamp...');
  // Force expiration in DB
  const pastDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await runAsync('UPDATE email_otps SET expires_at = ? WHERE email = ?', [pastDate, testEmail]);

  const expiredRes = await postRequest('/api/verify-otp', { email: testEmail, otp: rawOtp });
  assert.strictEqual(expiredRes.status, 400);
  assert.strictEqual(expiredRes.data.success, false);
  assert.ok(expiredRes.data.error.includes('expired'), 'Expected error to mention expired OTP');
  console.log(`  ✅ Expired OTP rejected with 400: "${expiredRes.data.error}"`);

  // Check that expired record is deleted
  const postExpiredRecord = await getAsync('SELECT * FROM email_otps WHERE email = ?', [testEmail]);
  assert.strictEqual(postExpiredRecord, undefined, 'Expired OTP record must be cleared from SQLite');
  console.log('  ✅ Expired OTP immediately cleared from SQLite');

  // TEST 4: Send fresh OTP & Verify successfully
  console.log('\n[TEST 4] Testing Successful OTP verification and single-use immediate clearance...');
  const freshSend = await postRequest('/api/send-otp', { email: testEmail });
  assert.strictEqual(freshSend.status, 200);

  const freshMailRes = await getRequest('/api/dev/emails');
  const latestMail = (freshMailRes.data.emails || []).find(m => m.to === testEmail);
  const freshOtp = latestMail.text.match(/\b\d{6}\b/)[0];

  const verifySuccess = await postRequest('/api/verify-otp', { email: testEmail, otp: freshOtp });
  assert.strictEqual(verifySuccess.status, 200);
  assert.strictEqual(verifySuccess.data.success, true);
  assert.ok(verifySuccess.data.token, 'Expected JWT token to be returned');
  assert.strictEqual(verifySuccess.data.user.email, testEmail);
  console.log('  ✅ OTP verified successfully, JWT session token issued');

  // Verify immediate deletion
  const clearedRecord = await getAsync('SELECT * FROM email_otps WHERE email = ?', [testEmail]);
  assert.strictEqual(clearedRecord, undefined, 'Verified OTP must be deleted immediately from email_otps');
  console.log('  ✅ Single-use verified: OTP record immediately removed from database');

  // TEST 5: Re-verification attempt with consumed OTP
  console.log('\n[TEST 5] Testing Re-verification replay prevention with already consumed OTP...');
  const replayRes = await postRequest('/api/verify-otp', { email: testEmail, otp: freshOtp });
  assert.strictEqual(replayRes.status, 400);
  assert.strictEqual(replayRes.data.success, false);
  console.log('  ✅ Replay attempt strictly rejected (OTP already consumed)');

  // TEST 6: Route Aliases (/api/auth/send-otp & /api/auth/verify-otp)
  console.log('\n[TEST 6] Testing aliased routes (/api/auth/send-otp and /api/auth/verify-otp)...');
  const aliasEmail = `alias_${Date.now()}@example.com`;
  const aliasSend = await postRequest('/api/auth/send-otp', { email: aliasEmail });
  assert.strictEqual(aliasSend.status, 200);

  const aliasMails = await getRequest('/api/dev/emails');
  const aliasMail = (aliasMails.data.emails || []).find(m => m.to === aliasEmail);
  const aliasOtp = aliasMail.text.match(/\b\d{6}\b/)[0];

  const aliasVerify = await postRequest('/api/auth/verify-otp', { email: aliasEmail, otp: aliasOtp });
  assert.strictEqual(aliasVerify.status, 200);
  assert.strictEqual(aliasVerify.data.success, true);
  console.log('  ✅ Route aliases at /api/auth/* operate identically');

  console.log('\n====================================================');
  console.log('🎉 ALL EMAIL OTP INTEGRATION TESTS PASSED!');
  console.log('====================================================\n');
  if (activeServer) activeServer.close();
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  if (activeServer) activeServer.close();
  process.exit(1);
});
