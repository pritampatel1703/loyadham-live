const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { helpers } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const switcherInstances = new Map();

// ═══ Manufacturer Service Map ═══
const SERVICE_MAP = {
  atem:       { file: '../services/atem-service',       name: 'Blackmagic ATEM',  protocol: 'udp',       defaultPort: 9910,  icon: '🎚️' },
  obs:        { file: '../services/obs-service',        name: 'OBS Studio',       protocol: 'websocket', defaultPort: 4455,  icon: '🖥️' },
  datavideo:  { file: '../services/datavideo-service',  name: 'Datavideo',        protocol: 'tcp',       defaultPort: 5728,  icon: '📺' },
  roland:     { file: '../services/roland-service',     name: 'Roland',           protocol: 'tcp',       defaultPort: 8023,  icon: '🎹' },
  tricaster:  { file: '../services/tricaster-service',  name: 'NewTek TriCaster', protocol: 'http',      defaultPort: 80,    icon: '🔺' },
  panasonic:  { file: '../services/panasonic-service',  name: 'Panasonic',        protocol: 'http',      defaultPort: 80,    icon: '🎥' },
  fora:       { file: '../services/fora-service',       name: 'FOR-A',            protocol: 'tcp',       defaultPort: 20001, icon: '🏭' },
  livestream: { file: '../services/livestream-service', name: 'Livestream/Mevo',  protocol: 'http',      defaultPort: 9090,  icon: '📡' },
  osee:       { file: '../services/osee-service',       name: 'OSEE GoStream',    protocol: 'tcp',       defaultPort: 9920,  icon: '🎚️' },
};

/**
 * Get or create a switcher service instance
 */
function getSwitcherInstance(conn) {
  if (switcherInstances.has(conn.id)) {
    return switcherInstances.get(conn.id);
  }

  const mfr = conn.manufacturer;
  const def = SERVICE_MAP[mfr];
  if (!def) return null;

  try {
    const ServiceClass = require(def.file);
    const config = typeof conn.config === 'string' ? JSON.parse(conn.config || '{}') : (conn.config || {});
    
    let instance;
    if (mfr === 'atem') {
      instance = new ServiceClass(conn.ip);
    } else if (mfr === 'obs') {
      instance = new ServiceClass(conn.ip, conn.port || def.defaultPort, config.password || '');
    } else {
      instance = new ServiceClass(conn.ip, conn.port || def.defaultPort);
    }
    
    switcherInstances.set(conn.id, instance);
    return instance;
  } catch (err) {
    console.error(`[Switchers] Failed to load service for ${mfr}: ${err.message}`);
    return null;
  }
}

// ═══ Manufacturer Info ═══
router.get('/manufacturers', authenticate, (_req, res) => {
  const manufacturers = Object.entries(SERVICE_MAP).map(([key, val]) => ({
    id: key,
    name: val.name,
    icon: val.icon,
    protocol: val.protocol,
    defaultPort: val.defaultPort,
  }));
  res.json({ manufacturers });
});

// ═══ Connection Management ═══

router.get('/connections', authenticate, async (req, res) => {
  try {
    const connections = await helpers.getAllSwitcherConnections();
    // Enrich with live connection state
    const enriched = connections.map(c => {
      const inst = switcherInstances.get(c.id);
      return {
        ...c,
        is_connected: inst ? (inst.connected ? 1 : 0) : c.is_connected,
        model: inst?.modelName || c.model || SERVICE_MAP[c.manufacturer]?.name || c.manufacturer,
        manufacturer_name: SERVICE_MAP[c.manufacturer]?.name || c.manufacturer,
        manufacturer_icon: SERVICE_MAP[c.manufacturer]?.icon || '🎛️',
      };
    });
    res.json({ connections: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connections', authenticate, requireRole('production_admin'), async (req, res) => {
  try {
    const { name, manufacturer, ip, port, config } = req.body;
    if (!manufacturer || !SERVICE_MAP[manufacturer]) {
      return res.status(400).json({ error: `Unknown manufacturer: ${manufacturer}. Supported: ${Object.keys(SERVICE_MAP).join(', ')}` });
    }
    const def = SERVICE_MAP[manufacturer];
    const id = uuidv4();
    await helpers.createSwitcherConnection(
      id,
      name || def.name,
      manufacturer,
      ip || '192.168.1.100',
      port || def.defaultPort,
      def.protocol,
      typeof config === 'object' ? JSON.stringify(config) : (config || '{}')
    );
    res.status(201).json({ id, manufacturer, name: name || def.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/connections/:id', authenticate, requireRole('production_admin'), async (req, res) => {
  try {
    const { name, ip, port, auto_reconnect, config } = req.body;
    await helpers.updateSwitcherConnection(
      name, ip, port,
      auto_reconnect !== undefined ? (auto_reconnect ? 1 : 0) : 1,
      typeof config === 'object' ? JSON.stringify(config) : (config || '{}'),
      req.params.id
    );
    // Disconnect and remove old instance
    const existing = switcherInstances.get(req.params.id);
    if (existing) {
      try { await existing.disconnect(); } catch { /* ignore */ }
      switcherInstances.delete(req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/connections/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const existing = switcherInstances.get(req.params.id);
    if (existing) {
      try { await existing.disconnect(); } catch { /* ignore */ }
      switcherInstances.delete(req.params.id);
    }
    await helpers.deleteSwitcherConnection(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Test / Connect ═══

router.post('/:id/test', authenticate, requireRole('operator'), async (req, res) => {
  try {
    const conn = await helpers.getSwitcherById(req.params.id);
    if (!conn) return res.status(404).json({ error: 'Switcher connection not found' });

    const inst = getSwitcherInstance(conn);
    if (!inst) return res.status(400).json({ error: `Could not load service for manufacturer: ${conn.manufacturer}` });

    const r = await inst.testConnection();
    await helpers.updateSwitcherStatus(r.connected ? 1 : 0, r.model || '', req.params.id);
    if (!r.connected) await helpers.updateSwitcherError(r.error || '', req.params.id);

    await helpers.addLog(
      null, 'switcher', req.user.username,
      r.connected
        ? `Connected to ${conn.manufacturer.toUpperCase()} ${r.model || conn.name} (${conn.ip}:${conn.port})`
        : `Failed connecting to ${conn.manufacturer.toUpperCase()} (${conn.ip}:${conn.port}): ${r.error}`,
      JSON.stringify({ manufacturer: conn.manufacturer, ...r })
    );

    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Status ═══

router.get('/:id/status', authenticate, async (req, res) => {
  try {
    const conn = await helpers.getSwitcherById(req.params.id);
    if (!conn) return res.status(404).json({ error: 'Switcher connection not found' });

    const inst = getSwitcherInstance(conn);
    if (!inst) return res.status(400).json({ error: `Could not load service for manufacturer: ${conn.manufacturer}` });

    if (inst.getStatus) {
      const r = await inst.getStatus();
      res.json(r);
    } else {
      res.json({ success: true, connected: inst.connected, status: inst.getStatusSync ? inst.getStatusSync() : {} });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ Unified Action Dispatch ═══

router.post('/:id/action', authenticate, requireRole('operator'), async (req, res) => {
  try {
    const conn = await helpers.getSwitcherById(req.params.id);
    if (!conn) return res.status(404).json({ error: 'Switcher connection not found' });

    const inst = getSwitcherInstance(conn);
    if (!inst) return res.status(400).json({ error: `Could not load service for manufacturer: ${conn.manufacturer}` });

    const { action, params } = req.body;

    const actions = {
      cut:                    () => inst.cut(),
      auto:                   () => inst.auto(),
      fadeToBlack:            () => inst.fadeToBlack(),
      setProgram:             () => inst.setProgram(params?.input),
      setPreview:             () => inst.setPreview(params?.input),
      setTransitionStyle:     () => inst.setTransitionStyle(params?.style),
      setTransitionPosition:  () => inst.setTransitionPosition(params?.position),
      startStreaming:          () => inst.startStreaming(),
      stopStreaming:           () => inst.stopStreaming(),
      startRecording:         () => inst.startRecording(),
      stopRecording:          () => inst.stopRecording(),
      // PiP (ATEM upstream keyer DVE)
      enablePiP:              () => inst.enablePiP?.(params?.source, params?.opts || {}, params?.keyer || 0),
      disablePiP:             () => inst.disablePiP?.(params?.keyer || 0),
      updatePiP:              () => inst.updatePiP?.(params?.opts || {}, params?.keyer || 0),
      setPiPSource:           () => inst.setPiPSource?.(params?.source, params?.keyer || 0),
    };

    if (!actions[action]) {
      return res.status(400).json({ error: `Unknown action: ${action}. Supported: ${Object.keys(actions).join(', ')}` });
    }

    const result = await actions[action]();

    await helpers.addLog(
      null, 'switcher', req.user.username,
      `${conn.manufacturer.toUpperCase()} Action: ${action}`,
      JSON.stringify({ manufacturer: conn.manufacturer, action, params: params || {} })
    );

    const currentStatus = inst.getStatusSync ? inst.getStatusSync() : {};
    res.json({ success: true, action, result, status: currentStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
