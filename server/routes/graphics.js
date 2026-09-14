const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   GRAPHICS ENGINE — Lower Thirds, Overlays, Titles, Tickers
   ═══════════════════════════════════════════════════════════ */

// In-memory store (falls back when DB offline)
let memTemplates = [
  // Pre-built starter templates
  {
    id: 'tpl-lower-third',
    name: 'Lower Third — Standard',
    type: 'lower-third',
    category: 'general',
    layers: {
      background: { type: 'rect', x: 0, y: 80, width: 100, height: 20, color: '#1a1a2e', opacity: 0.9, borderRadius: 0 },
      accentBar: { type: 'rect', x: 0, y: 80, width: 4, height: 20, color: '#6366f1', opacity: 1 },
      title: { type: 'text', x: 6, y: 84, text: 'Speaker Name', fontSize: 28, fontWeight: 'bold', color: '#ffffff', fontFamily: 'Inter' },
      subtitle: { type: 'text', x: 6, y: 92, text: 'Title / Designation', fontSize: 18, fontWeight: 'normal', color: '#94a3b8', fontFamily: 'Inter' },
    },
    animation: { in: 'slide-left', out: 'slide-left', duration: 500 },
    duration: 5000,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-breaking-news',
    name: 'Breaking News Banner',
    type: 'banner',
    category: 'news',
    layers: {
      background: { type: 'rect', x: 0, y: 85, width: 100, height: 15, color: '#dc2626', opacity: 0.95 },
      label: { type: 'text', x: 2, y: 87, text: 'BREAKING', fontSize: 20, fontWeight: '900', color: '#ffffff', fontFamily: 'Inter' },
      divider: { type: 'rect', x: 18, y: 86, width: 0.3, height: 13, color: '#ffffff', opacity: 0.5 },
      headline: { type: 'text', x: 20, y: 88, text: 'Headlines go here...', fontSize: 22, fontWeight: '600', color: '#ffffff', fontFamily: 'Inter' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 400 },
    duration: 8000,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-title-card',
    name: 'Full Screen Title',
    type: 'title',
    category: 'general',
    layers: {
      background: { type: 'rect', x: 0, y: 0, width: 100, height: 100, color: '#0f0f23', opacity: 0.85 },
      title: { type: 'text', x: 50, y: 40, text: 'Event Title', fontSize: 48, fontWeight: '900', color: '#ffffff', fontFamily: 'Inter', textAlign: 'center' },
      subtitle: { type: 'text', x: 50, y: 55, text: 'Subtitle or date', fontSize: 24, fontWeight: '400', color: '#94a3b8', fontFamily: 'Inter', textAlign: 'center' },
      line: { type: 'rect', x: 35, y: 50, width: 30, height: 0.3, color: '#6366f1', opacity: 1 },
    },
    animation: { in: 'fade', out: 'fade', duration: 600 },
    duration: 4000,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-scorebug-basic',
    name: 'Score Bug — Basic',
    type: 'score',
    category: 'sports',
    layers: {
      background: { type: 'rect', x: 2, y: 2, width: 25, height: 8, color: '#1e293b', opacity: 0.92, borderRadius: 8 },
      team1: { type: 'text', x: 4, y: 3.5, text: 'TEAM A', fontSize: 14, fontWeight: '800', color: '#ef4444', fontFamily: 'Inter' },
      score1: { type: 'text', x: 15, y: 3.5, text: '0', fontSize: 18, fontWeight: '900', color: '#ffffff', fontFamily: 'var(--mono)' },
      divider: { type: 'rect', x: 14, y: 3, width: 0.2, height: 6, color: '#475569', opacity: 1 },
      team2: { type: 'text', x: 4, y: 7, text: 'TEAM B', fontSize: 14, fontWeight: '800', color: '#3b82f6', fontFamily: 'Inter' },
      score2: { type: 'text', x: 15, y: 7, text: '0', fontSize: 18, fontWeight: '900', color: '#ffffff', fontFamily: 'var(--mono)' },
    },
    animation: { in: 'slide-down', out: 'slide-up', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-ticker',
    name: 'Scrolling Ticker',
    type: 'ticker',
    category: 'general',
    layers: {
      background: { type: 'rect', x: 0, y: 95, width: 100, height: 5, color: '#1e293b', opacity: 0.92 },
      text: { type: 'ticker', x: 0, y: 96, text: 'Welcome to the live broadcast! Stay tuned for updates...', fontSize: 18, color: '#ffffff', fontFamily: 'Inter', speed: 60 },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-verse',
    name: 'Verse / Quote Overlay',
    type: 'verse',
    category: 'religious',
    layers: {
      background: { type: 'rect', x: 10, y: 65, width: 80, height: 25, color: '#1a1a2e', opacity: 0.88, borderRadius: 12 },
      icon: { type: 'text', x: 50, y: 67, text: '🙏', fontSize: 28, textAlign: 'center' },
      verse: { type: 'text', x: 50, y: 73, text: 'Verse text here...', fontSize: 22, fontWeight: '500', color: '#e2e8f0', fontFamily: 'Inter', textAlign: 'center' },
      reference: { type: 'text', x: 50, y: 84, text: '— Reference', fontSize: 16, fontWeight: '400', color: '#94a3b8', fontFamily: 'Inter', textAlign: 'center', fontStyle: 'italic' },
    },
    animation: { in: 'fade', out: 'fade', duration: 800 },
    duration: 6000,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-clock',
    name: 'Live Clock Overlay',
    type: 'clock',
    category: 'utility',
    layers: {
      background: { type: 'rect', x: 85, y: 2, width: 14, height: 5, color: '#1e293b', opacity: 0.85, borderRadius: 8 },
      time: { type: 'clock', x: 92, y: 4, fontSize: 20, fontWeight: '700', color: '#ffffff', fontFamily: 'var(--mono)', format: 'HH:mm:ss' },
    },
    animation: { in: 'fade', out: 'fade', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-countdown-timer',
    name: 'Countdown Timer',
    type: 'timer',
    category: 'utility',
    layers: {
      background: { type: 'rect', x: 30, y: 40, width: 40, height: 20, color: '#0f172a', opacity: 0.9, borderRadius: 16 },
      label: { type: 'text', x: 50, y: 43, text: 'STARTING IN', fontSize: 14, fontWeight: '700', color: '#94a3b8', textAlign: 'center', letterSpacing: 3 },
      timer: { type: 'timer', x: 50, y: 52, fontSize: 48, fontWeight: '900', color: '#ffffff', fontFamily: 'var(--mono)', textAlign: 'center', targetTime: null },
    },
    animation: { in: 'scale', out: 'fade', duration: 500 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
];

let memPlaylists = [];

// Currently live graphics (broadcast via Socket.IO)
let liveGraphics = {};

// ═══ Templates CRUD ═══
router.get('/templates', (_req, res) => {
  res.json({ templates: memTemplates });
});

router.get('/templates/:id', (req, res) => {
  const tpl = memTemplates.find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: tpl });
});

router.post('/templates', (req, res) => {
  const { name, type, category, layers, animation, duration } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const tpl = {
    id: `tpl-${uuid().slice(0, 8)}`,
    name,
    type: type || 'lower-third',
    category: category || 'general',
    layers: layers || {},
    animation: animation || { in: 'fade', out: 'fade', duration: 500 },
    duration: duration || 5000,
    created_at: new Date().toISOString(),
  };
  memTemplates.push(tpl);
  res.json({ template: tpl });
});

router.put('/templates/:id', (req, res) => {
  const idx = memTemplates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  const updated = { ...memTemplates[idx], ...req.body, id: memTemplates[idx].id };
  memTemplates[idx] = updated;
  res.json({ template: updated });
});

router.delete('/templates/:id', (req, res) => {
  const idx = memTemplates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  memTemplates.splice(idx, 1);
  res.json({ ok: true });
});

// ═══ Show/Hide Graphics (broadcast via Socket.IO) ═══
router.post('/:id/show', (req, res) => {
  const tpl = memTemplates.find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  
  // Merge any runtime overrides (e.g., changing the speaker name)
  const override = req.body.override || {};
  const liveData = {
    ...tpl,
    layers: { ...tpl.layers },
    liveAt: new Date().toISOString(),
  };
  // Apply overrides to layer text
  for (const [layerKey, overrideVal] of Object.entries(override)) {
    if (liveData.layers[layerKey]) {
      liveData.layers[layerKey] = { ...liveData.layers[layerKey], ...overrideVal };
    }
  }

  liveGraphics[tpl.id] = liveData;

  // Broadcast to all connected clients
  const io = req.app.get('io');
  if (io) io.emit('graphic:show', liveData);

  // Auto-hide after duration
  if (tpl.duration > 0) {
    setTimeout(() => {
      delete liveGraphics[tpl.id];
      if (io) io.emit('graphic:hide', { id: tpl.id });
    }, tpl.duration);
  }

  res.json({ ok: true, live: liveData });
});

router.post('/:id/hide', (req, res) => {
  delete liveGraphics[req.params.id];
  const io = req.app.get('io');
  if (io) io.emit('graphic:hide', { id: req.params.id });
  res.json({ ok: true });
});

// ═══ Get all live graphics ═══
router.get('/live', (_req, res) => {
  res.json({ graphics: Object.values(liveGraphics) });
});

// ═══ Hide all graphics ═══
router.post('/hide-all', (req, res) => {
  liveGraphics = {};
  const io = req.app.get('io');
  if (io) io.emit('graphic:hide-all');
  res.json({ ok: true });
});

// ═══ Playlists ═══
router.get('/playlists', (_req, res) => {
  res.json({ playlists: memPlaylists });
});

router.post('/playlists', (req, res) => {
  const { name, items } = req.body;
  const pl = {
    id: `pl-${uuid().slice(0, 8)}`,
    name: name || 'Untitled Playlist',
    items: items || [],
    created_at: new Date().toISOString(),
  };
  memPlaylists.push(pl);
  res.json({ playlist: pl });
});

// ═══ Logo Bug ═══
let logoBug = null;

router.get('/logo', (_req, res) => {
  res.json({ logo: logoBug });
});

router.post('/logo', (req, res) => {
  const { url, position, size } = req.body;
  logoBug = {
    url: url || '',
    position: position || 'top-right',
    size: size || 80,
    enabled: true,
  };
  const io = req.app.get('io');
  if (io) io.emit('graphic:logo', logoBug);
  res.json({ logo: logoBug });
});

router.delete('/logo', (req, res) => {
  logoBug = null;
  const io = req.app.get('io');
  if (io) io.emit('graphic:logo', null);
  res.json({ ok: true });
});

module.exports = router;
