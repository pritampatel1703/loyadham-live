// WebSocket camera-cmd test - run from android-app directory
const { io } = require('socket.io-client');

const deviceId = '76922556-fb96-4815-8d16-cddeb33d75d3';
const pairingToken = '7B5689F00BFD';

console.log('=== WEBSOCKET CAMERA-CMD TEST ===\n');

const prod = io('http://localhost:4000/production', { transports: ['websocket'] });
const dev = io('http://localhost:4000/devices', { transports: ['websocket'] });

prod.on('connect', () => console.log('✅ Production socket connected'));
dev.on('connect', () => {
  console.log('✅ Device socket connected');
  console.log('   Registering device with token:', pairingToken);
  dev.emit('device:register', { device_id: deviceId, pairing_token: pairingToken });
});

dev.on('device:registered', (data) => {
  console.log('✅ Device registered as:', data.device_name);
  
  // Now test camera commands
  setTimeout(() => {
    console.log('\n--- Sending FLIP from Production dashboard ---');
    prod.emit('camera-cmd', { deviceId: data.device_id, cmd: 'flip' });
  }, 500);
  
  setTimeout(() => {
    console.log('--- Sending TORCH from Production dashboard ---');
    prod.emit('camera-cmd', { deviceId: data.device_id, cmd: 'torch' });
  }, 1500);
  
  setTimeout(() => {
    console.log('--- Sending MUTE from Production dashboard ---');
    prod.emit('camera-cmd', { deviceId: data.device_id, cmd: 'mute' });
  }, 2500);
});

dev.on('device:error', (e) => {
  console.log('❌ Device registration error:', e.message);
  process.exit(1);
});

// Listen for camera commands arriving on the device socket
let received = [];
dev.on('camera-cmd', (data) => {
  console.log(`   ✅ RECEIVED on device: ${data.cmd}`);
  received.push(data.cmd);
  
  if (received.length === 3) {
    console.log('\n=== RESULTS ===');
    console.log('   Flip:  ', received.includes('flip') ? '✅ WORKING' : '❌ FAILED');
    console.log('   Torch: ', received.includes('torch') ? '✅ WORKING' : '❌ FAILED');
    console.log('   Mute:  ', received.includes('mute') ? '✅ WORKING' : '❌ FAILED');
    console.log('\n🎉 ALL REMOTE COMMANDS WORKING END-TO-END');
    setTimeout(() => process.exit(0), 500);
  }
});

setTimeout(() => {
  console.log('\n=== TIMEOUT ===');
  console.log('Received:', received.length, 'of 3 commands');
  if (received.length > 0) console.log('Got:', received.join(', '));
  else console.log('❌ No commands received - pipeline broken');
  process.exit(1);
}, 8000);
