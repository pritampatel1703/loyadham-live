const express = require('express');
const http = require('http');
const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   PTZ CAMERA CONTROL API
   Supports: VISCA-over-IP, ONVIF, CGI (Panasonic/Sony), Phone cameras
   ═══════════════════════════════════════════════════════════ */

// In-memory PTZ camera store
const ptzCameras = new Map();
const ptzPresets = new Map(); // cameraId -> preset[]

// Default demo cameras so the UI isn't empty
const DEFAULTS = [
  { id: 'ptz-1', name: 'Main Stage PTZ', model: 'PTZ Optics 30x', ip: '192.168.1.101', port: 80, protocol: 'VISCA', online: false, pan: 0, tilt: 0, zoom: 50, focus: 50, iris: 50 },
  { id: 'ptz-2', name: 'Balcony PTZ', model: 'Lumens VC-A61P', ip: '192.168.1.102', port: 80, protocol: 'ONVIF', online: false, pan: 0, tilt: 0, zoom: 35, focus: 50, iris: 50 },
  { id: 'ptz-3', name: 'Back Camera', model: 'BirdDog P200', ip: '192.168.1.103', port: 80, protocol: 'NDI', online: false, pan: 0, tilt: 0, zoom: 30, focus: 50, iris: 50 },
];

DEFAULTS.forEach(c => {
  ptzCameras.set(c.id, c);
  ptzPresets.set(c.id, [
    { id: 'p1', name: 'Wide Shot', pan: 0, tilt: 0, zoom: 20 },
    { id: 'p2', name: 'Close-up', pan: -15, tilt: 5, zoom: 80 },
    { id: 'p3', name: 'Left', pan: -45, tilt: -5, zoom: 40 },
    { id: 'p4', name: 'Right', pan: 45, tilt: -5, zoom: 40 },
  ]);
});

// Helper: send CGI command to IP PTZ camera
async function sendCgiCommand(cam, command) {
  return new Promise((resolve) => {
    const url = `http://${cam.ip}:${cam.port}/cgi-bin/aw_ptz?cmd=${encodeURIComponent(command)}&res=1`;
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ success: true, data }));
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
  });
}

// Convert pan/tilt/zoom percentages to VISCA hex commands
function viscaPanTilt(pan, tilt, speed = 5) {
  // VISCA pan-tilt absolute: 81 01 06 02 VV WW 0Y 0Y 0Y 0Y 0Z 0Z 0Z 0Z FF
  // Simplified CGI approach for VISCA-over-IP cameras
  const panHex = Math.round(((pan + 180) / 360) * 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
  const tiltHex = Math.round(((tilt + 90) / 180) * 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
  return `#APS${panHex}${tiltHex}${speed.toString(16).padStart(2, '0').toUpperCase()}`;
}

function viscaZoom(zoom) {
  const zoomHex = Math.round((zoom / 100) * 0x4000).toString(16).padStart(4, '0').toUpperCase();
  return `#AXZ${zoomHex}`;
}

// ── LIST ALL PTZ CAMERAS (includes phone cams from device list) ──
router.get('/cameras', async (req, res) => {
  try {
    const io = req.app.get('io');
    const { helpers } = require('../db/database');
    
    // Get registered phone cameras from devices
    let phoneCameras = [];
    try {
      const devices = await helpers.getAllDevices();
      phoneCameras = (devices || []).map(d => ({
        id: `phone-${d.id}`,
        name: d.name || `Camera ${d.id}`,
        model: 'Phone / Studio Camera',
        ip: d.ip_address || '',
        port: 0,
        protocol: 'WebRTC',
        online: !!d.is_online,
        isPhone: true,
        deviceId: d.id,
        pan: 0, tilt: 0, zoom: 50, focus: 50, iris: 50,
        battery: d.battery_percent,
        signal: d.signal_quality,
        fps: d.stream_fps,
        bitrate: d.stream_bitrate,
        resolution: d.stream_resolution,
      }));
    } catch (_) {}

    // Real registered devices first, then IP PTZ cameras
    const ipCameras = Array.from(ptzCameras.values());
    const allCameras = [...phoneCameras, ...ipCameras];
    
    res.json({ success: true, cameras: allCameras });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADD PTZ CAMERA ──
router.post('/cameras', (req, res) => {
  const { name, model, ip, port, protocol, streamUrl } = req.body;
  if (!name || !ip) return res.status(400).json({ success: false, error: 'Name and IP required' });
  
  const id = `ptz-${Date.now()}`;
  const cam = {
    id,
    name,
    model: model || 'Unknown',
    ip,
    port: port || 80,
    protocol: protocol || 'VISCA',
    streamUrl: streamUrl || '',
    online: false,
    pan: 0, tilt: 0, zoom: 50, focus: 50, iris: 50,
  };
  ptzCameras.set(id, cam);
  ptzPresets.set(id, []);
  res.json({ success: true, camera: cam });
});

// ── UPDATE PTZ CAMERA ──
router.put('/cameras/:id', (req, res) => {
  const cam = ptzCameras.get(req.params.id);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  Object.assign(cam, req.body);
  res.json({ success: true, camera: cam });
});

// ── DELETE PTZ CAMERA ──
router.delete('/cameras/:id', (req, res) => {
  if (!ptzCameras.has(req.params.id)) return res.status(404).json({ success: false, error: 'Camera not found' });
  ptzCameras.delete(req.params.id);
  ptzPresets.delete(req.params.id);
  res.json({ success: true });
});

// ── TEST CONNECTION ──
router.post('/cameras/:id/test', async (req, res) => {
  const cam = ptzCameras.get(req.params.id);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  try {
    const result = await sendCgiCommand(cam, '#O');
    cam.online = result.success;
    res.json({ success: true, online: result.success, response: result.data || result.error });
  } catch (err) {
    cam.online = false;
    res.json({ success: true, online: false, error: err.message });
  }
});

// ── MOVE (PAN/TILT) ──
router.post('/cameras/:id/move', async (req, res) => {
  const { pan, tilt, speed } = req.body;
  const camId = req.params.id;
  
  // Phone camera PTZ (digital pan/tilt via WebSocket)
  if (camId.startsWith('phone-')) {
    const deviceId = camId.replace('phone-', '');
    const io = req.app.get('io');
    io.of('/devices').emit('camera-cmd', { deviceId, cmd: 'ptz-move', payload: { pan, tilt, speed } });
    return res.json({ success: true, method: 'websocket' });
  }
  
  const cam = ptzCameras.get(camId);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  // Update in-memory state
  if (pan !== undefined) cam.pan = Math.max(-180, Math.min(180, pan));
  if (tilt !== undefined) cam.tilt = Math.max(-90, Math.min(90, tilt));
  
  // Send command to IP camera
  if (cam.protocol === 'VISCA' || cam.protocol === 'VISCA-over-IP' || cam.protocol === 'CGI') {
    const cmd = viscaPanTilt(cam.pan, cam.tilt, speed || 5);
    const result = await sendCgiCommand(cam, cmd);
    return res.json({ success: true, method: 'cgi', response: result });
  }
  
  res.json({ success: true, camera: cam });
});

// ── ZOOM ──
router.post('/cameras/:id/zoom', async (req, res) => {
  const { zoom } = req.body;
  const camId = req.params.id;
  
  if (camId.startsWith('phone-')) {
    const deviceId = camId.replace('phone-', '');
    const io = req.app.get('io');
    io.of('/devices').emit('camera-cmd', { deviceId, cmd: 'ptz-zoom', payload: { zoom } });
    return res.json({ success: true, method: 'websocket' });
  }
  
  const cam = ptzCameras.get(camId);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  cam.zoom = Math.max(0, Math.min(100, zoom));
  
  if (cam.protocol === 'VISCA' || cam.protocol === 'VISCA-over-IP' || cam.protocol === 'CGI') {
    const cmd = viscaZoom(cam.zoom);
    const result = await sendCgiCommand(cam, cmd);
    return res.json({ success: true, method: 'cgi', response: result });
  }
  
  res.json({ success: true, camera: cam });
});

// ── FOCUS ──
router.post('/cameras/:id/focus', async (req, res) => {
  const { focus, autoFocus } = req.body;
  const camId = req.params.id;
  
  if (camId.startsWith('phone-')) {
    const deviceId = camId.replace('phone-', '');
    const io = req.app.get('io');
    io.of('/devices').emit('camera-cmd', { deviceId, cmd: 'ptz-focus', payload: { focus, autoFocus } });
    return res.json({ success: true, method: 'websocket' });
  }
  
  const cam = ptzCameras.get(camId);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  if (focus !== undefined) cam.focus = Math.max(0, Math.min(100, focus));
  
  if (cam.protocol === 'VISCA' || cam.protocol === 'VISCA-over-IP' || cam.protocol === 'CGI') {
    const cmd = autoFocus ? '#D11' : `#AXF${Math.round((cam.focus / 100) * 0x4000).toString(16).padStart(4, '0').toUpperCase()}`;
    const result = await sendCgiCommand(cam, cmd);
    return res.json({ success: true, method: 'cgi', response: result });
  }
  
  res.json({ success: true, camera: cam });
});

// ── HOME POSITION ──
router.post('/cameras/:id/home', async (req, res) => {
  const camId = req.params.id;
  
  if (camId.startsWith('phone-')) {
    const deviceId = camId.replace('phone-', '');
    const io = req.app.get('io');
    io.of('/devices').emit('camera-cmd', { deviceId, cmd: 'ptz-home' });
    return res.json({ success: true, method: 'websocket' });
  }
  
  const cam = ptzCameras.get(camId);
  if (!cam) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  cam.pan = 0; cam.tilt = 0; cam.zoom = 50;
  
  if (cam.protocol === 'VISCA' || cam.protocol === 'VISCA-over-IP' || cam.protocol === 'CGI') {
    await sendCgiCommand(cam, '#APS00000000');
    await sendCgiCommand(cam, viscaZoom(50));
  }
  
  res.json({ success: true, camera: cam });
});

// ── PRESETS ──
router.get('/cameras/:id/presets', (req, res) => {
  let presets = ptzPresets.get(req.params.id);
  if (!presets || presets.length === 0) {
    presets = [
      { id: 'p1', name: 'Wide Shot', pan: 0, tilt: 0, zoom: 20 },
      { id: 'p2', name: 'Close-up Center', pan: 0, tilt: 5, zoom: 75 },
      { id: 'p3', name: 'Left Angle', pan: -35, tilt: -2, zoom: 35 },
      { id: 'p4', name: 'Right Angle', pan: 35, tilt: -2, zoom: 35 },
      { id: 'p5', name: 'Podium / Stage', pan: 0, tilt: 10, zoom: 60 },
      { id: 'p6', name: 'Audience Wide', pan: 0, tilt: -15, zoom: 15 },
    ];
    ptzPresets.set(req.params.id, presets);
  }
  res.json({ success: true, presets });
});

router.post('/cameras/:id/presets', (req, res) => {
  const { name, pan, tilt, zoom, focus } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name required' });
  
  const id = `preset-${Date.now()}`;
  const preset = { id, name, pan: pan || 0, tilt: tilt || 0, zoom: zoom || 50, focus: focus || 50 };
  
  if (!ptzPresets.has(req.params.id)) ptzPresets.set(req.params.id, []);
  ptzPresets.get(req.params.id).push(preset);
  
  res.json({ success: true, preset });
});

router.post('/cameras/:id/presets/:presetId/recall', async (req, res) => {
  const presets = ptzPresets.get(req.params.id) || [];
  const preset = presets.find(p => p.id === req.params.presetId);
  if (!preset) return res.status(404).json({ success: false, error: 'Preset not found' });
  
  const camId = req.params.id;
  
  if (camId.startsWith('phone-')) {
    const deviceId = camId.replace('phone-', '');
    const io = req.app.get('io');
    io.of('/devices').emit('camera-cmd', { deviceId, cmd: 'ptz-preset', payload: preset });
    return res.json({ success: true, preset, method: 'websocket' });
  }
  
  const cam = ptzCameras.get(camId);
  if (cam) {
    cam.pan = preset.pan; cam.tilt = preset.tilt; cam.zoom = preset.zoom;
    if (preset.focus !== undefined) cam.focus = preset.focus;
    
    if (cam.protocol === 'VISCA' || cam.protocol === 'VISCA-over-IP' || cam.protocol === 'CGI') {
      await sendCgiCommand(cam, viscaPanTilt(cam.pan, cam.tilt, 8));
      await sendCgiCommand(cam, viscaZoom(cam.zoom));
    }
  }
  
  res.json({ success: true, preset, camera: cam });
});

router.delete('/cameras/:id/presets/:presetId', (req, res) => {
  const presets = ptzPresets.get(req.params.id);
  if (!presets) return res.status(404).json({ success: false, error: 'Camera not found' });
  
  const idx = presets.findIndex(p => p.id === req.params.presetId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Preset not found' });
  
  presets.splice(idx, 1);
  res.json({ success: true });
});

module.exports = router;
