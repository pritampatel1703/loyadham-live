const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const streams = req.query.active === '1' ? helpers.getActiveStreams() : helpers.getAllStreams();
  res.json({ streams });
});
router.get('/:id', authenticate, (req, res) => {
  const s = helpers.getStreamById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ stream: s });
});
router.post('/', authenticate, requireRole('operator'), (req, res) => {
  const { device_id, endpoint_url, protocol, resolution, fps, bitrate, codec } = req.body;
  const id = uuidv4();
  helpers.createStream(id, device_id || null, endpoint_url || '', protocol || 'webrtc', 'connecting', resolution || '1920x1080', fps || 30, bitrate || 4000, codec || 'H264');
  helpers.addLog(null, 'stream', 'system', 'Stream started', JSON.stringify({ stream_id: id, device_id }));
  res.status(201).json({ id, status: 'connecting' });
});
router.put('/:id/status', authenticate, requireRole('operator'), (req, res) => {
  const { status, latency_ms, packet_loss, uptime_seconds } = req.body;
  helpers.updateStreamStatus(status, latency_ms||0, packet_loss||0, uptime_seconds||0, req.params.id);
  res.json({ success: true });
});
router.put('/:id/metrics', (req, res) => {
  const { bitrate, fps, latency_ms, packet_loss, resolution, uptime_seconds } = req.body;
  helpers.updateStreamMetrics(bitrate||0, fps||0, latency_ms||0, packet_loss||0, resolution||'', uptime_seconds||0, req.params.id);
  res.json({ success: true });
});
router.post('/:id/end', authenticate, requireRole('operator'), (req, res) => {
  helpers.endStream(req.params.id);
  helpers.addLog(null, 'stream', 'system', 'Stream ended', JSON.stringify({ stream_id: req.params.id }));
  res.json({ success: true });
});
module.exports = router;
