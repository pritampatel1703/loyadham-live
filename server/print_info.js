const os = require('os');
const { spawn } = require('child_process');
const qrcode = require('qrcode-terminal');
const path = require('path');

// 1. Get Local IP Address
let localIP = 'localhost';
const interfaces = os.networkInterfaces();
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    // Skip over internal and non-ipv4 addresses
    if ('IPv4' !== iface.family || iface.internal !== false) continue;
    // Prefer Wi-Fi or Ethernet
    if (localIP === 'localhost') {
      localIP = iface.address;
    }
  }
}

console.log('\n===================================================');
console.log('  SERVER IS RUNNING! (Keep all windows open)');
console.log('===================================================');
console.log('\n💻 1. DASHBOARD (Your Laptop):');
console.log('   Go to: http://localhost:4000');
console.log('\n🎥 2. DJI / GOPRO (Local Event Wi-Fi):');
console.log(`   RTMP URL: rtmp://${localIP}:1935/live/dji1`);
console.log(`   (Or use dji2, gopro1, etc for multiple cameras)`);
console.log('\n📱 3. MOBILE PHONES (4G/5G or Wi-Fi):');
console.log('   Generating Cloudflare Link & QR Code... Please wait.\n');

// 2. Start Cloudflare Tunnel
const cloudflaredPath = path.join(__dirname, '..', 'cloudflared.exe');
const cloudflare = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:4000']);

let qrPrinted = false;

cloudflare.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Debug: If link hasn't appeared yet, show some progress info
  if (!qrPrinted && output.includes('ERR')) {
    console.log('   [Tunnel Debug]:', output.trim());
  }
  
  // Look for the trycloudflare URL in the logs
  const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (urlMatch && !qrPrinted) {
    qrPrinted = true;
    const url = urlMatch[0];
    
    // Save to a temp file so the main server can read it for QR Code generation
    require('fs').writeFileSync(path.join(__dirname, 'cloudflare_url.txt'), url);
    
    console.log('\n===================================================');
    console.log('✅ PUBLIC 5G LINK READY:');
    console.log(`👉 ${url}`);
    console.log('===================================================\n');
    console.log('SCAN THIS ON MOBILE PHONES:\n');
    
    // Generate QR Code
    qrcode.generate(url, { small: true }, function (qrcodeStr) {
      console.log(qrcodeStr);
      console.log('\n(Press Ctrl+C to stop when the event is over)');
    });
  }
});

cloudflare.on('close', (code) => {
  console.log(`Cloudflare tunnel closed (Code: ${code})`);
});
