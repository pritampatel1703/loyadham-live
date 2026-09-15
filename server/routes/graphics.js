const express = require('express');
const { v4: uuid } = require('uuid');
const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   GRAPHICS ENGINE — Lower Thirds, Overlays, Titles, Tickers
   ═══════════════════════════════════════════════════════════ */

// In-memory store (falls back when DB offline)
let memTemplates = [
  // ── 1. LOWER THIRDS ──
  {
    id: 'tpl-lt-executive',
    name: 'Executive Keynote — Frosted Glass',
    type: 'lower-third',
    category: 'keynote',
    layers: {
      accentBar: { color: '#f59e0b' },
      badge: { text: 'KEYNOTE SPEAKER' },
      title: { text: 'Dr. Arjun V. Mehta' },
      subtitle: { text: 'Chief Technology Officer • Global AI Research' },
    },
    animation: { in: 'slide-left', out: 'slide-left', duration: 450 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-lt-broadcast-news',
    name: 'Sky/CNN Broadcast News Lower Third',
    type: 'lower-third',
    category: 'news',
    layers: {
      accentBar: { color: '#ef4444' },
      badge: { text: 'LIVE • WASHINGTON DC' },
      title: { text: 'Sarah Jenkins' },
      subtitle: { text: 'Chief Political Correspondent, Global News' },
    },
    animation: { in: 'slide-left', out: 'slide-left', duration: 400 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-lt-satsang-spiritual',
    name: 'Loyadham Sacred Satsang Lower Third',
    type: 'lower-third',
    category: 'religious',
    layers: {
      accentBar: { color: '#f97316' },
      badge: { text: '🕉️ LOYADHAM GLOBAL SATSANG' },
      title: { text: 'Pujya Swami Niranjan Swarup Dasji' },
      subtitle: { text: 'Divine Satsang & Spiritual Discourses • Live from Loyadham' },
    },
    animation: { in: 'slide-left', out: 'fade', duration: 500 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-lt-cyber-neon',
    name: 'Cyber Esports Neon Lower Third',
    type: 'lower-third',
    category: 'esports',
    layers: {
      accentBar: { color: '#06b6d4' },
      badge: { text: 'PRO LEAGUE FINALIST' },
      title: { text: 'ALEX "VORTEX" CHEN' },
      subtitle: { text: 'Team Captain • Global Championship 2026' },
    },
    animation: { in: 'slide-left', out: 'slide-left', duration: 350 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-lt-social',
    name: 'Social Media & Channel Follower Bug',
    type: 'lower-third',
    category: 'social',
    layers: {
      accentBar: { color: '#38bdf8' },
      badge: { text: '▶ SUBSCRIBE & FOLLOW' },
      title: { text: '@LoyadhamLive' },
      subtitle: { text: 'YouTube • Instagram • X • www.loyadham.org' },
    },
    animation: { in: 'slide-left', out: 'slide-left', duration: 400 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-lt-minimal',
    name: 'Minimal Clean Line Studio Lower Third',
    type: 'lower-third',
    category: 'general',
    layers: {
      accentBar: { color: '#ffffff' },
      badge: { text: 'STUDIO GUEST' },
      title: { text: 'Elena Rostova' },
      subtitle: { text: 'Author & Documentary Filmmaker' },
    },
    animation: { in: 'slide-left', out: 'fade', duration: 400 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 2. BREAKING NEWS & BANNERS ──
  {
    id: 'tpl-breaking-news',
    name: 'Red Alert Breaking News Banner',
    type: 'banner',
    category: 'news',
    layers: {
      label: { text: 'BREAKING NEWS' },
      headline: { text: 'Live Global Broadcast in Session • Watch Continuous Live Coverage' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 350 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-banner-alert',
    name: 'Emergency / Important Notice Ribbon',
    type: 'banner',
    category: 'news',
    layers: {
      label: { text: 'URGENT NOTICE' },
      headline: { text: 'Special Announcement Scheduled for 8:00 PM • Please Stay Tuned' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 350 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-banner-event',
    name: 'Official Event Header Ribbon',
    type: 'banner',
    category: 'keynote',
    layers: {
      label: { text: 'ANNUAL SUMMIT' },
      headline: { text: 'International Broadcast Convention 2026 • Live Stream Feed' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 350 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 3. SPORTS & SCORE BUGS ──
  {
    id: 'tpl-scorebug-pro',
    name: 'Championship Broadcast Score Bug',
    type: 'score',
    category: 'sports',
    layers: {
      team1: { text: 'MUMBAI TITANS' },
      score1: { text: '3' },
      team2: { text: 'DELHI STRIKERS' },
      score2: { text: '2' },
      clock: { text: 'Q4 02:45' },
    },
    animation: { in: 'slide-down', out: 'slide-up', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-esports-matchup',
    name: 'Tournament Head-to-Head Card',
    type: 'score',
    category: 'esports',
    layers: {
      team1: { text: 'TEAM DRAGON' },
      score1: { text: '16' },
      team2: { text: 'TEAM PHOENIX' },
      score2: { text: '14' },
      clock: { text: 'MATCH POINT' },
    },
    animation: { in: 'slide-down', out: 'slide-up', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 4. TICKERS & MARQUEES ──
  {
    id: 'tpl-ticker',
    name: 'News & Information Ticker Marquee',
    type: 'ticker',
    category: 'general',
    layers: {
      label: { text: 'LIVE UPDATES' },
      text: { text: 'Welcome to Loyadham Live Global Broadcast • High Definition Multi-Camera Production • Share the stream with family and friends • Visit www.loyadham.org for upcoming schedule' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-ticker-donations',
    name: 'Donations & Supporter Roll Marquee',
    type: 'ticker',
    category: 'religious',
    layers: {
      label: { text: '❤️ SEVA DONATIONS' },
      text: { text: 'Special thanks to our generous donors: Patel Family (Ahmedabad) • Sharma Family (London) • Mehta Family (New Jersey) • Desai Family (Nairobi) • May God bless all seva donors' },
    },
    animation: { in: 'slide-up', out: 'slide-down', duration: 300 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 5. DEVOTIONAL & SCRIPTURE QUOTES ──
  {
    id: 'tpl-verse',
    name: 'Divine Shloka & Scripture Card',
    type: 'verse',
    category: 'religious',
    layers: {
      verse: { text: 'Whenever you find yourself in darkness, hold steadfast to the divine virtues of truth, compassion, and inner remembrance.' },
      reference: { text: '— Loyadham Divine Updesh • Vachanamrut Rahasya' },
    },
    animation: { in: 'fade', out: 'fade', duration: 600 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-quote-motivational',
    name: 'Keynote Inspirational Quote Card',
    type: 'verse',
    category: 'keynote',
    layers: {
      verse: { text: 'Innovation is not merely about creating new technology; it is about elevating humanity to new horizons of possibility.' },
      reference: { text: '— Visionary Keynote Address' },
    },
    animation: { in: 'fade', out: 'fade', duration: 600 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 6. FULL-SCREEN TITLE & CARDS ──
  {
    id: 'tpl-title-card',
    name: 'Cinematic Full-Screen Title Card',
    type: 'title',
    category: 'general',
    layers: {
      title: { text: 'LOYADHAM GLOBAL MAHA UTSAV 2026' },
      subtitle: { text: 'Celebrating 50 Years of Divine Harmony • Live Worldwide Transmission' },
    },
    animation: { in: 'fade', out: 'fade', duration: 700 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-schedule-upnext',
    name: 'Program Schedule / Up Next Card',
    type: 'title',
    category: 'general',
    layers: {
      title: { text: 'COMING UP NEXT: MAHA AARTI' },
      subtitle: { text: 'Scheduled at 7:30 PM IST • Followed by Cultural Youth Performances' },
    },
    animation: { in: 'fade', out: 'fade', duration: 700 },
    duration: 0,
    created_at: new Date().toISOString(),
  },

  // ── 7. COUNTDOWN TIMERS ──
  {
    id: 'tpl-countdown',
    name: '30-Second Pre-Show Countdown',
    type: 'countdown',
    category: 'utility',
    layers: {
      label: { text: 'STREAM STARTING IN' },
      subtitle: { text: 'Loyadham Live Studio • Prepare for Transmission' },
    },
    animation: { in: 'scale', out: 'fade', duration: 500 },
    duration: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tpl-countdown-10s',
    name: '10-Second Live Cue Countdown',
    type: 'countdown',
    category: 'utility',
    layers: {
      label: { text: 'GOING LIVE IN' },
      subtitle: { text: 'All Cameras Ready • Audio Synced' },
    },
    animation: { in: 'scale', out: 'fade', duration: 400 },
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
  if (io) {
    io.emit('graphic:show', liveData);
    io.of('/production').emit('graphic:show', liveData);
  }

  // Auto-hide after duration
  if (tpl.duration > 0) {
    setTimeout(() => {
      delete liveGraphics[tpl.id];
      if (io) {
        io.emit('graphic:hide', { id: tpl.id });
        io.of('/production').emit('graphic:hide', { id: tpl.id });
      }
    }, tpl.duration);
  }

  res.json({ ok: true, live: liveData });
});

router.post('/:id/hide', (req, res) => {
  delete liveGraphics[req.params.id];
  const io = req.app.get('io');
  if (io) {
    io.emit('graphic:hide', { id: req.params.id });
    io.of('/production').emit('graphic:hide', { id: req.params.id });
  }
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
  if (io) {
    io.emit('graphic:hide-all');
    io.of('/production').emit('graphic:hide-all');
  }
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
  if (io) {
    io.emit('graphic:logo', logoBug);
    io.of('/production').emit('graphic:logo', logoBug);
  }
  res.json({ logo: logoBug });
});

router.delete('/logo', (req, res) => {
  logoBug = null;
  const io = req.app.get('io');
  if (io) {
    io.emit('graphic:logo', null);
    io.of('/production').emit('graphic:logo', null);
  }
  res.json({ ok: true });
});

module.exports = router;
