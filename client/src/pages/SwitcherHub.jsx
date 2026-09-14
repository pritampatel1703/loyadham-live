import { useState, useEffect, useCallback, useRef } from 'react';
import { switcherApi, analyticsApi } from '../api/client';

/* ═══════════════════════════════════════════════════════════
   GOD-LEVEL SWITCHER HUB — v3.0
   Features no single manufacturer can offer:
   1. Cross-Brand Unified Control
   2. Smart Auto-Director
   3. Full Keyboard Shortcuts
   4. Input Health Monitor
   5. Quick Macro Buttons
   6. Transition History Timeline
   7. Visual Transition Designer
   8. Touch-Friendly Big Mode
   9. Camera Tally Badges
   10. PiP Controls
   ═══════════════════════════════════════════════════════════ */

const MFR_THEME = {
  atem: { color: '#1a1a2e', accent: '#E53935', label: 'Blackmagic ATEM', icon: '🎚️', tag: 'UDP/ATEM', models: 'ATEM Mini, Mini Pro, Mini Pro ISO, Mini Extreme, Mini Extreme ISO, SDI, Television Studio, Constellation 8K' },
  obs: { color: '#302b63', accent: '#6441A5', label: 'OBS Studio', icon: '🖥️', tag: 'WebSocket', models: 'OBS 28+, OBS 30+' },
  datavideo: { color: '#1a3a5c', accent: '#0077C0', label: 'Datavideo', icon: '📺', tag: 'TCP/dVIP', models: 'SE-500HD, SE-650, SE-1200MU, SE-2200, SE-3200, HS-1300, HS-1600T, HS-2200' },
  roland: { color: '#3a1c1c', accent: '#C41230', label: 'Roland', icon: '🎹', tag: 'TCP/RCP', models: 'VR-1HD, VR-4HD, VR-6HD, VR-50HD MK II, V-02HD, V-160HD' },
  tricaster: { color: '#0f2b1a', accent: '#00A651', label: 'NewTek TriCaster', icon: '🔺', tag: 'HTTP/DataLink', models: 'TriCaster Mini, TC1, TC2, TC2 Elite' },
  panasonic: { color: '#1a2a3a', accent: '#0068B5', label: 'Panasonic', icon: '🎥', tag: 'HTTP/CGI', models: 'AV-HLC100, AV-HSW10, AW-RP150' },
  fora: { color: '#2a1a3a', accent: '#7B2D8E', label: 'FOR-A', icon: '🏭', tag: 'TCP', models: 'HVS-100, HVS-110, HVS-2000' },
  livestream: { color: '#1a2a1a', accent: '#4CAF50', label: 'Livestream/Mevo', icon: '📡', tag: 'HTTP/REST', models: 'Mevo Start, Mevo Core, Livestream Studio' },
  osee: { color: '#3a2a1a', accent: '#E65100', label: 'OSEE', icon: '🎚️', tag: 'TCP', models: 'GoStream Deck Pro, GoStream Deck Duo, GoStream Deck Mini' },
};

const TRANSITION_STYLES = [
  { id: 0, label: 'MIX', icon: '🔄' },
  { id: 1, label: 'DIP', icon: '⬛' },
  { id: 2, label: 'WIPE', icon: '➡️' },
  { id: 3, label: 'DVE', icon: '🎬' },
];

const WIPE_PATTERNS = [
  { id: 0, name: 'Horizontal', icon: '→' }, { id: 1, name: 'Vertical', icon: '↓' },
  { id: 2, name: 'Circle', icon: '◯' }, { id: 3, name: 'Diamond', icon: '◇' },
  { id: 4, name: 'Iris', icon: '◉' }, { id: 5, name: 'Box', icon: '□' },
];

const AUTO_PATTERNS = [
  { id: 'sequential', label: '1→2→3→...', desc: 'Cycle through cameras in order' },
  { id: 'random', label: 'Random', desc: 'Switch to random camera' },
  { id: 'ping-pong', label: '1→2→3→2→1', desc: 'Forward then reverse' },
];

const DEFAULT_QUICK_MACROS = [
  { id: 'qm1', name: 'Wide Shot', icon: '🎥', color: '#3b82f6', actions: [{ type: 'setPreview', params: { input: 1 } }, { type: 'auto' }] },
  { id: 'qm2', name: 'Speaker', icon: '🗣️', color: '#8b5cf6', actions: [{ type: 'setPreview', params: { input: 2 } }, { type: 'cut' }] },
  { id: 'qm3', name: 'Audience', icon: '👥', color: '#06b6d4', actions: [{ type: 'setPreview', params: { input: 3 } }, { type: 'auto' }] },
  { id: 'qm4', name: 'Close-up', icon: '👤', color: '#f59e0b', actions: [{ type: 'setPreview', params: { input: 4 } }, { type: 'cut' }] },
  { id: 'qm5', name: '🖼️ PiP On', icon: '🖼️', color: '#10b981', actions: [{ type: 'enablePiP', params: { source: 2 } }] },
  { id: 'qm6', name: '🖼️ PiP Off', icon: '❌', color: '#64748b', actions: [{ type: 'disablePiP' }] },
  { id: 'qm7', name: '⬛ FTB', icon: '⬛', color: '#ef4444', actions: [{ type: 'fadeToBlack' }] },
  { id: 'qm8', name: 'Rec Toggle', icon: '⏺️', color: '#dc2626', actions: [{ type: 'toggleRecording' }] },
];

export default function SwitcherHub() {
  // ═══ Core State ═══
  const [connections, setConnections] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tbarVal, setTbarVal] = useState(0);
  const [form, setForm] = useState({ name: '', manufacturer: '', ip: '192.168.1.100', port: '', password: '' });
  const [tab, setTab] = useState('control');

  // ═══ PiP State ═══
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipSource, setPipSource] = useState(1);
  const [pipSize, setPipSize] = useState(250);
  const [pipPosition, setPipPosition] = useState('bottom-right');

  // ═══ GOD-LEVEL Features ═══
  const [bigMode, setBigMode] = useState(false);
  const [autoDirector, setAutoDirector] = useState({ enabled: false, pattern: 'sequential', interval: 8, cameras: [], currentIdx: 0, paused: false });
  const [transitionDuration, setTransitionDuration] = useState(1.0);
  const [timeline, setTimeline] = useState([]);
  const [quickMacros, setQuickMacros] = useState(DEFAULT_QUICK_MACROS);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [selectedWipePattern, setSelectedWipePattern] = useState(0);
  const autoTimerRef = useRef(null);
  const lastManualRef = useRef(0);

  // ═══ Data Loading ═══
  const loadConns = () => switcherApi.connections()
    .then(d => {
      setConnections(d.connections || []);
      if (!active && d.connections?.[0]) setActive(d.connections[0].id);
    }).catch(console.error);

  const loadMfrs = () => switcherApi.manufacturers()
    .then(d => setManufacturers(d.manufacturers || []))
    .catch(console.error);

  const loadLogs = () => analyticsApi.logs('switcher', 50)
    .then(d => setLogs(d.logs || []))
    .catch(console.error);

  useEffect(() => { loadConns(); loadMfrs(); loadLogs(); }, []);

  // Poll active connection status
  useEffect(() => {
    if (!active) return;
    const poll = () => switcherApi.status(active)
      .then(d => {
        if (d.success && d.status) {
          setStatus(d.status);
          if (d.status.transitionPosition !== undefined) setTbarVal(Math.round(d.status.transitionPosition * 100));
        }
      }).catch(() => setStatus(null));
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [active]);

  // ═══ Actions ═══
  const doAction = async (action, params = {}) => {
    if (!active) return;
    try {
      const res = await switcherApi.action(active, action, params);
      if (res.status) setStatus(res.status);
      loadLogs();
      // Record to timeline
      addToTimeline(action, params);
    } catch (e) { console.error(e.message); }
  };

  const addToTimeline = (action, params) => {
    setTimeline(prev => [...prev.slice(-99), {
      time: new Date(),
      action,
      input: params.input || null,
      label: action === 'cut' ? 'CUT' : action === 'auto' ? 'AUTO' : action === 'fadeToBlack' ? 'FTB' :
        action === 'setProgram' ? `PGM→${params.input}` : action === 'setPreview' ? `PVW→${params.input}` : action,
    }]);
  };

  const testConn = async () => {
    if (!active) return;
    setTesting(true);
    try {
      await switcherApi.test(active);
      loadConns(); loadLogs();
      if (active) switcherApi.status(active).then(d => d.success && setStatus(d.status));
    } catch (e) { console.error(e); }
    setTesting(false);
  };

  const addConn = async () => {
    if (!form.manufacturer || !form.ip.trim()) return;
    const config = {};
    if (form.password) config.password = form.password;
    await switcherApi.createConn({
      name: form.name || MFR_THEME[form.manufacturer]?.label || form.manufacturer,
      manufacturer: form.manufacturer, ip: form.ip.trim(),
      port: parseInt(form.port) || undefined, config,
    });
    setShowAdd(false);
    setForm({ name: '', manufacturer: '', ip: '192.168.1.100', port: '', password: '' });
    loadConns();
  };

  const deleteConn = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this switcher connection?')) return;
    await switcherApi.deleteConn(id);
    if (active === id) { setActive(null); setStatus(null); }
    loadConns();
  };

  // ═══ Quick Macro Execution ═══
  const runQuickMacro = async (macro) => {
    for (const action of macro.actions) {
      await doAction(action.type, action.params || {});
      await new Promise(r => setTimeout(r, 200));
    }
  };

  // ═══ Auto-Director Engine ═══
  useEffect(() => {
    if (!autoDirector.enabled || autoDirector.paused) {
      clearInterval(autoTimerRef.current);
      return;
    }
    const cameras = autoDirector.cameras.length > 0 ? autoDirector.cameras : inputsToDisplay.map(i => i.id);
    if (cameras.length < 2) return;

    let idx = autoDirector.currentIdx;
    let direction = 1; // for ping-pong

    autoTimerRef.current = setInterval(() => {
      // Skip if user manually switched recently (grace period)
      if (Date.now() - lastManualRef.current < 3000) return;

      let nextInput;
      if (autoDirector.pattern === 'sequential') {
        idx = (idx + 1) % cameras.length;
        nextInput = cameras[idx];
      } else if (autoDirector.pattern === 'random') {
        const available = cameras.filter(c => c !== status?.programInput);
        nextInput = available[Math.floor(Math.random() * available.length)] || cameras[0];
      } else if (autoDirector.pattern === 'ping-pong') {
        idx += direction;
        if (idx >= cameras.length - 1) direction = -1;
        if (idx <= 0) direction = 1;
        nextInput = cameras[idx];
      }

      if (nextInput && nextInput !== status?.programInput) {
        doAction('setPreview', { input: nextInput });
        setTimeout(() => doAction('auto'), 300);
      }
      setAutoDirector(prev => ({ ...prev, currentIdx: idx }));
    }, autoDirector.interval * 1000);

    return () => clearInterval(autoTimerRef.current);
  }, [autoDirector.enabled, autoDirector.paused, autoDirector.pattern, autoDirector.interval, autoDirector.cameras, status?.programInput]);

  // ═══ Keyboard Shortcuts ═══
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (!active || !status?.connected) return;

      const num = parseInt(e.key);

      // Shift + number = Direct PGM
      if (e.shiftKey && num >= 1 && num <= 9) {
        e.preventDefault();
        lastManualRef.current = Date.now();
        doAction('setProgram', { input: num });
        return;
      }
      // Number = Set Preview
      if (!e.shiftKey && !e.ctrlKey && !e.altKey && num >= 1 && num <= 9) {
        e.preventDefault();
        doAction('setPreview', { input: num });
        return;
      }

      switch (e.key) {
        case ' ': // Space = Cut
          e.preventDefault();
          lastManualRef.current = Date.now();
          doAction('cut');
          break;
        case 'Enter': // Enter = Auto
          e.preventDefault();
          lastManualRef.current = Date.now();
          doAction('auto');
          break;
        case 'f': case 'F': // F = FTB
          e.preventDefault();
          doAction('fadeToBlack');
          break;
        case 'b': case 'B': // B = Big mode toggle
          e.preventDefault();
          setBigMode(prev => !prev);
          break;
        case 'a': case 'A': // A = Auto-director toggle
          e.preventDefault();
          setAutoDirector(prev => ({ ...prev, enabled: !prev.enabled }));
          break;
        case '?': // ? = Show shortcuts
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, status?.connected]);

  // ═══ Derived ═══
  const conn = connections.find(c => c.id === active);
  const connTheme = conn ? (MFR_THEME[conn.manufacturer] || {}) : {};
  const grouped = {};
  for (const c of connections) {
    if (!grouped[c.manufacturer]) grouped[c.manufacturer] = [];
    grouped[c.manufacturer].push(c);
  }

  const inputsToDisplay = (status?.inputs?.length > 0) ? status.inputs : [
    { id: 1, shortName: 'CAM 1', longName: 'Camera 1' },
    { id: 2, shortName: 'CAM 2', longName: 'Camera 2' },
    { id: 3, shortName: 'CAM 3', longName: 'Camera 3' },
    { id: 4, shortName: 'CAM 4', longName: 'Camera 4' },
  ];

  // Calculate time since last on PGM for each input
  const getTimeSinceLastPgm = (inputId) => {
    const lastEntry = [...timeline].reverse().find(t => t.action === 'setProgram' && t.input === inputId);
    if (!lastEntry) return null;
    const sec = Math.floor((Date.now() - new Date(lastEntry.time).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  };

  return (
    <div className={`sh3 ${bigMode ? 'sh3-big' : ''}`}>
      {/* ═══ LEFT: Connection Panel ═══ */}
      <div className="sh3-left">
        {/* Header */}
        <div className="sh3-left-header">
          <div>
            <h2 className="sh3-title">🎛️ Switcher Hub</h2>
            <p className="sh3-subtitle">Cross-brand video mixer control</p>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>+ Add</button>
        </div>

        {/* Connection List */}
        <div className="sh3-conn-list">
          {Object.keys(grouped).length === 0 ? (
            <div className="sh3-empty">
              <span style={{ fontSize: '2rem' }}>🎚️</span>
              <p>No switchers yet</p>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>+ Add Switcher</button>
            </div>
          ) : (
            Object.entries(grouped).map(([mfr, conns]) => {
              const theme = MFR_THEME[mfr] || {};
              return (
                <div key={mfr} className="sh3-group">
                  <div className="sh3-group-header">
                    <span>{theme.icon || '🎛️'}</span>
                    <span style={{ color: '#fff' }}>{theme.label || mfr}</span>
                    <span className="badge badge-info" style={{ fontSize: '.55rem' }}>{theme.tag}</span>
                  </div>
                  {conns.map(c => (
                    <div key={c.id} className={`sh3-conn ${active === c.id ? 'active' : ''}`}
                      style={{ borderLeftColor: active === c.id ? (theme.accent || 'var(--accent)') : 'transparent' }}
                      onClick={() => setActive(c.id)}>
                      <span className={`sh3-dot ${c.is_connected === 1 ? 'on' : 'off'}`}></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sh3-conn-name">{c.name}</div>
                        <div className="sh3-conn-ip">{c.ip}:{c.port}</div>
                      </div>
                      <button className="btn btn-icon btn-ghost btn-xs" onClick={e => deleteConn(c.id, e)}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Quick Connect / Status */}
        {conn && (
          <div className="sh3-status-card">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-sm btn-primary" onClick={testConn} disabled={testing} style={{ flex: 1 }}>
                {testing ? '⏳ Testing…' : '🔌 Connect'}
              </button>
              <span className={`sh3-online-badge ${status?.connected ? 'on' : 'off'}`}>
                {status?.connected ? '● Online' : '○ Offline'}
              </span>
            </div>
            {status?.connected && status.model && (
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Model: <strong>{status.model}</strong>
              </div>
            )}

            {/* Recording / Streaming quick status */}
            {status?.connected && (
              <div className="sh3-quick-status">
                <div className={`sh3-qs-item ${status?.recording ? 'rec' : ''}`}>
                  <span>{status?.recording ? '⏺' : '⏹'}</span>
                  <span>{status?.recording ? 'REC' : 'Idle'}</span>
                  <button className="btn btn-xs btn-ghost" onClick={() => doAction(status?.recording ? 'stopRecording' : 'startRecording')}>
                    {status?.recording ? 'Stop' : 'Start'}
                  </button>
                </div>
                <div className={`sh3-qs-item ${status?.streaming ? 'live' : ''}`}>
                  <span>{status?.streaming ? '📡' : '⏹'}</span>
                  <span>{status?.streaming ? 'LIVE' : 'Off'}</span>
                  <button className="btn btn-xs btn-ghost" onClick={() => doAction(status?.streaming ? 'stopStreaming' : 'startStreaming')}>
                    {status?.streaming ? 'Stop' : 'Start'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Macros */}
        {conn && status?.connected && (
          <div className="sh3-qm-panel">
            <div className="sh3-qm-title">⚡ Quick Actions</div>
            <div className="sh3-qm-grid">
              {quickMacros.map(qm => (
                <button key={qm.id} className="sh3-qm-btn" style={{ '--qm-color': qm.color }}
                  onClick={() => { lastManualRef.current = Date.now(); runQuickMacro(qm); }}>
                  <span className="sh3-qm-icon">{qm.icon}</span>
                  <span className="sh3-qm-name">{qm.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div className="sh3-log-panel">
          <div className="sh3-log-title">📝 Activity</div>
          <div className="sh3-log-list">
            {logs.slice(0, 15).map((log, i) => (
              <div key={i} className="sh3-log-entry">
                <span className="sh3-log-time">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="sh3-log-msg">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>No actions yet</p>}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: Broadcast Control ═══ */}
      <div className="sh3-right">
        {!conn ? (
          <div className="sh3-placeholder">
            <span style={{ fontSize: '4rem', marginBottom: 12 }}>🎛️</span>
            <h3>Select or Add a Switcher</h3>
            <p>Supports Blackmagic ATEM, OBS, Datavideo, Roland, TriCaster, Panasonic, FOR-A, Livestream, OSEE</p>
          </div>
        ) : (
          <>
            {/* Title Bar with God-Level Toggles */}
            <div className="sh3-titlebar" style={{ background: connTheme.color || 'var(--bg-card)', borderColor: connTheme.accent || 'var(--border)' }}>
              <div className="sh3-titlebar-left">
                <span style={{ fontSize: '1.4rem' }}>{connTheme.icon || '🎛️'}</span>
                <div>
                  <div className="sh3-titlebar-name">{conn.name}</div>
                  <div className="sh3-titlebar-sub">
                    {connTheme.label} · {conn.ip}
                    {status?.connected && <span className="badge badge-online" style={{ marginLeft: 8, fontSize: '.55rem' }}>CONNECTED</span>}
                  </div>
                </div>
              </div>
              <div className="sh3-titlebar-actions">
                {status?.fadeToBlack && <span className="sh3-ftb-badge">FTB ACTIVE</span>}
                <button className={`sh3-toggle-btn ${autoDirector.enabled ? 'active' : ''}`}
                  onClick={() => setAutoDirector(prev => ({ ...prev, enabled: !prev.enabled }))}
                  title="Auto-Director (A)">
                  🤖 {autoDirector.enabled ? 'AUTO ON' : 'Auto'}
                </button>
                <button className={`sh3-toggle-btn ${bigMode ? 'active' : ''}`}
                  onClick={() => setBigMode(!bigMode)} title="Big Button Mode (B)">
                  📱 {bigMode ? 'BIG' : 'Normal'}
                </button>
                <button className="sh3-toggle-btn" onClick={() => setShowShortcuts(!showShortcuts)} title="Keyboard Shortcuts (?)">
                  ⌨️
                </button>
              </div>
            </div>

            {/* Auto-Director Controls */}
            {autoDirector.enabled && (
              <div className="sh3-auto-bar">
                <span className="sh3-auto-indicator">🤖 Auto-Director</span>
                <div className="sh3-auto-controls">
                  <select className="form-input" style={{ width: 120, fontSize: '.7rem' }}
                    value={autoDirector.pattern} onChange={e => setAutoDirector(prev => ({ ...prev, pattern: e.target.value }))}>
                    {AUTO_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '.7rem' }}>⏱️</span>
                    <input type="range" min="3" max="30" value={autoDirector.interval}
                      style={{ width: 80 }}
                      onChange={e => setAutoDirector(prev => ({ ...prev, interval: parseInt(e.target.value) }))} />
                    <span style={{ fontSize: '.7rem', fontFamily: 'var(--mono)', minWidth: 28 }}>{autoDirector.interval}s</span>
                  </div>
                  <button className={`btn btn-xs ${autoDirector.paused ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setAutoDirector(prev => ({ ...prev, paused: !prev.paused }))}>
                    {autoDirector.paused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button className="btn btn-xs btn-danger" onClick={() => setAutoDirector(prev => ({ ...prev, enabled: false }))}>
                    ⏹ Stop
                  </button>
                </div>
              </div>
            )}

            {/* Keyboard Shortcuts Overlay */}
            {showShortcuts && (
              <div className="sh3-shortcuts-panel">
                <div className="sh3-shortcuts-grid">
                  <div><kbd>1</kbd>-<kbd>9</kbd></div><div>Preview camera 1-9</div>
                  <div><kbd>Shift</kbd>+<kbd>1</kbd>-<kbd>9</kbd></div><div>Direct PGM switch</div>
                  <div><kbd>Space</kbd></div><div>CUT transition</div>
                  <div><kbd>Enter</kbd></div><div>AUTO transition</div>
                  <div><kbd>F</kbd></div><div>Fade to Black</div>
                  <div><kbd>B</kbd></div><div>Toggle Big Mode</div>
                  <div><kbd>A</kbd></div><div>Toggle Auto-Director</div>
                  <div><kbd>?</kbd></div><div>Show/hide shortcuts</div>
                </div>
                <button className="btn btn-xs btn-ghost" onClick={() => setShowShortcuts(false)}>Close</button>
              </div>
            )}

            {/* ═══ PROGRAM BUS ═══ */}
            <div className="sh3-bus-section">
              <div className="sh3-bus-label pgm">
                <span className="sh3-bus-dot pgm"></span>
                PROGRAM <span className="sh3-bus-tag">ON AIR</span>
              </div>
              <div className={`sh3-bus-grid ${bigMode ? 'big' : ''}`}>
                {inputsToDisplay.map(inp => {
                  const isPgm = status?.programInput === inp.id;
                  const timeSince = getTimeSinceLastPgm(inp.id);
                  return (
                    <button key={inp.id}
                      className={`sh3-cam-btn pgm-bus ${isPgm ? 'active-pgm' : ''}`}
                      onClick={() => { lastManualRef.current = Date.now(); doAction('setProgram', { input: inp.id }); }}>
                      <span className="sh3-cam-num">{inp.id}</span>
                      <span className="sh3-cam-label">{inp.shortName}</span>
                      {isPgm && <span className="sh3-cam-tally pgm">LIVE</span>}
                      {!isPgm && timeSince && <span className="sh3-cam-ago">{timeSince}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ PREVIEW BUS ═══ */}
            <div className="sh3-bus-section">
              <div className="sh3-bus-label pvw">
                <span className="sh3-bus-dot pvw"></span>
                PREVIEW <span className="sh3-bus-tag">NEXT</span>
              </div>
              <div className={`sh3-bus-grid ${bigMode ? 'big' : ''}`}>
                {inputsToDisplay.map(inp => {
                  const isPvw = status?.previewInput === inp.id;
                  return (
                    <button key={inp.id}
                      className={`sh3-cam-btn pvw-bus ${isPvw ? 'active-pvw' : ''}`}
                      onClick={() => doAction('setPreview', { input: inp.id })}>
                      <span className="sh3-cam-num">{inp.id}</span>
                      <span className="sh3-cam-label">{inp.shortName}</span>
                      {isPvw && <span className="sh3-cam-tally pvw">NEXT</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ═══ TRANSITION CONTROLS ═══ */}
            <div className="sh3-trans-panel">
              <div className="sh3-trans-row">
                {/* Main transition buttons */}
                <div className="sh3-trans-main">
                  <button className="sh3-trans-btn cut" onClick={() => { lastManualRef.current = Date.now(); doAction('cut'); }}>
                    <span className="sh3-trans-key">Space</span>
                    CUT
                  </button>
                  <button className="sh3-trans-btn auto" onClick={() => { lastManualRef.current = Date.now(); doAction('auto'); }}>
                    <span className="sh3-trans-key">Enter</span>
                    AUTO
                  </button>
                  <button className={`sh3-trans-btn ftb ${status?.fadeToBlack ? 'active' : ''}`}
                    onClick={() => doAction('fadeToBlack')}>
                    <span className="sh3-trans-key">F</span>
                    FTB
                  </button>
                </div>

                {/* Transition style selector */}
                <div className="sh3-trans-styles">
                  {TRANSITION_STYLES.map(st => (
                    <button key={st.id}
                      className={`sh3-style-btn ${status?.transitionStyle === st.id ? 'active' : ''}`}
                      style={status?.transitionStyle === st.id ? { background: connTheme.accent || 'var(--accent)', color: '#fff' } : {}}
                      onClick={() => doAction('setTransitionStyle', { style: st.id })}>
                      {st.icon} {st.label}
                    </button>
                  ))}
                </div>

                {/* Duration */}
                <div className="sh3-trans-duration">
                  <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>Duration</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[0.5, 1.0, 1.5, 2.0, 3.0].map(d => (
                      <button key={d} className={`sh3-dur-btn ${transitionDuration === d ? 'active' : ''}`}
                        onClick={() => setTransitionDuration(d)}>{d}s</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* T-Bar */}
              <div className="sh3-tbar">
                <span style={{ fontSize: '.7rem', fontWeight: 700 }}>T-Bar</span>
                <input type="range" min="0" max="100" value={tbarVal}
                  className="sh3-tbar-slider"
                  style={{ accentColor: connTheme.accent || 'var(--accent)' }}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    setTbarVal(v);
                    doAction('setTransitionPosition', { position: v / 100 });
                  }} />
                <span style={{ fontSize: '.7rem', fontFamily: 'var(--mono)', minWidth: 32, textAlign: 'right' }}>{tbarVal}%</span>
              </div>
            </div>

            {/* ═══ PiP Controls ═══ */}
            {conn?.manufacturer === 'atem' && (
              <div className="sh3-pip-panel">
                <div className="sh3-pip-header">
                  <span style={{ fontWeight: 700, fontSize: '.8rem' }}>🖼️ Picture-in-Picture</span>
                  <button className={`btn btn-xs ${pipEnabled ? 'btn-danger' : 'btn-primary'}`}
                    onClick={async () => {
                      if (pipEnabled) {
                        await doAction('disablePiP', {});
                        setPipEnabled(false);
                      } else {
                        const POS = { 'top-left': { posX: -7200, posY: 4000 }, 'top-right': { posX: 7200, posY: 4000 }, 'bottom-left': { posX: -7200, posY: -4000 }, 'bottom-right': { posX: 7200, posY: -4000 }, 'center': { posX: 0, posY: 0 } };
                        await doAction('enablePiP', { source: pipSource, opts: { ...POS[pipPosition], sizeX: pipSize, sizeY: pipSize, border: true } });
                        setPipEnabled(true);
                      }
                    }}>
                    {pipEnabled ? '⏹ Off' : '▶ On'}
                  </button>
                </div>
                <div className="sh3-pip-controls">
                  <select className="form-input" style={{ fontSize: '.7rem', flex: 1 }} value={pipSource}
                    onChange={e => { const src = parseInt(e.target.value); setPipSource(src); if (pipEnabled) doAction('setPiPSource', { source: src }); }}>
                    {inputsToDisplay.map(inp => <option key={inp.id} value={inp.id}>{inp.shortName}</option>)}
                  </select>
                  <div className="sh3-pip-pos-grid">
                    {[['top-left', '↖'], ['top-right', '↗'], ['bottom-left', '↙'], ['bottom-right', '↘']].map(([id, label]) => (
                      <button key={id} className={`sh3-pip-pos-btn ${pipPosition === id ? 'active' : ''}`}
                        style={pipPosition === id ? { background: connTheme.accent } : {}}
                        onClick={() => {
                          setPipPosition(id);
                          if (pipEnabled) {
                            const P = { 'top-left': { posX: -7200, posY: 4000 }, 'top-right': { posX: 7200, posY: 4000 }, 'bottom-left': { posX: -7200, posY: -4000 }, 'bottom-right': { posX: 7200, posY: -4000 } };
                            doAction('updatePiP', { opts: P[id] });
                          }
                        }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '.6rem' }}>Size</span>
                    <input type="range" min="100" max="500" value={pipSize} style={{ width: 60, accentColor: connTheme.accent }}
                      onChange={e => { const v = parseInt(e.target.value); setPipSize(v); if (pipEnabled) doAction('updatePiP', { opts: { sizeX: v, sizeY: v } }); }} />
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TRANSITION TIMELINE ═══ */}
            {timeline.length > 0 && (
              <div className="sh3-timeline">
                <div className="sh3-timeline-label">
                  <span>🕐 Transition Timeline</span>
                  <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{timeline.length} actions</span>
                  <button className="btn btn-xs btn-ghost" onClick={() => setTimeline([])}>Clear</button>
                </div>
                <div className="sh3-timeline-track">
                  {timeline.slice(-30).map((t, i) => (
                    <div key={i} className={`sh3-timeline-dot ${t.action === 'cut' ? 'cut' : t.action === 'auto' ? 'auto' : t.action === 'fadeToBlack' ? 'ftb' : 'other'}`}
                      title={`${t.label} at ${t.time.toLocaleTimeString()}`}>
                      <span className="sh3-timeline-pip"></span>
                      <span className="sh3-timeline-lbl">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ ADD SWITCHER MODAL ═══ */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal switcher-add-modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Add Video Mixer / Switcher</h2>
            <div className="form-group">
              <label className="form-label">Select Manufacturer</label>
              <div className="switcher-mfr-grid">
                {Object.entries(MFR_THEME).map(([key, theme]) => (
                  <button key={key}
                    className={`switcher-mfr-card ${form.manufacturer === key ? 'selected' : ''}`}
                    style={form.manufacturer === key ? { borderColor: theme.accent, background: theme.color + '44' } : {}}
                    onClick={() => {
                      const mfr = manufacturers.find(m => m.id === key);
                      setForm(f => ({ ...f, manufacturer: key, name: theme.label, port: mfr?.defaultPort || '' }));
                    }}>
                    <span className="mfr-card-icon">{theme.icon}</span>
                    <span className="mfr-card-name" style={{ color: '#fff' }}>{theme.label}</span>
                    <span className="mfr-card-protocol" style={{ color: 'rgba(255,255,255,.6)' }}>{theme.tag}</span>
                  </button>
                ))}
              </div>
            </div>
            {form.manufacturer && (
              <>
                <div className="form-group">
                  <label className="form-label">Switcher Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">IP Address</label>
                    <input className="form-input" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Port</label>
                    <input className="form-input" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
                  </div>
                </div>
                {form.manufacturer === 'obs' && (
                  <div className="form-group">
                    <label className="form-label">WebSocket Password</label>
                    <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  <strong>Models:</strong> {MFR_THEME[form.manufacturer]?.models}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addConn} disabled={!form.manufacturer || !form.ip.trim()}>Add Switcher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
