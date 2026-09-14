import { useState, useEffect } from 'react';
import { devicesApi } from '../api/client';

/* ═══════════════════════════════════════════════════════════
   MULTIVIEW MONITOR — Customizable Multi-Source Wall
   ═══════════════════════════════════════════════════════════ */

const LAYOUTS = [
  { id: '2x2', label: '2×2', cols: 2, rows: 2 },
  { id: '3x3', label: '3×3', cols: 3, rows: 3 },
  { id: '4x4', label: '4×4', cols: 4, rows: 4 },
  { id: '1+5', label: '1+5', cols: 3, rows: 3, custom: true },
  { id: '2+4', label: '2+4', cols: 2, rows: 3, custom: true },
];

const SAFE_AREAS = [
  { id: 'none', label: 'None' },
  { id: 'title', label: 'Title Safe (90%)' },
  { id: 'action', label: 'Action Safe (93%)' },
  { id: 'both', label: 'Both' },
];

export default function Multiview() {
  const [devices, setDevices] = useState([]);
  const [layout, setLayout] = useState(LAYOUTS[1]); // 3x3 default
  const [sources, setSources] = useState([]);
  const [labels, setLabels] = useState({});
  const [tallies, setTallies] = useState({});
  const [safeArea, setSafeArea] = useState('none');
  const [showClock, setShowClock] = useState(true);
  const [showAudio, setShowAudio] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [clock, setClock] = useState('');
  const [editingLabel, setEditingLabel] = useState(null);

  useEffect(() => {
    devicesApi.list().then(res => {
      const devs = res.devices || [];
      setDevices(devs);
      // Auto-fill sources
      const totalSlots = layout.cols * layout.rows;
      const srcs = [];
      for (let i = 0; i < totalSlots; i++) {
        srcs.push(devs[i] ? { id: devs[i].id, name: devs[i].name || `CAM ${i+1}`, type: 'camera', deviceId: devs[i].id } :
          { id: `empty-${i}`, name: `Source ${i+1}`, type: 'empty' });
      }
      setSources(srcs);
    }).catch(() => {
      const totalSlots = layout.cols * layout.rows;
      setSources(Array.from({ length: totalSlots }, (_, i) => ({ id: `src-${i}`, name: `CAM ${i+1}`, type: 'camera' })));
    });
    const id = setInterval(() => setClock(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    setClock(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return () => clearInterval(id);
  }, [layout]);

  // Simulate tally
  useEffect(() => {
    if (sources.length > 0) {
      const t = {};
      if (sources[0]) t[sources[0].id] = 'program';
      if (sources[1]) t[sources[1].id] = 'preview';
      setTallies(t);
    }
  }, [sources]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const getSourceLabel = (src, idx) => labels[src.id] || src.name || `Source ${idx + 1}`;

  return (
    <div className="multiview-page">
      {/* Controls Bar */}
      <div className="mv-controls">
        <div className="mv-controls-left">
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>📺 Multiview Monitor</h2>
        </div>
        <div className="mv-controls-right">
          {/* Layout selector */}
          <div className="mv-layout-selector">
            {LAYOUTS.map(l => (
              <button key={l.id} className={`mv-layout-btn ${layout.id === l.id ? 'active' : ''}`}
                onClick={() => setLayout(l)}>{l.label}</button>
            ))}
          </div>
          <div className="mv-toggles">
            <button className={`btn btn-xs ${showClock ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowClock(!showClock)}>🕐 Clock</button>
            <button className={`btn btn-xs ${showAudio ? 'btn-primary' : 'btn-outline'}`} onClick={() => setShowAudio(!showAudio)}>🔊 Audio</button>
            <select className="form-input" style={{ width: 120, fontSize: '.7rem' }} value={safeArea} onChange={e => setSafeArea(e.target.value)}>
              {SAFE_AREAS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className="btn btn-xs btn-outline" onClick={toggleFullscreen}>
              {fullscreen ? '🔲 Exit' : '🔳 Fullscreen'}
            </button>
          </div>
        </div>
      </div>

      {/* Multiview Grid */}
      <div className="mv-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gridTemplateRows: `repeat(${layout.rows}, 1fr)` }}>
        {sources.slice(0, layout.cols * layout.rows).map((src, idx) => {
          const tally = tallies[src.id];
          const tallyClass = tally === 'program' ? 'tally-pgm' : tally === 'preview' ? 'tally-pvw' : '';
          return (
            <div key={src.id} className={`mv-cell ${tallyClass}`}>
              {/* Video area */}
              <div className="mv-cell-video">
                <div className="mv-cell-placeholder">
                  <span style={{ fontSize: '2rem', opacity: 0.3 }}>📹</span>
                </div>

                {/* Safe area guides */}
                {(safeArea === 'title' || safeArea === 'both') && (
                  <div className="mv-safe-guide mv-safe-title"></div>
                )}
                {(safeArea === 'action' || safeArea === 'both') && (
                  <div className="mv-safe-guide mv-safe-action"></div>
                )}
              </div>

              {/* UMD Label */}
              <div className={`mv-umd ${tallyClass}`}>
                {editingLabel === src.id ? (
                  <input type="text" className="mv-umd-input" autoFocus
                    value={labels[src.id] || src.name}
                    onChange={e => setLabels(prev => ({ ...prev, [src.id]: e.target.value }))}
                    onBlur={() => setEditingLabel(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingLabel(null)} />
                ) : (
                  <span className="mv-umd-text" onDoubleClick={() => setEditingLabel(src.id)}>
                    {getSourceLabel(src, idx)}
                  </span>
                )}
                {tally === 'program' && <span className="mv-tally-badge pgm">PGM</span>}
                {tally === 'preview' && <span className="mv-tally-badge pvw">PVW</span>}
              </div>

              {/* Audio meter overlay */}
              {showAudio && (
                <div className="mv-audio-meter">
                  <div className="mv-audio-bar">
                    <div className="mv-audio-fill" style={{ height: `${50 + Math.random() * 30}%` }}></div>
                  </div>
                  <div className="mv-audio-bar">
                    <div className="mv-audio-fill" style={{ height: `${45 + Math.random() * 35}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clock overlay */}
      {showClock && (
        <div className="mv-clock-overlay">
          <span className="mv-clock-time">{clock}</span>
        </div>
      )}
    </div>
  );
}
