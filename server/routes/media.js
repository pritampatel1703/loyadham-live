const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   MEDIA MANAGER API — Upload, Browse, Tag, Playout
   ═══════════════════════════════════════════════════════════ */

// === Storage Directories ===
const MEDIA_ROOT = path.join(__dirname, '..', 'media_uploads');
const THUMB_DIR = path.join(MEDIA_ROOT, '_thumbnails');
const META_FILE = path.join(__dirname, '..', 'db', 'media_meta.json');

// Ensure directories exist
[MEDIA_ROOT, THUMB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// === In-Memory Media Database ===
let mediaFiles = [];
let mediaFolders = ['Intros', 'Bumpers', 'Graphics', 'Audio', 'Sponsors', 'Transitions', 'Credits', 'Uncategorized'];
let playlists = [];

function loadMetadata() {
  try {
    if (fs.existsSync(META_FILE)) {
      const data = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      mediaFiles = data.files || [];
      mediaFolders = data.folders || mediaFolders;
      playlists = data.playlists || [];
      // Verify files still exist on disk
      mediaFiles = mediaFiles.filter(f => {
        if (f.filePath && fs.existsSync(f.filePath)) return true;
        if (f.isDemo) return true; // Keep demo files
        return false;
      });
      console.log(`[MEDIA] Loaded ${mediaFiles.length} files, ${mediaFolders.length} folders`);
    }
  } catch (e) {
    console.log('[MEDIA] No saved metadata, starting fresh');
  }
}

function saveMetadata() {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify({ files: mediaFiles, folders: mediaFolders, playlists }, null, 2));
  } catch (e) {
    console.error('[MEDIA] Failed to save metadata:', e.message);
  }
}

// Load on startup
loadMetadata();

// Seed demo files if empty
if (mediaFiles.length === 0) {
  mediaFiles = [
    { id: 'm1', name: 'intro_loop.mp4', type: 'video', size: 45200000, duration: 15, folder: 'Intros', tags: ['intro', 'loop'], isDemo: true, created_at: '2025-09-10T10:00:00Z', filePath: null },
    { id: 'm2', name: 'bumper_transition.mp4', type: 'video', size: 12800000, duration: 3, folder: 'Bumpers', tags: ['bumper'], isDemo: true, created_at: '2025-09-10T10:00:00Z', filePath: null },
    { id: 'm3', name: 'lower_third_bg.png', type: 'image', size: 350000, duration: 0, folder: 'Graphics', tags: ['overlay'], isDemo: true, created_at: '2025-09-11T08:00:00Z', filePath: null },
    { id: 'm4', name: 'background_music.mp3', type: 'audio', size: 8500000, duration: 180, folder: 'Audio', tags: ['music', 'background'], isDemo: true, created_at: '2025-09-11T08:00:00Z', filePath: null },
    { id: 'm5', name: 'sponsor_logo.png', type: 'image', size: 180000, duration: 0, folder: 'Sponsors', tags: ['sponsor', 'logo'], isDemo: true, created_at: '2025-09-12T14:00:00Z', filePath: null },
    { id: 'm6', name: 'countdown_10s.mp4', type: 'video', size: 22000000, duration: 10, folder: 'Bumpers', tags: ['countdown'], isDemo: true, created_at: '2025-09-12T14:00:00Z', filePath: null },
    { id: 'm7', name: 'stinger_wipe.mov', type: 'video', size: 31000000, duration: 2, folder: 'Transitions', tags: ['transition', 'stinger'], isDemo: true, created_at: '2025-09-13T09:00:00Z', filePath: null },
    { id: 'm8', name: 'end_credits.mp4', type: 'video', size: 55000000, duration: 20, folder: 'Credits', tags: ['credits', 'end'], isDemo: true, created_at: '2025-09-13T09:00:00Z', filePath: null },
    { id: 'm9', name: 'ambient_sfx.wav', type: 'audio', size: 4200000, duration: 60, folder: 'Audio', tags: ['sfx', 'ambient'], isDemo: true, created_at: '2025-09-13T12:00:00Z', filePath: null },
    { id: 'm10', name: 'prayer_verse.png', type: 'image', size: 420000, duration: 0, folder: 'Graphics', tags: ['verse', 'religious'], isDemo: true, created_at: '2025-09-14T06:00:00Z', filePath: null },
  ];
  saveMetadata();
}

// === Multer Configuration ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'Uncategorized';
    const dir = path.join(MEDIA_ROOT, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Preserve original filename but prevent conflicts
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const uniqueName = `${base}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
  fileFilter: (req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv|webm|mxf|ts|mp3|wav|aac|flac|ogg|m4a|png|jpg|jpeg|gif|svg|bmp|tiff|tga|psd|exr/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: .${ext}`));
  }
});

function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (['mp4','mov','avi','mkv','webm','mxf','ts'].includes(ext)) return 'video';
  if (['mp3','wav','aac','flac','ogg','m4a'].includes(ext)) return 'audio';
  return 'image';
}

// ─── GET /api/media — List all files ───
router.get('/', (req, res) => {
  const { folder, search, sort, type } = req.query;
  let result = [...mediaFiles];

  if (folder && folder !== 'All') result = result.filter(f => f.folder === folder);
  if (type) result = result.filter(f => f.type === type);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(f => f.name.toLowerCase().includes(s) || (f.tags || []).some(t => t.toLowerCase().includes(s)));
  }

  if (sort === 'size') result.sort((a, b) => b.size - a.size);
  else if (sort === 'date') result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (sort === 'type') result.sort((a, b) => a.type.localeCompare(b.type));
  else result.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    files: result.map(f => ({
      id: f.id, name: f.name, type: f.type, size: f.size, duration: f.duration,
      folder: f.folder, tags: f.tags || [], isDemo: !!f.isDemo, created_at: f.created_at,
      hasFile: !!f.filePath,
      url: f.filePath ? `/api/media/file/${f.id}` : null,
    })),
    total: result.length,
    folders: mediaFolders,
  });
});

// ─── GET /api/media/folders — List folders with counts ───
router.get('/folders', (req, res) => {
  const counts = {};
  mediaFolders.forEach(f => { counts[f] = 0; });
  mediaFiles.forEach(f => { if (counts[f.folder] !== undefined) counts[f.folder]++; });
  res.json({
    folders: mediaFolders.map(f => ({ name: f, count: counts[f] || 0 })),
    total: mediaFiles.length,
  });
});

// ─── POST /api/media/folders — Create folder ───
router.post('/folders', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Folder name required' });
  const clean = name.trim();
  if (mediaFolders.includes(clean)) return res.status(409).json({ error: 'Folder already exists' });
  mediaFolders.push(clean);
  const dir = path.join(MEDIA_ROOT, clean);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  saveMetadata();
  res.json({ success: true, folder: clean, folders: mediaFolders });
});

// ─── DELETE /api/media/folders/:name — Delete folder (moves files to Uncategorized) ───
router.delete('/folders/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!mediaFolders.includes(name)) return res.status(404).json({ error: 'Folder not found' });
  if (['Uncategorized'].includes(name)) return res.status(400).json({ error: 'Cannot delete system folder' });
  
  // Move files to Uncategorized
  mediaFiles.forEach(f => { if (f.folder === name) f.folder = 'Uncategorized'; });
  mediaFolders = mediaFolders.filter(f => f !== name);
  saveMetadata();
  res.json({ success: true });
});

// ─── POST /api/media/upload — Upload files ───
router.post('/upload', upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const folder = req.body.folder || 'Uncategorized';
  const tagsRaw = req.body.tags || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const uploaded = req.files.map(file => {
    const id = `media-${uuid()}`;
    const mediaType = getMediaType(file.originalname);
    const entry = {
      id,
      name: file.originalname,
      type: mediaType,
      size: file.size,
      duration: 0, // Would need ffprobe for actual duration
      folder,
      tags,
      isDemo: false,
      created_at: new Date().toISOString(),
      filePath: file.path,
      diskName: file.filename,
    };
    mediaFiles.push(entry);
    return {
      id: entry.id, name: entry.name, type: entry.type, size: entry.size,
      folder: entry.folder, tags: entry.tags, created_at: entry.created_at,
      hasFile: true, url: `/api/media/file/${id}`,
    };
  });

  saveMetadata();

  // Emit via Socket.IO if available
  try {
    const io = req.app.get('io');
    if (io) io.emit('media:uploaded', { files: uploaded });
  } catch (_) {}

  res.json({ success: true, files: uploaded, count: uploaded.length });
});

// ─── GET /api/media/file/:id — Serve actual file ───
router.get('/file/:id', (req, res) => {
  const file = mediaFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  // If real file on disk, stream it
  if (file.filePath && fs.existsSync(file.filePath)) {
    const ext = path.extname(file.filePath).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.ts': 'video/mp2t',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
      '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
    };
    const stat = fs.statSync(file.filePath);
    const mime = mimeMap[ext] || 'application/octet-stream';

    // Support range requests for video/audio seeking
    const range = req.headers.range;
    if (range && (file.type === 'video' || file.type === 'audio')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(file.filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime,
      });
      return stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      });
      return fs.createReadStream(file.filePath).pipe(res);
    }
  }

  // Fallback for demo images: Return high-resolution broadcast SVG graphic
  if (file.type === 'image') {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    if (file.id === 'm3' || file.name.includes('lower_third')) {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="ltGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.96"/>
      <stop offset="70%" stop-color="#1e293b" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#334155" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="goldBar" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="15" flood-color="#000000" flood-opacity="0.7"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect x="80" y="850" width="760" height="120" rx="8" fill="url(#ltGrad)"/>
    <rect x="80" y="850" width="12" height="120" rx="4" fill="url(#goldBar)"/>
    <text x="120" y="905" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" letter-spacing="1.5">LOYADHAM BROADCAST</text>
    <text x="120" y="945" fill="#38bdf8" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" letter-spacing="1">LIVE STUDIO PRODUCTION • MEDIA PLAYOUT</text>
  </g>
</svg>`;
      return res.send(svg);
    }

    if (file.id === 'm5' || file.name.includes('sponsor')) {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">
  <defs>
    <linearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="goldG" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#fbbf24"/>
    </linearGradient>
  </defs>
  <rect width="600" height="200" rx="16" fill="url(#bgG)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
  <circle cx="90" cy="100" r="50" fill="url(#goldG)"/>
  <text x="90" y="112" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="38" font-weight="900">⚡</text>
  <text x="170" y="95" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="900" letter-spacing="2">PIXEL PERFECT</text>
  <text x="170" y="130" fill="#94a3b8" font-family="sans-serif" font-size="18" font-weight="700" letter-spacing="1.5">OFFICIAL MEDIA SPONSOR</text>
</svg>`;
      return res.send(svg);
    }

    if (file.id === 'm10' || file.name.includes('verse')) {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="verseBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.96"/>
    </linearGradient>
    <filter id="vShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="20" stdDeviation="25" flood-color="#000000" flood-opacity="0.8"/>
    </filter>
  </defs>
  <g filter="url(#vShadow)">
    <rect x="360" y="760" width="1200" height="220" rx="20" fill="url(#verseBg)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
    <text x="960" y="825" text-anchor="middle" fill="#f59e0b" font-family="sans-serif" font-size="36">🕉️</text>
    <text x="960" y="875" text-anchor="middle" fill="#ffffff" font-family="'Georgia', serif" font-size="32" font-weight="600" font-style="italic">
      "Whenever you are in doubt, meditate upon the divine light within."
    </text>
    <text x="960" y="930" text-anchor="middle" fill="#38bdf8" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="2">
      — LOYADHAM DAILY SPIRITUAL INSPIRATION
    </text>
  </g>
</svg>`;
      return res.send(svg);
    }

    // Generic demo image
    const genericSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <rect width="1920" height="1080" fill="#0f172a"/>
  <rect x="200" y="200" width="1520" height="680" rx="24" fill="#1e293b" stroke="#38bdf8" stroke-width="4"/>
  <text x="960" y="520" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="54" font-weight="900">${file.name}</text>
  <text x="960" y="590" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="28">MEDIA MANAGER • ACTIVE PLAYOUT</text>
</svg>`;
    return res.send(genericSvg);
  }

  // If video/audio demo file without disk asset
  res.status(200).json({
    isDemo: true,
    id: file.id,
    name: file.name,
    type: file.type,
    duration: file.duration,
    message: 'Demo media playout active'
  });
});

// ─── PUT /api/media/:id — Update file metadata ───
router.put('/:id', (req, res) => {
  const file = mediaFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const { name, folder, tags, duration } = req.body;
  if (name !== undefined) file.name = name;
  if (folder !== undefined) file.folder = folder;
  if (tags !== undefined) file.tags = Array.isArray(tags) ? tags : [];
  if (duration !== undefined) file.duration = duration;
  file.updated_at = new Date().toISOString();

  saveMetadata();
  res.json({ success: true, file: { id: file.id, name: file.name, folder: file.folder, tags: file.tags } });
});

// ─── POST /api/media/:id/tags — Add tag ───
router.post('/:id/tags', (req, res) => {
  const file = mediaFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ error: 'Tag required' });
  if (!file.tags) file.tags = [];
  if (!file.tags.includes(tag.toLowerCase())) file.tags.push(tag.toLowerCase());
  saveMetadata();
  res.json({ success: true, tags: file.tags });
});

// ─── DELETE /api/media/:id/tags/:tag — Remove tag ───
router.delete('/:id/tags/:tag', (req, res) => {
  const file = mediaFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  file.tags = (file.tags || []).filter(t => t !== req.params.tag);
  saveMetadata();
  res.json({ success: true, tags: file.tags });
});

// ─── DELETE /api/media/:id — Delete file ───
router.delete('/:id', (req, res) => {
  const idx = mediaFiles.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'File not found' });

  const file = mediaFiles[idx];
  // Delete from disk if real file
  if (file.filePath && fs.existsSync(file.filePath)) {
    try { fs.unlinkSync(file.filePath); } catch (_) {}
  }
  mediaFiles.splice(idx, 1);
  saveMetadata();

  try {
    const io = req.app.get('io');
    if (io) io.emit('media:deleted', { id: req.params.id });
  } catch (_) {}

  res.json({ success: true });
});

// ─── POST /api/media/:id/move — Move file to different folder ───
router.post('/:id/move', (req, res) => {
  const file = mediaFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'Target folder required' });

  // Move physical file if it exists
  if (file.filePath && fs.existsSync(file.filePath)) {
    const newDir = path.join(MEDIA_ROOT, folder);
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    const newPath = path.join(newDir, path.basename(file.filePath));
    try {
      fs.renameSync(file.filePath, newPath);
      file.filePath = newPath;
    } catch (e) {
      console.error('[MEDIA] Move failed:', e.message);
    }
  }

  file.folder = folder;
  saveMetadata();
  res.json({ success: true, file: { id: file.id, folder: file.folder } });
});

// ─── GET /api/media/playlists — List playlists ───
router.get('/playlists', (req, res) => {
  res.json({ playlists });
});

// ─── POST /api/media/playlists — Create/save a playlist ───
router.post('/playlists', (req, res) => {
  const { name, items } = req.body;
  if (!name) return res.status(400).json({ error: 'Playlist name required' });
  const playlist = {
    id: `pl-${uuid()}`,
    name,
    items: (items || []).map(item => ({
      mediaId: item.mediaId || item.id,
      name: item.name,
      type: item.type,
      duration: item.duration || 0,
    })),
    created_at: new Date().toISOString(),
  };
  playlists.push(playlist);
  saveMetadata();
  res.json({ success: true, playlist });
});

// ─── DELETE /api/media/playlists/:id — Delete playlist ───
router.delete('/playlists/:id', (req, res) => {
  playlists = playlists.filter(p => p.id !== req.params.id);
  saveMetadata();
  res.json({ success: true });
});

// ─── GET /api/media/stats — Storage usage stats ───
router.get('/stats', (req, res) => {
  const totalSize = mediaFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  const typeBreakdown = {};
  mediaFiles.forEach(f => {
    if (!typeBreakdown[f.type]) typeBreakdown[f.type] = { count: 0, size: 0 };
    typeBreakdown[f.type].count++;
    typeBreakdown[f.type].size += f.size || 0;
  });

  let diskUsage = 0;
  try {
    const calcDirSize = (dir) => {
      if (!fs.existsSync(dir)) return 0;
      let size = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) size += calcDirSize(full);
        else size += fs.statSync(full).size;
      });
      return size;
    };
    diskUsage = calcDirSize(MEDIA_ROOT);
  } catch (_) {}

  res.json({
    totalFiles: mediaFiles.length,
    totalSize,
    diskUsage,
    typeBreakdown,
    folderCount: mediaFolders.length,
  });
});

// ═══ Playout to Live Output (PGM) ═══
let currentLiveMedia = null;

router.get('/playout/current', (_req, res) => {
  res.json({ media: currentLiveMedia });
});

router.post('/playout/pgm', (req, res) => {
  const { fileId } = req.body;
  const file = mediaFiles.find(f => f.id === fileId);
  if (!file) return res.status(404).json({ error: 'Media file not found' });

  currentLiveMedia = file;
  const io = req.app.get('io');
  if (io) {
    io.emit('media:play', file);
    io.of('/production').emit('media:play', file);
  }
  res.json({ success: true, file });
});

router.post('/playout/stop', (req, res) => {
  currentLiveMedia = null;
  const io = req.app.get('io');
  if (io) {
    io.emit('media:stop');
    io.of('/production').emit('media:stop');
  }
  res.json({ success: true });
});

module.exports = router;
