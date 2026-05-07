const express = require('express');
const os = require('os');
const router = express.Router();

// Get local network IPs for camera setup
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// GET /api/rtmp/status — Check if RTMP server is enabled and get connection details
router.get('/status', (_req, res) => {
  const enabled = process.env.ENABLE_RTMP === 'true';
  const rtmpPort = process.env.RTMP_PORT || '1935';
  const httpPort = process.env.RTMP_HTTP_PORT || '8000';
  const localIPs = getLocalIPs();

  res.json({
    enabled,
    rtmpPort: parseInt(rtmpPort, 10),
    httpPort: parseInt(httpPort, 10),
    localIPs,
    rtmpUrl: enabled && localIPs.length > 0
      ? `rtmp://${localIPs[0].address}:${rtmpPort}/live`
      : null,
    flvBaseUrl: enabled && localIPs.length > 0
      ? `http://${localIPs[0].address}:${httpPort}/live`
      : null,
  });
});

// GET /api/rtmp/streams — List active RTMP streams
router.get('/streams', (_req, res) => {
  try {
    const { getActiveStreams } = require('../rtmp/rtmpServer');
    res.json({ streams: getActiveStreams() });
  } catch (e) {
    res.json({ streams: [] });
  }
});

module.exports = router;
