const localtunnel = require('localtunnel');
const http = require('http');

async function getPublicIp() {
  return new Promise((resolve) => {
    http.get('http://api.ipify.org', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim() || '103.80.15.69'));
    }).on('error', () => resolve('103.80.15.69'));
  });
}

async function start() {
  const publicIp = await getPublicIp();
  console.log('=======================================================');
  console.log('🚇 INITIALIZING SECURE PUBLIC TUNNEL (NO ROUTER NEEDED)');
  console.log('=======================================================');

  try {
    const tunnel = await localtunnel({ port: 3000 });

    console.log(`\n🎉 Public URL: ${tunnel.url}`);
    console.log(`🔑 Tunnel Password (your public IP): ${publicIp}`);
    console.log('\n✅ Anyone on the internet can now open this URL without router configuration!');
    console.log('=======================================================');

    tunnel.on('close', () => {
      console.log('[Tunnel] Tunnel closed. Reconnecting in 5s...');
      setTimeout(start, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Tunnel error:', err.message);
    });

    // Keep process alive indefinitely
    setInterval(() => {}, 1000 * 60 * 60);
  } catch (err) {
    console.error('[Tunnel] Failed to initialize tunnel:', err.message);
    setTimeout(start, 5000);
  }
}

start();
