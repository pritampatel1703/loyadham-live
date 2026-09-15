import { useState, useEffect, useRef, useMemo } from 'react';
import { graphicsApi } from '../api/client';
import { productionSocket } from '../socket';

/* ═══════════════════════════════════════════════════════════
   GRAPHICS ENGINE — Lower Thirds, Overlays, Titles, Tickers
   ═══════════════════════════════════════════════════════════ */

const TYPE_META = {
  'lower-third': { icon: '📝', label: 'Lower Third', color: '#6366f1' },
  'banner':      { icon: '📰', label: 'News Banner', color: '#dc2626' },
  'title':       { icon: '🎬', label: 'Title Card',  color: '#8b5cf6' },
  'score':       { icon: '🏆', label: 'Score Bug',   color: '#f59e0b' },
  'ticker':      { icon: '📊', label: 'Ticker',      color: '#06b6d4' },
  'verse':       { icon: '🙏', label: 'Verse/Shloka', color: '#10b981' },
  'clock':       { icon: '🕐', label: 'Clock',       color: '#64748b' },
  'countdown':   { icon: '⏱️', label: 'Countdown',   color: '#f43f5e' },
  'timer':       { icon: '⏱️', label: 'Timer',       color: '#f43f5e' },
};

const CATEGORIES = [
  { id: 'all',       label: '🗂️ All Graphics' },
  { id: 'keynote',   label: '🎙️ Keynote' },
  { id: 'news',      label: '📰 News & Alert' },
  { id: 'religious', label: '🕉️ Sacred Satsang' },
  { id: 'sports',    label: '🏆 Sports Bug' },
  { id: 'esports',   label: '🎮 Esports VS' },
  { id: 'social',    label: '📱 Social Follow' },
  { id: 'general',   label: '🎬 Title Cards' },
  { id: 'utility',   label: '⏱️ Countdowns' },
];

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
  const [quickTexts, setQuickTexts] = useState({});
  const [transitionMode, setTransitionMode] = useState('fade'); // 'fade' | 'cut'
  const [playoutDuration, setPlayoutDuration] = useState(0); // 0 = persistent, or ms

  const load = async () => {
    try {
      const [res, liveRes] = await Promise.all([
        graphicsApi.templates(),
        graphicsApi.live().catch(() => ({ graphics: [] }))
      ]);
      const tpls = res.templates || [];
      setTemplates(tpls);
      setLiveGraphics(liveRes.graphics || []);
      if (tpls.length > 0 && !selectedTpl) {
        setSelectedTpl(tpls[0]);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    productionSocket.connect();

    const onShow = (gfx) => {
      if (gfx?.id) {
        setLiveGraphics(prev => [...prev.filter(g => g.id !== gfx.id), gfx]);
      }
    };
    const onHide = (data) => {
      if (data?.id) {
        setLiveGraphics(prev => prev.filter(g => g.id !== data.id));
      }
    };
    const onHideAll = () => setLiveGraphics([]);

    productionSocket.on('graphic:show', onShow);
    productionSocket.on('graphic:hide', onHide);
    productionSocket.on('graphic:hide-all', onHideAll);

    return () => {
      productionSocket.off('graphic:show', onShow);
      productionSocket.off('graphic:hide', onHide);
      productionSocket.off('graphic:hide-all', onHideAll);
    };
  }, []);

  // When a template is selected, initialize quickTexts
  useEffect(() => {
    if (!selectedTpl?.layers) {
      setQuickTexts({});
      return;
    }
    const initial = {};
    for (const [key, val] of Object.entries(selectedTpl.layers)) {
      if (val && typeof val === 'object' && val.text !== undefined) {
        initial[key] = val.text;
      } else if (typeof val === 'string') {
        initial[key] = val;
      }
    }
    setQuickTexts(initial);
  }, [selectedTpl?.id]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => filterCat === 'all' || t.category === filterCat);
  }, [templates, filterCat]);

  const showGraphic = async (tpl, override = {}, customTransition) => {
    if (!tpl) return;
    const trans = customTransition || transitionMode;
    const dur = playoutDuration || tpl.duration || 0;
    const liveItem = {
      ...tpl,
      layers: { ...tpl.layers },
      duration: dur,
      transition: trans,
      liveAt: Date.now(),
    };

    // Apply text overrides
    for (const [key, val] of Object.entries(override)) {
      if (liveItem.layers[key]) {
        liveItem.layers[key] = { ...liveItem.layers[key], text: val };
      }
    }

    try {
      productionSocket.emit('graphic:show', liveItem);
      try {
        const bc = new BroadcastChannel('pixel_perfect_graphics');
        bc.postMessage({ type: 'show', graphic: liveItem, timestamp: Date.now() });
      } catch (_) {}

      // Server persistence
      const payloadOverride = {};
      for (const [k, v] of Object.entries(override)) {
        payloadOverride[k] = { text: v };
      }
      await graphicsApi.show(tpl.id, payloadOverride);

      setLiveGraphics(prev => [...prev.filter(g => g.id !== tpl.id), liveItem]);

      if (dur > 0) {
        setTimeout(() => {
          setLiveGraphics(prev => prev.filter(g => g.id !== tpl.id));
        }, dur);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const hideGraphic = async (id, customTransition) => {
    const trans = customTransition || transitionMode;
    try {
      productionSocket.emit('graphic:hide', { id, transition: trans });
      try {
        const bc = new BroadcastChannel('pixel_perfect_graphics');
        bc.postMessage({ type: 'hide', id, transition: trans, timestamp: Date.now() });
      } catch (_) {}

      await graphicsApi.hide(id);
      setLiveGraphics(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const hideAllGraphics = async () => {
    try {
      productionSocket.emit('graphic:hide-all');
      try {
        const bc = new BroadcastChannel('pixel_perfect_graphics');
        bc.postMessage({ type: 'hide-all', timestamp: Date.now() });
      } catch (_) {}
      await fetch('/api/graphics/hide-all', { method: 'POST' });
      setLiveGraphics([]);
    } catch (e) {
      console.error(e);
    }
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
    if (!confirm('Delete this graphic template?')) return;
    try {
      await graphicsApi.deleteTemplate(id);
      if (selectedTpl?.id === id) setSelectedTpl(null);
      load();
    } catch (e) { console.error(e); }
  };

  // ── Render Rich Broadcast Preview on 16:9 Canvas ──
  const renderPreview = (tpl, textOverrides = {}) => {
    if (!tpl?.layers) return null;
    const l = tpl.layers;
    const getText = (key, fallback = '') => {
      if (textOverrides[key] !== undefined) return textOverrides[key];
      return l[key]?.text || (typeof l[key] === 'string' ? l[key] : '') || fallback;
    };

    return (
      <div className="gfx-preview-canvas" style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: '#020617',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)'
      }}>
        {/* Simulated Broadcast Studio Background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.6
        }}>
          <div style={{ fontSize: '3rem', opacity: 0.2 }}>🎥</div>
        </div>

        {/* 1. LOWER THIRD */}
        {tpl.type === 'lower-third' && (
          <div style={{
            position: 'absolute',
            bottom: '10%',
            left: '6%',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.8))'
          }}>
            {getText('badge') && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                alignSelf: 'flex-start',
                background: 'rgba(15, 23, 42, 0.96)',
                borderLeft: `3px solid ${l.accentBar?.color || '#ef4444'}`,
                padding: '2px 8px',
                color: '#fff',
                fontSize: '.65rem',
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
                {getText('badge')}
              </div>
            )}
            <div style={{
              background: l.accentBar?.color || '#dc2626',
              padding: '4px 16px',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              {getText('title', 'Speaker Name')}
            </div>
            {getText('subtitle') && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.94)',
                padding: '3px 14px',
                color: '#cbd5e1',
                fontSize: '.7rem',
                fontWeight: 600,
              }}>
                {getText('subtitle')}
              </div>
            )}
          </div>
        )}

        {/* 2. BANNER */}
        {tpl.type === 'banner' && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(220, 38, 38, 0.95)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            padding: '6px 14px',
            gap: 10,
          }}>
            <span style={{ background: '#000', color: '#fff', padding: '2px 6px', fontWeight: 900, fontSize: '.65rem', letterSpacing: 1 }}>
              {getText('label', 'BREAKING')}
            </span>
            <span style={{ fontSize: '.75rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getText('headline', 'Live Breaking News Update')}
            </span>
          </div>
        )}

        {/* 3. SCORE BUG */}
        {tpl.type === 'score' && (
          <div style={{
            position: 'absolute',
            top: 14,
            left: 14,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.55rem', color: '#94a3b8', fontWeight: 800 }}>{getText('team1', 'TEAM A')}</div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff' }}>{getText('score1', '0')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: '.6rem', color: '#64748b', fontWeight: 800 }}>VS</span>
              {getText('clock') && (
                <span style={{ background: '#ef444430', color: '#ef4444', fontSize: '.5rem', padding: '1px 4px', borderRadius: 2, fontWeight: 900, fontFamily: 'monospace' }}>
                  {getText('clock')}
                </span>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.55rem', color: '#94a3b8', fontWeight: 800 }}>{getText('team2', 'TEAM B')}</div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff' }}>{getText('score2', '0')}</div>
            </div>
          </div>
        )}

        {/* 4. TICKER */}
        {tpl.type === 'ticker' && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'rgba(15, 23, 42, 0.95)',
            borderTop: '2px solid #38bdf8',
            display: 'flex',
            alignItems: 'center',
          }}>
            <div style={{ background: '#38bdf8', color: '#0f172a', fontWeight: 900, fontSize: '.6rem', padding: '4px 8px', letterSpacing: 1 }}>
              {getText('label', 'LIVE')}
            </div>
            <div style={{ flex: 1, padding: '4px 8px', fontSize: '.68rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getText('text', 'Welcome to the live broadcast!')}
            </div>
          </div>
        )}

        {/* 5. VERSE / SHLOKA */}
        {tpl.type === 'verse' && (
          <div style={{
            position: 'absolute',
            bottom: '12%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '85%',
            background: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid rgba(245, 158, 11, 0.6)',
            borderRadius: 8,
            padding: '12px 16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1rem', marginBottom: 2 }}>🕉️ 🙏</div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#fef3c7', fontStyle: 'italic', lineHeight: 1.3 }}>
              "{getText('verse', 'Sacred Updesh & Shloka')}"
            </div>
            {getText('reference') && (
              <div style={{ marginTop: 4, fontSize: '.6rem', color: '#fbbf24', fontWeight: 700 }}>
                {getText('reference')}
              </div>
            )}
          </div>
        )}

        {/* 6. FULL SCREEN TITLE */}
        {tpl.type === 'title' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(30, 27, 75, 0.95) 0%, rgba(2, 6, 23, 0.98) 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
              {getText('title', 'Special Event Title')}
            </div>
            {getText('subtitle') && (
              <div style={{ fontSize: '.75rem', color: '#93c5fd', marginTop: 4 }}>
                {getText('subtitle')}
              </div>
            )}
          </div>
        )}

        {/* 7. COUNTDOWN */}
        {tpl.type === 'countdown' && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1.5px solid rgba(56, 189, 248, 0.5)',
            borderRadius: 12,
            padding: '12px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: '#94a3b8', letterSpacing: 2 }}>
              {getText('label', 'STARTING IN')}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace', margin: '2px 0' }}>
              {tpl.id?.includes('10s') ? '00:10' : '00:30'}
            </div>
            <div style={{ fontSize: '.65rem', color: '#cbd5e1' }}>
              {getText('subtitle', 'Loyadham Live Studio')}
            </div>
          </div>
        )}

        {/* Fallback for legacy custom rect/text */}
        {Object.entries(l).map(([k, layer]) => {
          if (layer?.type === 'rect') {
            return (
              <div key={k} style={{
                position: 'absolute',
                left: `${layer.x}%`, top: `${layer.y}%`,
                width: `${layer.width}%`, height: `${layer.height}%`,
                background: layer.color,
                opacity: layer.opacity || 1,
                borderRadius: layer.borderRadius || 0,
              }} />
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
      {/* ── Top Header ── */}
      <div className="gfx-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🎨 Broadcast Graphics Engine</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>
            18 Broadcast-grade templates • Lower thirds, breaking news, score bugs, tickers & spiritual shlokas
          </p>
        </div>
        <div className="gfx-header-actions">
          <button className="btn btn-sm btn-primary" onClick={() => {
            setEditMode(true);
            setEditData({ name: '', type: 'lower-third', category: 'general', layers: {}, animation: { in: 'fade', out: 'fade', duration: 500 }, duration: 0 });
          }}>
            + New Template
          </button>
          {liveGraphics.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={hideAllGraphics}>
              ⏹ Take All Off Air ({liveGraphics.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Master Playout Transition Strip ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        {/* Transition Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            TRANSITION:
          </span>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: 3, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <button
              className="btn btn-xs"
              style={{
                background: transitionMode === 'cut' ? '#ef4444' : 'transparent',
                color: transitionMode === 'cut' ? '#fff' : 'var(--text-muted)',
                fontWeight: 800,
                padding: '4px 12px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setTransitionMode('cut')}
            >
              ⚡ CUT (Instant)
            </button>
            <button
              className="btn btn-xs"
              style={{
                background: transitionMode === 'fade' ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'transparent',
                color: transitionMode === 'fade' ? '#fff' : 'var(--text-muted)',
                fontWeight: 800,
                padding: '4px 12px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setTransitionMode('fade')}
            >
              🌊 AUTO FADE
            </button>
          </div>
        </div>

        {/* Duration Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Duration:</span>
          {[
            { label: 'Persistent', ms: 0 },
            { label: '5s', ms: 5000 },
            { label: '10s', ms: 10000 },
            { label: '30s', ms: 30000 },
          ].map(d => (
            <button
              key={d.ms}
              className="btn btn-xs"
              style={{
                background: playoutDuration === d.ms ? 'rgba(99,102,241,0.25)' : 'transparent',
                border: `1px solid ${playoutDuration === d.ms ? 'var(--accent)' : 'var(--border)'}`,
                color: playoutDuration === d.ms ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onClick={() => setPlayoutDuration(d.ms)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Live Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {liveGraphics.length > 0 ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 20,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '.72rem',
              fontWeight: 800,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              {liveGraphics.length} GRAPHIC{liveGraphics.length > 1 ? 'S' : ''} ON AIR
            </div>
          ) : (
            <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>No Graphics on Air</span>
          )}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="gfx-tabs">
        {['library', 'live', 'quickplay'].map(t => (
          <button key={t} className={`gfx-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'library' && '📚 Graphics Library (18)'}
            {t === 'live' && `📡 On Air (${liveGraphics.length})`}
            {t === 'quickplay' && '⚡ 1-Click Quick Play'}
          </button>
        ))}
      </div>

      {/* ═══ 1. LIBRARY TAB ═══ */}
      {activeTab === 'library' && (
        <div className="gfx-library">
          {/* Category Filter Bar */}
          <div className="gfx-category-bar">
            {CATEGORIES.map(c => (
              <button key={c.id} className={`gfx-cat-btn ${filterCat === c.id ? 'active' : ''}`} onClick={() => setFilterCat(c.id)}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="gfx-library-grid">
            {/* Left: Template Cards List */}
            <div className="gfx-template-list">
              {filteredTemplates.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎨</div>
                  <p>No templates in this category</p>
                </div>
              ) : (
                filteredTemplates.map(tpl => {
                  const meta = TYPE_META[tpl.type] || { icon: '📄', label: tpl.type, color: '#64748b' };
                  const isLive = liveGraphics.some(g => g.id === tpl.id);
                  const isSelected = selectedTpl?.id === tpl.id;

                  return (
                    <div key={tpl.id}
                      className={`gfx-template-card ${isSelected ? 'selected' : ''}`}
                      style={isLive ? { borderColor: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.25)' } : {}}
                      onClick={() => setSelectedTpl(tpl)}>
                      <div className="gfx-tpl-preview-mini">
                        {renderPreview(tpl)}
                      </div>
                      <div className="gfx-tpl-info">
                        <div className="gfx-tpl-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{tpl.name}</span>
                          {isLive && (
                            <span style={{ background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: '.55rem', fontWeight: 900 }}>
                              ON AIR
                            </span>
                          )}
                        </div>
                        <div className="gfx-tpl-meta">
                          <span className="gfx-tpl-type" style={{ background: meta.color + '20', color: meta.color }}>
                            {meta.icon} {meta.label}
                          </span>
                          <span className="gfx-tpl-cat">{tpl.category}</span>
                        </div>
                      </div>
                      <div className="gfx-tpl-actions" style={{ display: 'flex', gap: 4 }}>
                        {isLive ? (
                          <button className="btn btn-xs btn-danger" style={{ fontWeight: 800 }} onClick={(e) => { e.stopPropagation(); hideGraphic(tpl.id); }} title="Take off air">
                            ⏹ Off
                          </button>
                        ) : (
                          <>
                            <button className="btn btn-xs" style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 800, padding: '2px 6px', fontSize: '.6rem' }}
                              onClick={(e) => { e.stopPropagation(); showGraphic(tpl, {}, 'cut'); }} title="Instant Cut on Air">
                              ⚡ CUT
                            </button>
                            <button className="btn btn-xs" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', fontWeight: 800, padding: '2px 6px', fontSize: '.6rem' }}
                              onClick={(e) => { e.stopPropagation(); showGraphic(tpl, {}, 'fade'); }} title="Auto Fade on Air">
                              🌊 FADE
                            </button>
                          </>
                        )}
                        <button className="btn btn-xs btn-outline" onClick={(e) => { e.stopPropagation(); setEditMode(true); setEditData({ ...tpl }); }} title="Edit">
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

            {/* Right: Selected Template Inspector & Playout Panel */}
            <div className="gfx-preview-panel">
              {selectedTpl ? (
                <>
                  <div className="gfx-preview-title">
                    <span style={{ fontWeight: 800 }}>{selectedTpl.name}</span>
                    <span className="gfx-preview-badge" style={{ background: (TYPE_META[selectedTpl.type]?.color || '#64748b') + '25', color: TYPE_META[selectedTpl.type]?.color || '#64748b' }}>
                      {TYPE_META[selectedTpl.type]?.icon} {TYPE_META[selectedTpl.type]?.label}
                    </span>
                  </div>

                  {/* Live Rendered Canvas with Real-Time Quick Edit Text */}
                  {renderPreview(selectedTpl, quickTexts)}

                  {/* Quick Edit Text Fields */}
                  <div className="gfx-quick-edit">
                    <div className="gfx-quick-edit-title">✏️ Quick Edit Text Layers</div>
                    {Object.entries(selectedTpl.layers || {})
                      .filter(([key, val]) => (val && typeof val === 'object' && val.text !== undefined) || typeof val === 'string')
                      .map(([key, val]) => {
                        const originalText = val?.text !== undefined ? val.text : (typeof val === 'string' ? val : '');
                        return (
                          <div key={key} className="gfx-quick-field">
                            <label style={{ textTransform: 'capitalize' }}>{key}:</label>
                            <input
                              type="text"
                              className="form-input"
                              value={quickTexts[key] ?? originalText}
                              onChange={e => setQuickTexts(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={originalText}
                            />
                          </div>
                        );
                      })}
                  </div>

                  {/* Playout Action Bar */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {liveGraphics.some(g => g.id === selectedTpl.id) ? (
                      <button className="btn btn-danger" style={{ flex: 1, fontWeight: 800 }} onClick={() => hideGraphic(selectedTpl.id)}>
                        ⏹ Take Off Air
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn"
                          style={{ flex: 1, background: '#ef4444', color: '#fff', fontWeight: 800, border: 'none' }}
                          onClick={() => showGraphic(selectedTpl, quickTexts, 'cut')}
                        >
                          ⚡ CUT ON AIR
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ flex: 1, fontWeight: 800 }}
                          onClick={() => showGraphic(selectedTpl, quickTexts, 'fade')}
                        >
                          🌊 AUTO FADE ON AIR
                        </button>
                      </>
                    )}
                    <button className="btn btn-outline" onClick={() => { setEditMode(true); setEditData({ ...selectedTpl }); }}>
                      ✏️ JSON Edit
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

      {/* ═══ 2. ON AIR TAB ═══ */}
      {activeTab === 'live' && (
        <div className="gfx-live-panel">
          {liveGraphics.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📡</div>
              <p style={{ fontWeight: 700 }}>No graphics currently on air</p>
              <p style={{ fontSize: '.75rem' }}>Select any graphic from the library to take it live</p>
            </div>
          ) : (
            <div className="gfx-live-grid">
              {liveGraphics.map(g => (
                <div key={g.id} className="gfx-live-card">
                  <div className="gfx-live-badge">
                    <span className="gfx-live-dot" />
                    ON AIR ({g.type})
                  </div>
                  <div className="gfx-live-name">{g.name}</div>
                  {renderPreview(g)}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-sm btn-danger" style={{ flex: 1, fontWeight: 800 }} onClick={() => hideGraphic(g.id, 'cut')}>
                      ⚡ CUT OFF
                    </button>
                    <button className="btn btn-sm" style={{ flex: 1, background: 'linear-gradient(135deg, #1e293b, #334155)', border: '1px solid #64748b', color: '#93c5fd', fontWeight: 800 }}
                      onClick={() => hideGraphic(g.id, 'fade')}>
                      🌊 FADE OUT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 3. QUICK PLAY TAB ═══ */}
      {activeTab === 'quickplay' && (
        <div className="gfx-quickplay">
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            One-touch broadcast triggers to instantly show or hide any graphic on air with CUT or FADE.
          </p>
          <div className="gfx-quickplay-grid">
            {templates.map(tpl => {
              const meta = TYPE_META[tpl.type] || { icon: '📄', label: tpl.type, color: '#64748b' };
              const isLive = liveGraphics.some(g => g.id === tpl.id);

              return (
                <div key={tpl.id}
                  className={`gfx-qp-card ${isLive ? 'live' : ''}`}
                  style={{
                    background: 'var(--bg-card)',
                    border: `1.5px solid ${isLive ? '#ef4444' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: isLive ? '0 0 14px rgba(239,68,68,0.25)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.4rem' }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontSize: '.62rem', color: meta.color, fontWeight: 700 }}>
                        {meta.label} • {tpl.category}
                      </div>
                    </div>
                    {isLive && (
                      <span style={{ background: '#ef4444', color: '#fff', fontSize: '.55rem', fontWeight: 900, padding: '2px 6px', borderRadius: 3, animation: 'pulse 1s infinite' }}>
                        LIVE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    {isLive ? (
                      <button
                        className="btn btn-xs btn-danger"
                        style={{ width: '100%', fontWeight: 800, padding: '6px 0' }}
                        onClick={() => hideGraphic(tpl.id)}
                      >
                        ⏹ TAKE OFF AIR
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btn-xs"
                          style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 800, padding: '6px 0', fontSize: '.65rem' }}
                          onClick={() => showGraphic(tpl, {}, 'cut')}
                          title="Instant Cut to Air"
                        >
                          ⚡ CUT
                        </button>
                        <button
                          className="btn btn-xs"
                          style={{ flex: 1, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', fontWeight: 800, padding: '6px 0', fontSize: '.65rem' }}
                          onClick={() => showGraphic(tpl, {}, 'fade')}
                          title="Fade to Air"
                        >
                          🌊 FADE
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 4. EDIT / CREATE MODAL ═══ */}
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
                <input className="form-input" value={editData.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Graphic name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={editData.type || 'lower-third'} onChange={e => setEditData({ ...editData, type: e.target.value })}>
                    {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={editData.category || 'general'} onChange={e => setEditData({ ...editData, category: e.target.value })}>
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (ms, 0=persistent)</label>
                  <input className="form-input" type="number" value={editData.duration || 0} onChange={e => setEditData({ ...editData, duration: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Animate In</label>
                  <select className="form-input" value={editData.animation?.in || 'fade'} onChange={e => setEditData({ ...editData, animation: { ...(editData.animation || {}), in: e.target.value } })}>
                    {ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Animate Out</label>
                  <select className="form-input" value={editData.animation?.out || 'fade'} onChange={e => setEditData({ ...editData, animation: { ...(editData.animation || {}), out: e.target.value } })}>
                    {ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Anim Duration (ms)</label>
                  <input className="form-input" type="number" value={editData.animation?.duration || 500} onChange={e => setEditData({ ...editData, animation: { ...(editData.animation || {}), duration: parseInt(e.target.value) || 500 } })} />
                </div>
              </div>

              {/* Layer editor */}
              <div className="form-group">
                <label className="form-label">Layers (JSON)</label>
                <textarea className="form-input" style={{ height: 160, fontFamily: 'var(--mono)', fontSize: '.75rem' }}
                  value={JSON.stringify(editData.layers || {}, null, 2)}
                  onChange={e => { try { setEditData({ ...editData, layers: JSON.parse(e.target.value) }); } catch (er) {} }}
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
