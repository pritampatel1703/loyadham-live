import { useState, useEffect, useRef } from 'react';
import { graphicsApi } from '../api/client';
import { productionSocket } from '../socket';

/* ═══════════════════════════════════════════════════════════
   GRAPHICS ENGINE — Lower Thirds, Overlays, Titles, Tickers
   ═══════════════════════════════════════════════════════════ */

const TYPE_META = {
  'lower-third': { icon: '📝', label: 'Lower Third', color: '#6366f1' },
  'banner':      { icon: '📰', label: 'Banner',      color: '#dc2626' },
  'title':       { icon: '🎬', label: 'Title Card',   color: '#8b5cf6' },
  'score':       { icon: '🏆', label: 'Score Bug',    color: '#f59e0b' },
  'ticker':      { icon: '📊', label: 'Ticker',       color: '#06b6d4' },
  'verse':       { icon: '🙏', label: 'Verse/Quote',  color: '#10b981' },
  'clock':       { icon: '🕐', label: 'Clock',        color: '#64748b' },
  'timer':       { icon: '⏱️', label: 'Timer',        color: '#f43f5e' },
};

const CATEGORIES = ['all', 'general', 'news', 'sports', 'religious', 'utility'];

const ANIMATIONS = [
  { id: 'fade', label: 'Fade' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-right', label: 'Slide Right' },
  { id: 'slide-up', label: 'Slide Up' },
  { id: 'slide-down', label: 'Slide Down' },
  { id: 'scale', label: 'Scale' },
  { id: 'typewriter', label: 'Typewriter' },
];

export default function Graphics() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('library');
  const [selectedTpl, setSelectedTpl] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [filterCat, setFilterCat] = useState('all');
  const [liveGraphics, setLiveGraphics] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [quickTexts, setQuickTexts] = useState({});
  const previewRef = useRef(null);

  const load = async () => {
    try {
      const res = await graphicsApi.templates();
      setTemplates(res.templates || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    productionSocket.connect();
    return () => {};
  }, []);

  const filteredTemplates = templates.filter(t => filterCat === 'all' || t.category === filterCat);

  const showGraphic = async (tpl, override = {}) => {
    const liveItem = { ...tpl, layers: { ...tpl.layers, ...override }, liveAt: Date.now() };
    try {
      // Local and socket immediate broadcast
      productionSocket.emit('graphic:show', liveItem);
      try {
        const bc = new BroadcastChannel('pixel_perfect_graphics');
        bc.postMessage({ type: 'show', graphic: liveItem, timestamp: Date.now() });
      } catch (_) {}

      await graphicsApi.show(tpl.id, override);
      setLiveGraphics(prev => [...prev.filter(g => g.id !== tpl.id), liveItem]);
      if (tpl.duration > 0) {
        setTimeout(() => setLiveGraphics(prev => prev.filter(g => g.id !== tpl.id)), tpl.duration);
      }
    } catch (e) { console.error(e); }
  };

  const hideGraphic = async (id) => {
    try {
      productionSocket.emit('graphic:hide', { id });
      try {
        const bc = new BroadcastChannel('pixel_perfect_graphics');
        bc.postMessage({ type: 'hide', id, timestamp: Date.now() });
      } catch (_) {}

      await graphicsApi.hide(id);
      setLiveGraphics(prev => prev.filter(g => g.id !== id));
    } catch (e) { console.error(e); }
  };

  const saveTemplate = async () => {
    try {
      if (editData.id) {
        await graphicsApi.updateTemplate(editData.id, editData);
      } else {
        await graphicsApi.saveTemplate(editData);
      }
      setEditMode(false);
      setEditData({});
      load();
    } catch (e) { console.error(e); }
  };

  const deleteTemplate = async (id) => {
    try {
      await graphicsApi.deleteTemplate(id);
      if (selectedTpl?.id === id) setSelectedTpl(null);
      load();
    } catch (e) { console.error(e); }
  };

  // Render preview of a graphic template on canvas
  const renderPreview = (tpl) => {
    if (!tpl?.layers) return null;
    return (
      <div className="gfx-preview-canvas" style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#111827', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {/* Simulated video background */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '3rem', opacity: 0.15 }}>📹</span>
        </div>
        {/* Render layers */}
        {Object.entries(tpl.layers).map(([key, layer]) => {
          if (layer.type === 'rect') {
            return (
              <div key={key} style={{
                position: 'absolute',
                left: `${layer.x}%`, top: `${layer.y}%`,
                width: `${layer.width}%`, height: `${layer.height}%`,
                background: layer.color,
                opacity: layer.opacity || 1,
                borderRadius: layer.borderRadius || 0,
              }}></div>
            );
          }
          if (layer.type === 'text' || layer.type === 'ticker' || layer.type === 'clock' || layer.type === 'timer') {
            return (
              <div key={key} style={{
                position: 'absolute',
                left: `${layer.x}%`, top: `${layer.y}%`,
                transform: layer.textAlign === 'center' ? 'translateX(-50%)' : 'none',
                fontSize: `${layer.fontSize * 0.4}px`,
                fontWeight: layer.fontWeight || 'normal',
                fontStyle: layer.fontStyle || 'normal',
                color: layer.color,
                fontFamily: layer.fontFamily || 'Inter',
                letterSpacing: layer.letterSpacing ? `${layer.letterSpacing}px` : 'normal',
                whiteSpace: 'nowrap',
              }}>
                {layer.type === 'clock' ? new Date().toLocaleTimeString() : layer.text}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading Graphics Engine…</h3></div>;

  return (
    <div className="gfx-engine">
      {/* Header */}
      <div className="gfx-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🎨 Graphics Engine</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>
            Create and control broadcast graphics, lower thirds, titles, and overlays.
          </p>
        </div>
        <div className="gfx-header-actions">
          <button className="btn btn-sm btn-primary" onClick={() => { setEditMode(true); setEditData({ name: '', type: 'lower-third', category: 'general', layers: {}, animation: { in: 'fade', out: 'fade', duration: 500 }, duration: 5000 }); }}>
            + New Graphic
          </button>
          {liveGraphics.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={async () => { try { const r = await fetch('/api/graphics/hide-all', { method: 'POST' }); setLiveGraphics([]); } catch(e){} }}>
              ⏹ Hide All ({liveGraphics.length})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="gfx-tabs">
        {['library', 'live', 'quickplay'].map(t => (
          <button key={t} className={`gfx-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'library' && '📚 Template Library'}
            {t === 'live' && `📡 On Air (${liveGraphics.length})`}
            {t === 'quickplay' && '⚡ Quick Play'}
          </button>
        ))}
      </div>

      {/* ═══ Library Tab ═══ */}
      {activeTab === 'library' && (
        <div className="gfx-library">
          {/* Category Filter */}
          <div className="gfx-category-bar">
            {CATEGORIES.map(c => (
              <button key={c} className={`gfx-cat-btn ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)}>
                {c === 'all' ? '🗂️ All' : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>

          <div className="gfx-library-grid">
            {/* Template cards */}
            <div className="gfx-template-list">
              {filteredTemplates.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎨</div>
                  <p>No templates in this category</p>
                </div>
              ) : (
                filteredTemplates.map(tpl => {
                  const meta = TYPE_META[tpl.type] || { icon: '📄', label: tpl.type, color: '#64748b' };
                  return (
                    <div key={tpl.id}
                      className={`gfx-template-card ${selectedTpl?.id === tpl.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTpl(tpl)}>
                      <div className="gfx-tpl-preview-mini">
                        {renderPreview(tpl)}
                      </div>
                      <div className="gfx-tpl-info">
                        <div className="gfx-tpl-name">{tpl.name}</div>
                        <div className="gfx-tpl-meta">
                          <span className="gfx-tpl-type" style={{ background: meta.color + '20', color: meta.color }}>{meta.icon} {meta.label}</span>
                          <span className="gfx-tpl-cat">{tpl.category}</span>
                        </div>
                      </div>
                      <div className="gfx-tpl-actions">
                        <button className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); showGraphic(tpl); }} title="Show on air">
                          ▶
                        </button>
                        <button className="btn btn-xs btn-outline" onClick={(e) => { e.stopPropagation(); setEditMode(true); setEditData({...tpl}); }} title="Edit">
                          ✏️
                        </button>
                        <button className="btn btn-xs btn-outline" onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }} title="Delete" style={{ color: '#ef4444' }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Preview Panel */}
            <div className="gfx-preview-panel">
              {selectedTpl ? (
                <>
                  <div className="gfx-preview-title">
                    <span>{selectedTpl.name}</span>
                    <span className="gfx-preview-badge" style={{ background: (TYPE_META[selectedTpl.type]?.color || '#64748b') + '20', color: TYPE_META[selectedTpl.type]?.color || '#64748b' }}>
                      {TYPE_META[selectedTpl.type]?.icon} {TYPE_META[selectedTpl.type]?.label}
                    </span>
                  </div>
                  {renderPreview(selectedTpl)}

                  {/* Quick edit text fields */}
                  <div className="gfx-quick-edit">
                    <div className="gfx-quick-edit-title">Quick Edit Text</div>
                    {Object.entries(selectedTpl.layers || {}).filter(([, l]) => l.type === 'text' || l.type === 'ticker').map(([key, layer]) => (
                      <div key={key} className="gfx-quick-field">
                        <label>{key}</label>
                        <input type="text"
                          className="form-input"
                          value={quickTexts[key] ?? layer.text}
                          onChange={e => setQuickTexts(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={layer.text}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Animation info */}
                  <div className="gfx-anim-info">
                    <span>In: {selectedTpl.animation?.in || 'fade'}</span>
                    <span>Out: {selectedTpl.animation?.out || 'fade'}</span>
                    <span>Duration: {selectedTpl.duration ? `${selectedTpl.duration / 1000}s` : 'Persistent'}</span>
                  </div>

                  {/* Show button */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
                      const override = {};
                      for (const [key, val] of Object.entries(quickTexts)) {
                        override[key] = { text: val };
                      }
                      showGraphic(selectedTpl, override);
                    }}>
                      ▶ Show on Air
                    </button>
                    <button className="btn btn-outline" onClick={() => { setEditMode(true); setEditData({...selectedTpl}); }}>
                      ✏️ Edit
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎨</div>
                  <p>Select a template to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Live Tab ═══ */}
      {activeTab === 'live' && (
        <div className="gfx-live-panel">
          {liveGraphics.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📡</div>
              <p>No graphics currently on air</p>
              <p style={{ fontSize: '.75rem' }}>Go to the Template Library to show graphics</p>
            </div>
          ) : (
            <div className="gfx-live-grid">
              {liveGraphics.map(g => (
                <div key={g.id} className="gfx-live-card">
                  <div className="gfx-live-badge">
                    <span className="gfx-live-dot"></span>
                    ON AIR
                  </div>
                  <div className="gfx-live-name">{g.name}</div>
                  {renderPreview(g)}
                  <button className="btn btn-sm btn-danger" style={{ marginTop: 8, width: '100%' }} onClick={() => hideGraphic(g.id)}>
                    ⏹ Take Off Air
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Quick Play Tab ═══ */}
      {activeTab === 'quickplay' && (
        <div className="gfx-quickplay">
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>One-click buttons to show/hide graphics instantly during live production.</p>
          <div className="gfx-quickplay-grid">
            {templates.map(tpl => {
              const meta = TYPE_META[tpl.type] || { icon: '📄', label: tpl.type, color: '#64748b' };
              const isLive = liveGraphics.some(g => g.id === tpl.id);
              return (
                <button key={tpl.id}
                  className={`gfx-qp-btn ${isLive ? 'live' : ''}`}
                  style={isLive ? { borderColor: '#ef4444', background: 'rgba(239,68,68,.1)' } : { borderColor: meta.color + '40' }}
                  onClick={() => isLive ? hideGraphic(tpl.id) : showGraphic(tpl)}>
                  <span className="gfx-qp-icon">{meta.icon}</span>
                  <span className="gfx-qp-name">{tpl.name}</span>
                  {isLive && <span className="gfx-qp-live">LIVE</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Edit Modal ═══ */}
      {editMode && (
        <div className="modal-overlay" onClick={() => setEditMode(false)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editData.id ? 'Edit Graphic' : 'New Graphic'}</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setEditMode(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={editData.name || ''} onChange={e => setEditData({...editData, name: e.target.value})} placeholder="Graphic name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={editData.type || 'lower-third'} onChange={e => setEditData({...editData, type: e.target.value})}>
                    {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={editData.category || 'general'} onChange={e => setEditData({...editData, category: e.target.value})}>
                    {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (ms, 0=persistent)</label>
                  <input className="form-input" type="number" value={editData.duration || 0} onChange={e => setEditData({...editData, duration: parseInt(e.target.value) || 0})} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Animate In</label>
                  <select className="form-input" value={editData.animation?.in || 'fade'} onChange={e => setEditData({...editData, animation: {...(editData.animation||{}), in: e.target.value}})}>
                    {ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Animate Out</label>
                  <select className="form-input" value={editData.animation?.out || 'fade'} onChange={e => setEditData({...editData, animation: {...(editData.animation||{}), out: e.target.value}})}>
                    {ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Anim Duration (ms)</label>
                  <input className="form-input" type="number" value={editData.animation?.duration || 500} onChange={e => setEditData({...editData, animation: {...(editData.animation||{}), duration: parseInt(e.target.value) || 500}})} />
                </div>
              </div>

              {/* Layer editor */}
              <div className="form-group">
                <label className="form-label">Layers (JSON)</label>
                <textarea className="form-input" style={{ height: 160, fontFamily: 'var(--mono)', fontSize: '.75rem' }}
                  value={JSON.stringify(editData.layers || {}, null, 2)}
                  onChange={e => { try { setEditData({...editData, layers: JSON.parse(e.target.value)}); } catch(er) {} }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setEditMode(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTemplate}>
                {editData.id ? '💾 Save Changes' : '+ Create Graphic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
