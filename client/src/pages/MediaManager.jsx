import { useState, useRef, useEffect, useCallback } from 'react';
import { productionSocket } from '../socket';

/* ═══════════════════════════════════════════════════════════
   MEDIA MANAGER — Full Server-Backed File Manager & Playout
   ═══════════════════════════════════════════════════════════ */

const API = '/api/media';
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
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('All');
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [playlist, setPlaylist] = useState([]);
  const [playingIdx, setPlayingIdx] = useState(-1);
  const [sortBy, setSortBy] = useState('name');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [savedPlaylists, setSavedPlaylists] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [showSavePlaylist, setShowSavePlaylist] = useState(false);
  const [pgmMediaId, setPgmMediaId] = useState(null);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  // ─── Toast Helper ───
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    productionSocket.connect();
    const onMediaPlay = (f) => setPgmMediaId(f?.id || null);
    const onMediaStop = () => setPgmMediaId(null);
    productionSocket.on('media:play', onMediaPlay);
    productionSocket.on('media:stop', onMediaStop);
    return () => {
      productionSocket.off('media:play', onMediaPlay);
      productionSocket.off('media:stop', onMediaStop);
    };
  }, []);

  const sendToLivePgm = async (file) => {
    try {
      setPgmMediaId(file.id);
      productionSocket.emit('media:play', file);
      try {
        const bc = new BroadcastChannel('pixel_perfect_media');
        bc.postMessage({ type: 'play', file, timestamp: Date.now() });
      } catch (_) {}
      await fetch('/api/media/playout/pgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
      });
      showToast(`Now playing "${file.name}" live on PGM output!`, 'success');
    } catch (e) {
      console.error(e);
    }
  };

  const stopLivePgm = async () => {
    try {
      setPgmMediaId(null);
      productionSocket.emit('media:stop');
      try {
        const bc = new BroadcastChannel('pixel_perfect_media');
        bc.postMessage({ type: 'stop', timestamp: Date.now() });
      } catch (_) {}
      await fetch('/api/media/playout/stop', { method: 'POST' });
      showToast('Live media playout stopped', 'info');
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Fetch files from API ───
  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (folder !== 'All') params.set('folder', folder);
      if (searchTerm) params.set('search', searchTerm);
      if (sortBy) params.set('sort', sortBy);
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      setFiles(data.files || []);
      setFolders(data.folders || []);
    } catch (e) {
      console.error('[MEDIA] Fetch failed:', e);
    }
  }, [folder, searchTerm, sortBy]);

  // ─── Fetch stats ───
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      setStats(await res.json());
    } catch (_) {}
  }, []);

  // ─── Fetch saved playlists ───
  const fetchPlaylists = useCallback(async () => {
    try {
      const res = await fetch(`${API}/playlists`);
      const data = await res.json();
      setSavedPlaylists(data.playlists || []);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);
  useEffect(() => { fetchStats(); fetchPlaylists(); }, [fetchStats, fetchPlaylists]);

  // ─── Upload Files ───
  const uploadFiles = async (fileList, targetFolder) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    Array.from(fileList).forEach(f => formData.append('files', f));
    formData.append('folder', targetFolder || folder === 'All' ? 'Uncategorized' : folder);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      
      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            showToast(`✅ ${data.count} file${data.count > 1 ? 's' : ''} uploaded successfully`);
            resolve(data);
          } else {
            reject(new Error(xhr.responseText));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('POST', `${API}/upload`);
        xhr.send(formData);
      });

      fetchFiles();
      fetchStats();
    } catch (e) {
      showToast(`❌ Upload failed: ${e.message}`, 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Delete File ───
  const deleteFile = async (id) => {
    if (!confirm('Delete this file permanently?')) return;
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      showToast('🗑️ File deleted');
      if (selected === id) { setSelected(null); setPreviewUrl(null); }
      fetchFiles();
      fetchStats();
    } catch (e) {
      showToast('❌ Delete failed', 'error');
    }
  };

  // ─── Move File ───
  const moveFile = async (id, targetFolder) => {
    try {
      await fetch(`${API}/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: targetFolder }),
      });
      showToast(`📁 Moved to ${targetFolder}`);
      setMoveTarget(null);
      fetchFiles();
    } catch (e) {
      showToast('❌ Move failed', 'error');
    }
  };

  // ─── Rename File ───
  const renameFile = async (id, newName) => {
    try {
      await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      showToast('✏️ File renamed');
      setEditingFile(null);
      fetchFiles();
    } catch (_) { showToast('❌ Rename failed', 'error'); }
  };

  // ─── Add Tag ───
  const addTag = async (id, tag) => {
    if (!tag.trim()) return;
    try {
      await fetch(`${API}/${id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tag.trim() }),
      });
      setNewTag('');
      fetchFiles();
    } catch (_) {}
  };

  // ─── Remove Tag ───
  const removeTag = async (id, tag) => {
    try {
      await fetch(`${API}/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
      fetchFiles();
    } catch (_) {}
  };

  // ─── Create Folder ───
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await fetch(`${API}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      showToast(`📁 Folder "${newFolderName.trim()}" created`);
      setNewFolderName('');
      setShowNewFolder(false);
      fetchFiles();
    } catch (e) {
      showToast('❌ Failed to create folder', 'error');
    }
  };

  // ─── Delete Folder ───
  const deleteFolder = async (name) => {
    if (!confirm(`Delete folder "${name}"? Files will move to Uncategorized.`)) return;
    try {
      await fetch(`${API}/folders/${encodeURIComponent(name)}`, { method: 'DELETE' });
      showToast('🗑️ Folder deleted');
      if (folder === name) setFolder('All');
      fetchFiles();
    } catch (_) { showToast('❌ Delete failed', 'error'); }
  };

  // ─── Save Playlist ───
  const savePlaylist = async () => {
    if (!playlistName.trim() || playlist.length === 0) return;
    try {
      await fetch(`${API}/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playlistName.trim(), items: playlist }),
      });
      showToast(`💾 Playlist "${playlistName.trim()}" saved`);
      setPlaylistName('');
      setShowSavePlaylist(false);
      fetchPlaylists();
    } catch (_) { showToast('❌ Save failed', 'error'); }
  };

  // ─── Load Playlist ───
  const loadPlaylist = (pl) => {
    setPlaylist(pl.items.map(item => ({ ...item, plId: `pl-${Date.now()}-${Math.random().toString(36).slice(2,6)}` })));
    showToast(`📂 Loaded playlist "${pl.name}"`);
  };

  // ─── Delete Saved Playlist ───
  const deleteSavedPlaylist = async (id) => {
    try {
      await fetch(`${API}/playlists/${id}`, { method: 'DELETE' });
      fetchPlaylists();
    } catch (_) {}
  };

  // ─── Drag & Drop Handler ───
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      uploadFiles(droppedFiles);
    }
  };

  // ─── Playlist Ops ───
  const addToPlaylist = (file) => {
    setPlaylist(prev => [...prev, { ...file, mediaId: file.id, plId: `pl-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }]);
  };
  const removeFromPlaylist = (plId) => setPlaylist(prev => prev.filter(p => p.plId !== plId));
  const playNext = () => { if (playingIdx < playlist.length - 1) setPlayingIdx(playingIdx + 1); else setPlayingIdx(-1); };

  // ─── Preview ───
  const sel = selected ? files.find(f => f.id === selected) : null;
  useEffect(() => {
    if (sel && sel.hasFile && sel.url) setPreviewUrl(sel.url);
    else setPreviewUrl(null);
  }, [sel]);

  // ─── All files for stats ───
  const allCount = stats?.totalFiles || files.length;

  // ─── Get folder counts ───
  const getFolderCount = (f) => {
    if (f === 'All') return allCount;
    return files.filter(fi => fi.folder === f).length;
  };

  return (
    <div className="media-mgr">
      {/* Toast Notification */}
      {toast && (
        <div className={`media-toast ${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="media-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>📁 Media Manager</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>
            Browse, upload, organize, and play media files for broadcast
            {stats && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>• {stats.totalFiles} files • {formatBytes(stats.diskUsage || stats.totalSize)}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-input" style={{ width: 200, fontSize: '.78rem' }} placeholder="🔍 Search files & tags..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select className="form-input" style={{ width: 100, fontSize: '.75rem' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="date">Date</option>
            <option value="type">Type</option>
          </select>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('grid')}>▦</button>
            <button className={`btn btn-xs ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('list')}>☰</button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? `📤 ${uploadProgress}%` : '📤 Upload'}
          </button>
          <input ref={fileInputRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.mov,.mkv,.mxf,.ts,.flac,.ogg,.m4a,.svg,.tga,.psd,.exr"
            onChange={e => { if (e.target.files?.length) { uploadFiles(e.target.files); e.target.value = ''; } }} />
        </div>
      </div>

      {/* Upload Progress Bar */}
      {uploading && (
        <div className="media-upload-bar">
          <div className="media-upload-progress" style={{ width: `${uploadProgress}%` }} />
          <span className="media-upload-text">Uploading... {uploadProgress}%</span>
        </div>
      )}

      <div className="media-layout">
        {/* ─── Folder Sidebar ─── */}
        <div className="media-folders">
          <div className="media-folders-title">
            📂 Folders
            <button className="btn btn-xs btn-ghost" style={{ marginLeft: 'auto', fontSize: '.65rem' }} onClick={() => setShowNewFolder(!showNewFolder)}>+</button>
          </div>
          {showNewFolder && (
            <div style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
              <input className="form-input" style={{ flex: 1, fontSize: '.7rem', padding: '3px 6px' }} placeholder="Folder name..." value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} />
              <button className="btn btn-xs btn-primary" onClick={createFolder}>✓</button>
            </div>
          )}
          <button className={`media-folder-btn ${folder === 'All' ? 'active' : ''}`} onClick={() => setFolder('All')}>
            <span>🗂️</span><span>All</span>
            <span className="media-folder-count">{allCount}</span>
          </button>
          {folders.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center' }}>
              <button className={`media-folder-btn ${folder === f ? 'active' : ''}`} onClick={() => setFolder(f)} style={{ flex: 1 }}>
                <span>📁</span><span>{f}</span>
                <span className="media-folder-count">{getFolderCount(f)}</span>
              </button>
              {f !== 'Uncategorized' && folder === f && (
                <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444', fontSize: '.6rem', padding: 2 }} onClick={() => deleteFolder(f)} title="Delete folder">✕</button>
              )}
            </div>
          ))}

          {/* Storage Stats */}
          {stats && (
            <div className="media-storage-stats">
              <div className="media-storage-title">💾 Storage</div>
              {Object.entries(stats.typeBreakdown || {}).map(([type, data]) => (
                <div key={type} className="media-storage-row">
                  <span>{TYPE_ICONS[type]} {type}</span>
                  <span>{data.count} • {formatBytes(data.size)}</span>
                </div>
              ))}
              <div className="media-storage-row" style={{ fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
                <span>Total</span>
                <span>{formatBytes(stats.diskUsage || stats.totalSize)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Main Content Area ─── */}
        <div className="media-content"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}>

          {dragOver && (
            <div className="media-drop-overlay">
              <div className="media-drop-icon">📤</div>
              <div>Drop files to upload</div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Video, Audio, Images • Up to 2GB per file</div>
            </div>
          )}

          {files.length === 0 && !dragOver && (
            <div className="media-empty">
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 700 }}>No files found</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {searchTerm ? 'Try a different search term' : 'Upload files or drag & drop them here'}
              </div>
              {!searchTerm && (
                <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} onClick={() => fileInputRef.current?.click()}>
                  📤 Upload Files
                </button>
              )}
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="media-grid">
              {files.map(f => (
                <div key={f.id} className={`media-card ${selected === f.id ? 'selected' : ''}`}
                  onClick={() => setSelected(f.id)}
                  onDoubleClick={() => addToPlaylist(f)}>
                  <div className="media-card-thumb" style={{ background: TYPE_COLORS[f.type] + '10' }}>
                    {f.hasFile && f.type === 'image' ? (
                      <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <span style={{ fontSize: '2rem' }}>{TYPE_ICONS[f.type]}</span>
                    )}
                    {f.duration > 0 && <span className="media-card-duration">{formatDuration(f.duration)}</span>}
                    {f.isDemo && <span className="media-card-demo">DEMO</span>}
                  </div>
                  <div className="media-card-info">
                    <div className="media-card-name">{f.name}</div>
                    <div className="media-card-meta">{formatBytes(f.size)} • {f.folder}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="media-list">
              <div className="media-list-header">
                <span style={{ flex: 2 }}>Name</span><span style={{ flex: 1 }}>Type</span><span style={{ flex: 1 }}>Size</span><span style={{ flex: 1 }}>Duration</span><span style={{ flex: 1 }}>Folder</span><span style={{ width: 80 }}>Actions</span>
              </div>
              {files.map(f => (
                <div key={f.id} className={`media-list-row ${selected === f.id ? 'selected' : ''}`}
                  onClick={() => setSelected(f.id)} onDoubleClick={() => addToPlaylist(f)}>
                  <span style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{TYPE_ICONS[f.type]}</span>
                    {editingFile === f.id ? (
                      <input className="form-input" style={{ flex: 1, fontSize: '.75rem', padding: '2px 6px' }}
                        defaultValue={f.name} autoFocus
                        onBlur={e => renameFile(f.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameFile(f.id, e.target.value); if (e.key === 'Escape') setEditingFile(null); }} />
                    ) : (
                      <span style={{ cursor: 'pointer' }} onDoubleClick={(e) => { e.stopPropagation(); setEditingFile(f.id); }}>{f.name}</span>
                    )}
                    {f.isDemo && <span className="media-demo-badge">DEMO</span>}
                  </span>
                  <span style={{ flex: 1 }}><span className="media-type-badge" style={{ background: TYPE_COLORS[f.type] + '20', color: TYPE_COLORS[f.type] }}>{f.type}</span></span>
                  <span style={{ flex: 1 }}>{formatBytes(f.size)}</span>
                  <span style={{ flex: 1 }}>{formatDuration(f.duration)}</span>
                  <span style={{ flex: 1, fontSize: '.7rem', color: 'var(--text-muted)' }}>{f.folder}</span>
                  <span style={{ width: 80, display: 'flex', gap: 2 }}>
                    <button className="btn btn-xs btn-ghost" title="Add to playlist" onClick={(e) => { e.stopPropagation(); addToPlaylist(f); }}>➕</button>
                    <button className="btn btn-xs btn-ghost" title="Move" onClick={(e) => { e.stopPropagation(); setMoveTarget(f.id === moveTarget ? null : f.id); }}>📁</button>
                    <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} title="Delete" onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}>🗑️</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Move Modal */}
          {moveTarget && (
            <div className="media-move-modal">
              <div className="media-move-title">📁 Move to folder:</div>
              {folders.map(f => (
                <button key={f} className="btn btn-xs btn-outline" style={{ margin: 2 }} onClick={() => moveFile(moveTarget, f)}>{f}</button>
              ))}
              <button className="btn btn-xs btn-ghost" style={{ marginLeft: 8, color: '#ef4444' }} onClick={() => setMoveTarget(null)}>Cancel</button>
            </div>
          )}
        </div>

        {/* ─── Right Panel: Preview + Playlist ─── */}
        <div className="media-right">
          {/* Preview Panel */}
          <div className="media-preview">
            <div className="media-preview-title">👁️ Preview</div>
            {sel ? (
              <div className="media-preview-content">
                {/* Live preview for uploaded files */}
                {previewUrl && sel.type === 'image' && (
                  <div className="media-preview-thumb">
                    <img src={previewUrl} alt={sel.name} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius)' }} />
                  </div>
                )}
                {previewUrl && sel.type === 'video' && (
                  <div className="media-preview-thumb">
                    <video ref={videoRef} src={previewUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius)' }} />
                  </div>
                )}
                {previewUrl && sel.type === 'audio' && (
                  <div className="media-preview-thumb" style={{ background: TYPE_COLORS.audio + '10', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: '2.5rem' }}>🎵</span>
                    <audio ref={audioRef} src={previewUrl} controls style={{ width: '90%' }} />
                  </div>
                )}
                {!previewUrl && (
                  <div className="media-preview-thumb" style={{ background: TYPE_COLORS[sel.type] + '10' }}>
                    <span style={{ fontSize: '3rem' }}>{TYPE_ICONS[sel.type]}</span>
                    {sel.isDemo && <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 4 }}>Demo file — no preview</div>}
                  </div>
                )}
                <div className="media-preview-name">{sel.name}</div>
                <div className="media-preview-meta">
                  <span className="media-type-badge" style={{ background: TYPE_COLORS[sel.type] + '20', color: TYPE_COLORS[sel.type] }}>{sel.type}</span>
                  <span>{formatBytes(sel.size)}</span>
                  {sel.duration > 0 && <span>{formatDuration(sel.duration)}</span>}
                </div>

                {/* Tags */}
                <div className="media-preview-tags">
                  {(sel.tags || []).map(t => (
                    <span key={t} className="media-tag" onClick={() => removeTag(sel.id, t)} title="Click to remove">
                      {t} ✕
                    </span>
                  ))}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input className="form-input" style={{ flex: 1, fontSize: '.65rem', padding: '2px 6px' }}
                      placeholder="Add tag..." value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { addTag(sel.id, newTag); } }} />
                    <button className="btn btn-xs btn-outline" onClick={() => addTag(sel.id, newTag)}>+</button>
                  </div>
                </div>

                {/* Live PGM Playout Button */}
                <div style={{ marginTop: 8 }}>
                  {pgmMediaId === sel.id ? (
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ width: '100%', fontWeight: 700, animation: 'pulse 1.5s infinite' }}
                      onClick={stopLivePgm}
                    >
                      ⏹ STOP LIVE PGM PLAYOUT
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      style={{ width: '100%', background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#fff', fontWeight: 700 }}
                      onClick={() => sendToLivePgm(sel)}
                    >
                      📡 SEND TO LIVE PGM OUTPUT
                    </button>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => addToPlaylist(sel)}>+ Queue</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setEditingFile(sel.id)}>✏️</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setMoveTarget(sel.id)}>📁</button>
                  {sel.hasFile && (
                    <a href={sel.url} download={sel.name} className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }}>⬇️</a>
                  )}
                  <button className="btn btn-sm btn-outline" style={{ color: '#ef4444' }} onClick={() => deleteFile(sel.id)}>🗑️</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>
                Select a file to preview<br />
                <span style={{ fontSize: '.65rem' }}>Double-click to add to playlist</span>
              </div>
            )}
          </div>

          {/* ─── Playout Queue ─── */}
          <div className="media-playlist">
            <div className="media-playlist-header">
              <span>🎵 Playout Queue ({playlist.length})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {playlist.length > 0 && (
                  <>
                    <button className="btn btn-xs btn-outline" onClick={() => setShowSavePlaylist(!showSavePlaylist)}>💾</button>
                    <button className="btn btn-xs btn-outline" onClick={() => { setPlaylist([]); setPlayingIdx(-1); }}>Clear</button>
                  </>
                )}
              </div>
            </div>

            {/* Save Playlist Form */}
            {showSavePlaylist && (
              <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                <input className="form-input" style={{ flex: 1, fontSize: '.7rem', padding: '3px 6px' }}
                  placeholder="Playlist name..." value={playlistName}
                  onChange={e => setPlaylistName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && savePlaylist()} />
                <button className="btn btn-xs btn-primary" onClick={savePlaylist}>Save</button>
              </div>
            )}

            {/* Saved Playlists */}
            {savedPlaylists.length > 0 && playlist.length === 0 && (
              <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Saved Playlists:</div>
                {savedPlaylists.map(pl => (
                  <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.7rem', padding: '2px 0' }}>
                    <button className="btn btn-xs btn-ghost" onClick={() => loadPlaylist(pl)}>▶</button>
                    <span style={{ flex: 1 }}>{pl.name} ({pl.items.length})</span>
                    <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => deleteSavedPlaylist(pl.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {playlist.length === 0 && savedPlaylists.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>
                Double-click files to add to queue
              </div>
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
