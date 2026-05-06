const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { group, online, tag } = req.query;
    let devices;
    if (group) devices = await helpers.getDevicesByGroup(group);
    else if (online === '1') devices = await helpers.getOnlineDevices();
    else devices = await helpers.getAllDevices();
    
    // Fetch tags for all devices
    for (let d of devices) {
      const tags = await helpers.getDeviceTags(d.id);
      d.tags = tags.map(t => t.tag);
    }
    
    if (tag) devices = devices.filter(d => d.tags.includes(tag));
    res.json({ devices });
  } catch (err) { console.error('[DEVICES]', err); res.status(500).json({ error: 'Failed' }); }
});

router.get('/:id', authenticate, async (req, res) => {
  const device = await helpers.getDeviceById(req.params.id);
  if (!device) return res.status(404).json({ error: 'Not found' });
  const tags = await helpers.getDeviceTags(device.id);
  device.tags = tags.map(t => t.tag);
  res.json({ device });
});

router.post('/', authenticate, requireRole('operator'), async (req, res) => {
  try {
    const { name, label, group_name } = req.body;
    const id = uuidv4();
    const token = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
    await helpers.createDevice(id, name || 'Camera', label || '', group_name || 'Default', token);
    await helpers.addLog(null, 'device', 'system', `Device "${name || 'Camera'}" registered`, JSON.stringify({ device_id: id }));
    res.status(201).json({ id, name: name || 'Camera', pairing_token: token });
  } catch (err) { console.error('[DEVICES]', err); res.status(500).json({ error: 'Failed' }); }
});

router.put('/:id', authenticate, requireRole('operator'), async (req, res) => {
  const { name, label, group_name } = req.body;
  const d = await helpers.getDeviceById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  await helpers.updateDeviceInfo(name || d.name, label ?? d.label, group_name || d.group_name, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authenticate, requireRole('production_admin'), async (req, res) => {
  await helpers.deleteDevice(req.params.id);
  res.json({ success: true });
});

router.post('/:id/tags', authenticate, requireRole('operator'), async (req, res) => {
  await helpers.addDeviceTag(req.params.id, req.body.tag);
  res.json({ success: true });
});

router.delete('/:id/tags/:tag', authenticate, requireRole('operator'), async (req, res) => {
  await helpers.removeDeviceTag(req.params.id, req.params.tag);
  res.json({ success: true });
});

router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const d = await helpers.getDeviceById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    // Use SERVER_URL env var, or build from request host (works on LAN)
    const baseUrl = process.env.SERVER_URL || `${req.protocol}://${req.hostname}:${process.env.PORT || 3001}`;
    const cameraUrl = `${baseUrl}/camera?token=${d.pairing_token}`;
    const qr = await QRCode.toDataURL(cameraUrl, { width: 400, margin: 2, color: { dark: '#00f0ff', light: '#0a0e1a' } });
    res.json({ qr, pairing_token: d.pairing_token, camera_url: cameraUrl });
  } catch (err) { console.error('[DEVICES]', err); res.status(500).json({ error: 'QR failed' }); }
});

router.post('/pair', async (req, res) => {
  const { token, device_model, os_version, app_version } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  const d = await helpers.getDeviceByPairingToken(token);
  if (!d) return res.status(404).json({ error: 'Invalid token' });
  res.json({ device_id: d.id, device_name: d.name, message: 'Paired' });
});

router.post('/:id/tally', authenticate, requireRole('operator'), async (req, res) => {
  const { state } = req.body;
  if (!['off','preview','program'].includes(state)) return res.status(400).json({ error: 'Invalid state' });
  await helpers.updateTallyState(state, req.params.id);
  res.json({ success: true });
});

module.exports = router;
