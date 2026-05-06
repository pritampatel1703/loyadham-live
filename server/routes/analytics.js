const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/realtime', authenticate, (req, res) => {
  res.json({
    overview: { online_devices: helpers.countOnlineDevices()?.count||0, active_streams: helpers.countActiveStreams()?.count||0, total_devices: helpers.countTotalDevices()?.count||0 },
    devices: helpers.getOnlineDevices().map(d => ({ id:d.id, name:d.name, battery:d.battery_percent, signal:d.signal_quality, resolution:d.stream_resolution, fps:d.stream_fps, bitrate:d.stream_bitrate, network:d.network_type })),
    streams: helpers.getActiveStreams().map(s => ({ id:s.id, device_id:s.device_id, status:s.status, bitrate:s.bitrate, fps:s.fps, latency:s.latency_ms, packet_loss:s.packet_loss, uptime:s.uptime_seconds })),
    device_averages: helpers.getAnalyticsSummary(),
  });
});

router.get('/history', authenticate, (req, res) => {
  const { device_id, limit } = req.query;
  const max = Math.min(parseInt(limit)||100, 500);
  res.json({ snapshots: device_id ? helpers.getDeviceAnalytics(device_id, max) : helpers.getRecentAnalytics(max) });
});

router.post('/snapshot', (req, res) => {
  const { device_id, stream_id, bitrate, fps, latency_ms, packet_loss, battery_percent, signal_quality, resolution } = req.body;
  helpers.addSnapshot(device_id||null, stream_id||null, bitrate||0, fps||0, latency_ms||0, packet_loss||0, battery_percent||-1, signal_quality||-1, resolution||'');
  res.json({ success: true });
});

router.get('/logs', authenticate, (req, res) => {
  const { type, event_id, limit } = req.query;
  const max = Math.min(parseInt(limit)||50, 200);
  let logs;
  if (event_id) logs = helpers.getLogsByEvent(event_id, max);
  else if (type) logs = helpers.getLogsByType(type, max);
  else logs = helpers.getRecentLogs(max);
  res.json({ logs });
});

router.get('/dashboard', authenticate, (req, res) => {
  res.json({
    stats: { online_devices: helpers.countOnlineDevices()?.count||0, total_devices: helpers.countTotalDevices()?.count||0, active_streams: helpers.countActiveStreams()?.count||0, total_events: helpers.countTotalEvents()?.count||0 },
    active_event: helpers.getActiveEvent()||null,
    scheduled_events: helpers.getScheduledEvents(),
    recent_logs: helpers.getRecentLogs(10),
  });
});

router.get('/settings', authenticate, requireRole('production_admin'), (req, res) => {
  res.json({ settings: req.query.category ? helpers.getSettingsByCategory(req.query.category) : helpers.getAllSettings() });
});

router.put('/settings', authenticate, requireRole('super_admin'), (req, res) => {
  const { key, value, category } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  helpers.setSetting(key, value||'', category||'general');
  res.json({ success: true });
});

router.get('/layouts', authenticate, (req, res) => {
  res.json({ layouts: helpers.getAllLayouts().map(l => ({ ...l, config: JSON.parse(l.config||'{}') })) });
});

router.post('/layouts', authenticate, requireRole('operator'), (req, res) => {
  const { name, description, config } = req.body;
  const id = uuidv4();
  helpers.createLayout(id, name||'Layout', description||'', JSON.stringify(config||{}), req.user.id);
  res.status(201).json({ id, name });
});

module.exports = router;
