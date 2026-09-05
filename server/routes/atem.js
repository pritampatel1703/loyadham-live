const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const AtemService = require('../services/atem-service');
const router = express.Router();
const atemInstances = new Map();

async function getAtem(id, io) {
  if (atemInstances.has(id)) {
    const inst = atemInstances.get(id);
    if (io && !inst.io) inst.setSocketIO(io);
    return inst;
  }
  const c = await helpers.getAtemById(id);
  if (!c) return null;
  const inst = new AtemService(c.ip, io);
  atemInstances.set(id, inst);
  return inst;
}

// ═══ Connection Management ═══

router.get('/connections', authenticate, async (req, res) => {
  try {
    const connections = await helpers.getAllAtemConnections();
    res.json({ connections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connections', authenticate, requireRole('production_admin'), async (req, res) => {
  try {
    const { name, ip } = req.body;
    const id = uuidv4();
    await helpers.createAtemConnection(id, name || 'Blackmagic ATEM', ip || '192.168.1.50');
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/connections/:id', authenticate, requireRole('production_admin'), async (req, res) => {
  try {
    const { name, ip, auto_reconnect } = req.body;
    await helpers.updateAtemConnection(name, ip, auto_reconnect ? 1 : 0, req.params.id);
    const existing = atemInstances.get(req.params.id);
    if (existing) {
      existing.disconnect();
      atemInstances.delete(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/connections/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    await helpers.deleteAtemConnection(req.params.id);
    const existing = atemInstances.get(req.params.id);
    if (existing) {
      existing.disconnect();
      atemInstances.delete(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Diagnostics & Status ═══

router.post('/:id/test', authenticate, requireRole('operator'), async (req, res) => {
  try {
    const io = req.app.get('io');
    const a = await getAtem(req.params.id, io);
    if (!a) return res.status(404).json({ error: 'ATEM connection not found' });

    const r = await a.testConnection();
    await helpers.updateAtemStatus(r.connected ? 1 : 0, r.model || '', req.params.id);
    if (!r.connected) await helpers.updateAtemError(r.error || '', req.params.id);

    await helpers.addLog(
      null,
      'atem',
      req.user.username,
      r.connected ? `Connected to ${r.model || 'ATEM'} (${a.ip})` : `Failed connecting to ATEM (${a.ip}): ${r.error}`,
      JSON.stringify(r)
    );

    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status', authenticate, async (req, res) => {
  try {
    const io = req.app.get('io');
    const a = await getAtem(req.params.id, io);
    if (!a) return res.status(404).json({ error: 'ATEM connection not found' });
    res.json(await a.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Live Production Actions ═══

router.post('/:id/action', authenticate, requireRole('operator'), async (req, res) => {
  try {
    const io = req.app.get('io');
    const a = await getAtem(req.params.id, io);
    if (!a) return res.status(404).json({ error: 'ATEM connection not found' });

    const { action, params } = req.body;
    const actions = {
      cut: () => a.cut(params?.me || 0),
      auto: () => a.auto(params?.me || 0),
      fadeToBlack: () => a.fadeToBlack(params?.me || 0),
      setProgram: () => a.setProgram(params?.input, params?.me || 0),
      setPreview: () => a.setPreview(params?.input, params?.me || 0),
      setTransitionStyle: () => a.setTransitionStyle(params?.style, params?.me || 0),
      setTransitionPosition: () => a.setTransitionPosition(params?.position, params?.me || 0),
      setDownstreamKey: () => a.setDownstreamKey(params?.onAir, params?.keyer || 0),
      startStreaming: () => a.startStreaming(),
      stopStreaming: () => a.stopStreaming(),
      startRecording: () => a.startRecording(),
      stopRecording: () => a.stopRecording(),
      runMacro: () => a.runMacro(params?.index),
      stopMacro: () => a.stopMacro(),
    };

    if (!actions[action]) {
      return res.status(400).json({ error: `Unknown ATEM action: ${action}` });
    }

    await actions[action]();
    await helpers.addLog(null, 'atem', req.user.username, `ATEM Action: ${action}`, JSON.stringify(params || {}));
    res.json({ success: true, action, status: a.getStatusSync() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
