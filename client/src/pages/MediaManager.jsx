import { useState, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════
   MEDIA MANAGER — File Browser, Upload, Playout
   ═══════════════════════════════════════════════════════════ */

const DEMO_FILES = [
  { id: 'm1', name: 'intro_loop.mp4', type: 'video', size: 45200000, duration: 15, thumbnail: null, folder: 'Intros', created: '2025-09-10T10:00:00Z', tags: ['intro', 'loop'] },
  { id: 'm2', name: 'bumper_transition.mp4', type: 'video', size: 12800000, duration: 3, thumbnail: null, folder: 'Bumpers', created: '2025-09-10T10:00:00Z', tags: ['bumper'] },
  { id: 'm3', name: 'lower_third_bg.png', type: 'image', size: 350000, duration: 0, thumbnail: null, folder: 'Graphics', created: '2025-09-11T08:00:00Z', tags: ['overlay'] },
  { id: 'm4', name: 'background_music.mp3', type: 'audio', size: 8500000, duration: 180, thumbnail: null, folder: 'Audio', created: '2025-09-11T08:00:00Z', tags: ['music', 'background'] },
  { id: 'm5', name: 'sponsor_logo.png', type: 'image', size: 180000, duration: 0, thumbnail: null, folder: 'Sponsors', created: '2025-09-12T14:00:00Z', tags: ['sponsor', 'logo'] },
  { id: 'm6', name: 'countdown_10s.mp4', type: 'video', size: 22000000, duration: 10, thumbnail: null, folder: 'Bumpers', created: '2025-09-12T14:00:00Z', tags: ['countdown'] },
  { id: 'm7', name: 'stinger_wipe.mov', type: 'video', size: 31000000, duration: 2, thumbnail: null, folder: 'Transitions', created: '2025-09-13T09:00:00Z', tags: ['transition', 'stinger'] },
  { id: 'm8', name: 'end_credits.mp4', type: 'video', size: 55000000, duration: 20, thumbnail: null, folder: 'Credits', created: '2025-09-13T09:00:00Z', tags: ['credits', 'end'] },
  { id: 'm9', name: 'ambient_sfx.wav', type: 'audio', size: 4200000, duration: 60, thumbnail: null, folder: 'Audio', created: '2025-09-13T12:00:00Z', tags: ['sfx', 'ambient'] },
  { id: 'm10', name: 'prayer_verse.png', type: 'image', size: 420000, duration: 0, thumbnail: null, folder: 'Graphics', created: '2025-09-14T06:00:00Z', tags: ['verse', 'religious'] },
];

const FOLDERS = ['All', 'Intros', 'Bumpers', 'Graphics', 'Audio', 'Sponsors', 'Transitions', 'Credits'];

const TYPE_ICONS = { video: '🎬', image: '🖼️', audio: '🎵' };
const TYPE_COLORS = { video: '#3b82f6', image: '#8b5cf6', audio: '#f59e0b' };

const formatBytes = (b) => {
  if (!b) return '0 B';
  const k = 1024; const s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
};

const formatDuration = (sec) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function MediaManager() {
  const [files, setFiles] = useState(DEMO_FILES);
  const [folder, setFolder] = useState('All');
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [playlist, setPlaylist] = useState([]);
  const [playingIdx, setPlayingIdx] = useState(-1);
  const [sortBy, setSortBy] = useState('name');
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const filtered = files
    .filter(f => folder === 'All' || f.folder === folder)
    .filter(f => !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase()) || f.tags.some(t => t.includes(searchTerm.toLowerCase())))
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'size' ? b.size - a.size : new Date(b.created) - new Date(a.created));

  const addToPlaylist = (file) => {
    setPlaylist(prev => [...prev, { ...file, plId: `pl-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }]);
  };

  const removeFromPlaylist = (plId) => {
    setPlaylist(prev => prev.filter(p => p.plId !== plId));
  };

  const playNext = () => {
    if (playingIdx < playlist.length - 1) setPlayingIdx(playingIdx + 1);
    else setPlayingIdx(-1);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    droppedFiles.forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      const type = ['mp4','mov','avi','mkv','webm'].includes(ext) ? 'video' : ['mp3','wav','aac','flac'].includes(ext) ? 'audio' : 'image';
      setFiles(prev => [...prev, {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name: f.name, type, size: f.size, duration: 0,
        thumbnail: null, folder: 'All', created: new Date().toISOString(), tags: [],
      }]);
    });
  };

  const sel = selected ? files.find(f => f.id === selected) : null;

  return (
    <div className="media-mgr">
      <div className="media-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>📁 Media Manager</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Browse, organize, and play media files for broadcast</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 200, fontSize: '.78rem' }} placeholder="🔍 Search files..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select className="form-input" style={{ width: 100, fontSize: '.75rem' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="date">Date</option>
          </select>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('grid')}>▦</button>
            <button className={`btn btn-xs ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('list')}>☰</button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => fileInputRef.current?.click()}>📤 Upload</button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={e => { if(e.target.files) handleDrop({ preventDefault: ()=>{}, dataTransfer: { files: e.target.files } }); }} />
        </div>
      </div>

      <div className="media-layout">
        {/* Folder sidebar */}
        <div className="media-folders">
          <div className="media-folders-title">📂 Folders</div>
          {FOLDERS.map(f => (
            <button key={f} className={`media-folder-btn ${folder === f ? 'active' : ''}`} onClick={() => setFolder(f)}>
              <span>{f === 'All' ? '🗂️' : '📁'}</span><span>{f}</span>
              <span className="media-folder-count">{f === 'All' ? files.length : files.filter(fi => fi.folder === f).length}</span>
            </button>
          ))}
        </div>

        {/* Main content area */}
        <div className="media-content"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>

          {dragOver && (
            <div className="media-drop-overlay">
              <div className="media-drop-icon">📤</div>
              <div>Drop files to upload</div>
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="media-grid">
              {filtered.map(f => (
                <div key={f.id} className={`media-card ${selected === f.id ? 'selected' : ''}`} onClick={() => setSelected(f.id)} onDoubleClick={() => addToPlaylist(f)}>
                  <div className="media-card-thumb" style={{ background: TYPE_COLORS[f.type] + '10' }}>
                    <span style={{ fontSize: '2rem' }}>{TYPE_ICONS[f.type]}</span>
                    {f.duration > 0 && <span className="media-card-duration">{formatDuration(f.duration)}</span>}
                  </div>
                  <div className="media-card-info">
                    <div className="media-card-name">{f.name}</div>
                    <div className="media-card-meta">{formatBytes(f.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="media-list">
              <div className="media-list-header">
                <span style={{ flex: 2 }}>Name</span><span style={{ flex: 1 }}>Type</span><span style={{ flex: 1 }}>Size</span><span style={{ flex: 1 }}>Duration</span><span style={{ flex: 1 }}>Folder</span>
              </div>
              {filtered.map(f => (
                <div key={f.id} className={`media-list-row ${selected === f.id ? 'selected' : ''}`} onClick={() => setSelected(f.id)} onDoubleClick={() => addToPlaylist(f)}>
                  <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}><span>{TYPE_ICONS[f.type]}</span>{f.name}</span>
                  <span style={{ flex: 1 }}><span className="media-type-badge" style={{ background: TYPE_COLORS[f.type] + '20', color: TYPE_COLORS[f.type] }}>{f.type}</span></span>
                  <span style={{ flex: 1 }}>{formatBytes(f.size)}</span>
                  <span style={{ flex: 1 }}>{formatDuration(f.duration)}</span>
                  <span style={{ flex: 1, fontSize: '.7rem', color: 'var(--text-muted)' }}>{f.folder}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: Preview + Playlist */}
        <div className="media-right">
          {/* Preview */}
          <div className="media-preview">
            <div className="media-preview-title">👁️ Preview</div>
            {sel ? (
              <div className="media-preview-content">
                <div className="media-preview-thumb" style={{ background: TYPE_COLORS[sel.type] + '10' }}>
                  <span style={{ fontSize: '3rem' }}>{TYPE_ICONS[sel.type]}</span>
                </div>
                <div className="media-preview-name">{sel.name}</div>
                <div className="media-preview-meta">
                  <span>{sel.type}</span><span>{formatBytes(sel.size)}</span>{sel.duration > 0 && <span>{formatDuration(sel.duration)}</span>}
                </div>
                <div className="media-preview-tags">
                  {sel.tags.map(t => <span key={t} className="media-tag">{t}</span>)}
                </div>
                <button className="btn btn-sm btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => addToPlaylist(sel)}>+ Add to Playlist</button>
              </div>
            ) : <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>Select a file to preview</div>}
          </div>

          {/* Playlist */}
          <div className="media-playlist">
            <div className="media-playlist-header">
              <span>🎵 Playout Queue ({playlist.length})</span>
              {playlist.length > 0 && <button className="btn btn-xs btn-outline" onClick={() => setPlaylist([])}>Clear</button>}
            </div>
            {playlist.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>Double-click files to add</div>
            ) : (
              <div className="media-playlist-items">
                {playlist.map((p, i) => (
                  <div key={p.plId} className={`media-pl-item ${playingIdx === i ? 'playing' : ''}`}>
                    <span className="media-pl-num">{i + 1}</span>
                    <span className="media-pl-icon">{TYPE_ICONS[p.type]}</span>
                    <span className="media-pl-name">{p.name}</span>
                    <button className="btn btn-xs btn-ghost" style={{ color: '#4ade80' }} onClick={() => setPlayingIdx(i)}>▶</button>
                    <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => removeFromPlaylist(p.plId)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {playingIdx >= 0 && (
              <div className="media-pl-controls">
                <button className="btn btn-xs btn-outline" onClick={() => setPlayingIdx(Math.max(0, playingIdx - 1))}>⏮</button>
                <button className="btn btn-xs btn-danger" onClick={() => setPlayingIdx(-1)}>⏹</button>
                <button className="btn btn-xs btn-outline" onClick={playNext}>⏭</button>
                <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>Playing: {playlist[playingIdx]?.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
