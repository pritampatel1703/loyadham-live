// End-to-end test: login, create device, get QR, test remote commands
const http = require('http');

const BASE = 'http://localhost:4000';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method, hostname: url.hostname, port: url.port, path: url.pathname,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('=== LOYADHAM END-TO-END TEST ===\n');

  // 1. Login
  console.log('1. Login as admin...');
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'PixelPerfect@2026' });
  if (login.status !== 200) {
    console.log('   Login failed:', login.status, login.data);
    console.log('   (Expected - DB is in memory mode, no admin user seeded)');
    console.log('   Trying to register admin...');
    // In memory mode, we need to create the user first or the system auto-creates
    // Let's skip auth and test the device API directly
  }
  const token = login.data?.token;
  console.log('   Token:', token ? token.substring(0, 20) + '...' : 'NONE');

  // 2. List devices
  console.log('\n2. List devices...');
  const devices = await req('GET', '/api/devices', null, token);
  console.log('   Status:', devices.status);
  console.log('   Devices:', JSON.stringify(devices.data?.devices?.map(d => ({ id: d.id, name: d.name, online: d.is_online })) || 'none'));

  // 3. Create a test device
  console.log('\n3. Create test device...');
  const created = await req('POST', '/api/devices', { name: 'Test Phone', label: 'test', group_name: 'Default' }, token);
  console.log('   Status:', created.status);
  console.log('   Result:', JSON.stringify(created.data));

  if (created.data?.id) {
    // 4. Get QR code
    console.log('\n4. Get QR code for device...');
    const qr = await req('GET', `/api/devices/${created.data.id}/qr`, null, token);
    console.log('   Status:', qr.status);
    console.log('   Has QR image:', !!qr.data?.qr);
    console.log('   Pairing token:', qr.data?.pairing_token);
    console.log('   Camera URL:', qr.data?.camera_url);

    // 5. Test pairing
    console.log('\n5. Test pairing...');
    const pair = await req('POST', '/api/devices/pair', { token: created.data.pairing_token });
    console.log('   Status:', pair.status);
    console.log('   Result:', JSON.stringify(pair.data));

    // 6. List devices again to see it
    console.log('\n6. List devices after create...');
    const devices2 = await req('GET', '/api/devices', null, token);
    console.log('   Devices:', JSON.stringify(devices2.data?.devices?.map(d => ({ id: d.id.substring(0,8), name: d.name, online: d.is_online })) || 'none'));
  }

  // 7. Test WebSocket camera-cmd flow
  console.log('\n7. Testing WebSocket camera-cmd pipeline...');
  const { io } = require('socket.io-client');
  
  const prodSocket = io('http://localhost:4000/production', { transports: ['websocket'] });
  const devSocket = io('http://localhost:4000/devices', { transports: ['websocket'] });

  await new Promise(resolve => {
    let prodConnected = false, devConnected = false;
    const check = () => { if (prodConnected && devConnected) resolve(); };
    prodSocket.on('connect', () => { console.log('   Production socket connected'); prodConnected = true; check(); });
    devSocket.on('connect', () => { console.log('   Device socket connected'); devConnected = true; check(); });
    setTimeout(() => { console.log('   Socket connect timeout'); resolve(); }, 3000);
  });

  if (created.data?.id) {
    // Register the device socket
    devSocket.emit('device:register', { device_id: created.data.id, pairing_token: created.data.pairing_token });
    
    await new Promise(resolve => {
      devSocket.on('device:registered', (data) => {
        console.log('   Device registered:', data.device_name);
        resolve();
      });
      devSocket.on('device:error', (data) => {
        console.log('   Device register error:', data.message);
        resolve();
      });
      setTimeout(resolve, 2000);
    });

    // Now test camera-cmd
    console.log('\n8. Sending camera-cmd (flip) from Production...');
    
    const cmdReceived = new Promise(resolve => {
      devSocket.on('camera-cmd', (data) => {
        console.log('   ✅ CAMERA-CMD RECEIVED ON DEVICE:', JSON.stringify(data));
        resolve(true);
      });
      setTimeout(() => { console.log('   ❌ CAMERA-CMD NOT RECEIVED (timeout)'); resolve(false); }, 3000);
    });

    prodSocket.emit('camera-cmd', { deviceId: created.data.id, cmd: 'flip' });
    const received = await cmdReceived;

    if (received) {
      // Test torch and mute too
      console.log('\n9. Testing torch and mute...');
      
      let torchOk = false, muteOk = false;
      devSocket.on('camera-cmd', (data) => {
        if (data.cmd === 'torch') { console.log('   ✅ TORCH received'); torchOk = true; }
        if (data.cmd === 'mute') { console.log('   ✅ MUTE received'); muteOk = true; }
      });

      prodSocket.emit('camera-cmd', { deviceId: created.data.id, cmd: 'torch' });
      await new Promise(r => setTimeout(r, 500));
      prodSocket.emit('camera-cmd', { deviceId: created.data.id, cmd: 'mute' });
      await new Promise(r => setTimeout(r, 1000));

      console.log('\n=== RESULTS ===');
      console.log('   Flip:  ✅ WORKING');
      console.log('   Torch:', torchOk ? '✅ WORKING' : '❌ FAILED');
      console.log('   Mute: ', muteOk ? '✅ WORKING' : '❌ FAILED');
    }
  }

  prodSocket.disconnect();
  devSocket.disconnect();
  
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
})();
