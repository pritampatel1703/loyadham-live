const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/realtime', authenticate, async (req, res) => {
  res.json({
    overview: { online_devices: (await helpers.countOnlineDevices())?.count||0, active_streams: (await helpers.countActiveStreams())?.count||0, total_devices: (await helpers.countTotalDevices())?.count||0 },
    devices: (await helpers.getOnlineDevices()).map(d => ({ id:d.id, name:d.name, battery:d.battery_percent, signal:d.signal_quality, resolution:d.stream_resolution, fps:d.stream_fps, bitrate:d.stream_bitrate, network:d.network_type })),
    streams: (await helpers.getActiveStreams()).map(s => ({ id:s.id, device_id:s.device_id, status:s.status, bitrate:s.bitrate, fps:s.fps, latency:s.latency_ms, packet_loss:s.packet_loss, uptime:s.uptime_seconds })),
    device_averages: await helpers.getAnalyticsSummary(),
  });
});

router.get('/history', authenticate, async (req, res) => {
  const { device_id, limit } = req.query;
  const max = Math.min(parseInt(limit)||100, 500);
  res.json({ snapshots: device_id ? await helpers.getDeviceAnalytics(device_id, max) : await helpers.getRecentAnalytics(max) });
});

router.post('/snapshot', async (req, res) => {
  const { device_id, stream_id, bitrate, fps, latency_ms, packet_loss, battery_percent, signal_quality, resolution } = req.body;
  await helpers.addSnapshot(device_id||null, stream_id||null, bitrate||0, fps||0, latency_ms||0, packet_loss||0, battery_percent||-1, signal_quality||-1, resolution||'');
  res.json({ success: true });
});

router.get('/logs', authenticate, async (req, res) => {
  const { type, event_id, limit } = req.query;
  const max = Math.min(parseInt(limit)||50, 200);
  let logs;
  if (event_id) logs = await helpers.getLogsByEvent(event_id, max);
  else if (type) logs = await helpers.getLogsByType(type, max);
  else logs = await helpers.getRecentLogs(max);
  res.json({ logs });
});

router.get('/dashboard', authenticate, async (req, res) => {
  res.json({
    stats: { online_devices: (await helpers.countOnlineDevices())?.count||0, total_devices: (await helpers.countTotalDevices())?.count||0, active_streams: (await helpers.countActiveStreams())?.count||0, total_events: (await helpers.countTotalEvents())?.count||0 },
    active_event: (await helpers.getActiveEvent())||null,
    scheduled_events: await helpers.getScheduledEvents(),
    recent_logs: await helpers.getRecentLogs(10),
  });
});

router.get('/settings', authenticate, requireRole('production_admin'), async (req, res) => {
  res.json({ settings: req.query.category ? await helpers.getSettingsByCategory(req.query.category) : await helpers.getAllSettings() });
});

router.put('/settings', authenticate, requireRole('super_admin'), async (req, res) => {
  const { key, value, category } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  await helpers.setSetting(key, value||'', category||'general');
  res.json({ success: true });
});

router.get('/layouts', authenticate, async (req, res) => {
  const layouts = await helpers.getAllLayouts();
  res.json({ layouts: layouts.map(l => ({ ...l, config: JSON.parse(l.config||'{}') })) });
});

router.post('/layouts', authenticate, requireRole('operator'), async (req, res) => {
  const { name, description, config } = req.body;
  const id = uuidv4();
  await helpers.createLayout(id, name||'Layout', description||'', JSON.stringify(config||{}), req.user.id);
  res.status(201).json({ id, name });
});

module.exports = router;
