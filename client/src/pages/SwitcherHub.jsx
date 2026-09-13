import { useState, useEffect } from 'react';
import { switcherApi, analyticsApi } from '../api/client';

/* ═══════════════════════════════════════════════════════════
   MANUFACTURER VISUAL CONFIG
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
  { id: 0, label: 'MIX' },
  { id: 1, label: 'DIP / WIPE' },
  { id: 2, label: 'WIPE' },
  { id: 3, label: 'DVE' },
];

export default function SwitcherHub() {
  const [connections, setConnections] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tbarVal, setTbarVal] = useState(0);
  const [form, setForm] = useState({ name: '', manufacturer: '', ip: '192.168.1.100', port: '', password: '' });
  const [tab, setTab] = useState('control'); // 'control' | 'inputs' | 'log'
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipSource, setPipSource] = useState(1);
  const [pipSize, setPipSize] = useState(250);
  const [pipPosition, setPipPosition] = useState('bottom-right');

  const loadConns = () => switcherApi.connections()
    .then(d => {
      setConnections(d.connections || []);
      if (!active && d.connections?.[0]) setActive(d.connections[0].id);
    }).catch(console.error);

  const loadMfrs = () => switcherApi.manufacturers()
    .then(d => setManufacturers(d.manufacturers || []))
    .catch(console.error);

  const loadLogs = () => analyticsApi.logs('switcher', 40)
    .then(d => setLogs(d.logs || []))
    .catch(console.error);

  useEffect(() => {
    loadConns();
    loadMfrs();
    loadLogs();
  }, []);

  // Poll active connection status
  useEffect(() => {
    if (!active) return;
    const poll = () => switcherApi.status(active)
      .then(d => {
        if (d.success && d.status) {
          setStatus(d.status);
          if (d.status.transitionPosition !== undefined) {
            setTbarVal(Math.round(d.status.transitionPosition * 100));
          }
        }
      }).catch(() => setStatus(null));
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [active]);

  const testConn = async () => {
    if (!active) return;
    setTesting(true);
    try {
      const r = await switcherApi.test(active);
      loadConns(); loadLogs();
      if (active) switcherApi.status(active).then(d => d.success && setStatus(d.status));
    } catch (e) { console.error(e); }
    setTesting(false);
  };

  const doAction = async (action, params = {}) => {
    if (!active) return;
    try {
      const res = await switcherApi.action(active, action, params);
      if (res.status) setStatus(res.status);
      loadLogs();
    } catch (e) { console.error(e.message); }
  };

  const addConn = async () => {
    if (!form.manufacturer || !form.ip.trim()) return;
    const config = {};
    if (form.password) config.password = form.password;
    await switcherApi.createConn({
      name: form.name || MFR_THEME[form.manufacturer]?.label || form.manufacturer,
      manufacturer: form.manufacturer,
      ip: form.ip.trim(),
      port: parseInt(form.port) || undefined,
      config,
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

  const conn = connections.find(c => c.id === active);
  const connTheme = conn ? (MFR_THEME[conn.manufacturer] || {}) : {};

  // Group connections by manufacturer
  const grouped = {};
  for (const c of connections) {
    if (!grouped[c.manufacturer]) grouped[c.manufacturer] = [];
    grouped[c.manufacturer].push(c);
  }

  const inputsToDisplay = (status?.inputs?.length > 0) ? status.inputs : [
    { id: 1, shortName: 'IN 1', longName: 'Input 1' },
    { id: 2, shortName: 'IN 2', longName: 'Input 2' },
    { id: 3, shortName: 'IN 3', longName: 'Input 3' },
    { id: 4, shortName: 'IN 4', longName: 'Input 4' },
  ];

  return (
    <div className="switcher-hub">
      {/* ═══ LEFT COLUMN: Connections ═══ */}
      <div className="switcher-left">
        {/* Header with Add button */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🎛️ Switcher Hub</span>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>➕ Add Switcher</button>
          </div>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
            Control any brand of video mixer from one place.
          </p>

          {/* Connection list grouped by manufacturer */}
          {Object.keys(grouped).length === 0 ? (
            <div className="switcher-empty">
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎚️</div>
              <p>No switchers configured yet.</p>
              <p style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                Add an BlackMagic, OBS, Datavideo, Roland, TriCaster, Panasonic, FOR-A, Livestream, or OSEE switcher.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([mfr, conns]) => {
              const theme = MFR_THEME[mfr] || {};
              return (
                <div key={mfr} className="switcher-group">
                  <div className="switcher-group-header">
                    <span className="switcher-group-icon">{theme.icon || '🎛️'}</span>
                    <span className="switcher-group-label" style={{ color: '#ffffff' }}>{theme.label || mfr}</span>
                    <span className="badge badge-info" style={{ fontSize: '.6rem' }}>{theme.tag || ''}</span>
                  </div>
                  {conns.map(c => {
                    const isActive = active === c.id;
                    const isOnline = c.is_connected === 1;
                    return (
                      <div
                        key={c.id}
                        className={`switcher-conn-item ${isActive ? 'active' : ''}`}
                        style={{ borderLeftColor: isActive ? (theme.accent || 'var(--accent)') : 'transparent' }}
                        onClick={() => setActive(c.id)}
                      >
                        <span className={`conn-dot ${isOnline ? 'connected' : 'disconnected'}`}></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="switcher-conn-name">{c.name}</div>
                          <div className="switcher-conn-info">
                            {c.protocol?.toUpperCase()} {c.ip}:{c.port}
                          </div>
                        </div>
                        <button className="btn btn-icon btn-ghost btn-xs" title="Delete" onClick={e => deleteConn(c.id, e)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Connection Actions */}
        {conn && (
          <div className="card">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={testConn} disabled={testing}>
                {testing ? '⏳ Connecting…' : '🔌 Connect / Test'}
              </button>
              <div style={{ fontSize: '.8rem', color: status?.connected ? 'var(--green)' : 'var(--text-muted)' }}>
                {status?.connected ? `● Online` : '○ Offline'}
              </div>
            </div>
            {status?.connected && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)' }}>
                Model: <strong>{status.model}</strong>
              </div>
            )}
            {!status?.connected && conn.last_error && (
              <div style={{ fontSize: '.75rem', color: 'var(--red)', marginTop: 4 }}>
                {conn.last_error}
              </div>
            )}
          </div>
        )}

        {/* Hardware Status */}
        {conn && status?.connected && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📡 Status</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="switcher-stat-box">
                <span className="switcher-stat-label">Recording</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={`badge ${status?.recording ? 'badge-danger' : 'badge-offline'}`}>
                    {status?.recording ? '⏺ REC' : 'IDLE'}
                  </span>
                  <button className={`btn btn-xs ${status?.recording ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => doAction(status?.recording ? 'stopRecording' : 'startRecording')}>
                    {status?.recording ? 'Stop' : 'Start'}
                  </button>
                </div>
              </div>
              <div className="switcher-stat-box">
                <span className="switcher-stat-label">Streaming</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={`badge ${status?.streaming ? 'badge-online' : 'badge-offline'}`}>
                    {status?.streaming ? '📡 LIVE' : 'OFF'}
                  </span>
                  <button className={`btn btn-xs ${status?.streaming ? 'btn-danger' : 'btn-outline'}`}
                    onClick={() => doAction(status?.streaming ? 'stopStreaming' : 'startStreaming')}>
                    {status?.streaming ? 'Stop' : 'Start'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Activity Log (compact) */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📝 Activity Log</span>
          </div>
          <div className="log-panel" style={{ maxHeight: 200 }}>
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No actions recorded</p>
            ) : (
              logs.slice(0, 20).map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className="log-type switcher">sw</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT COLUMN: Broadcast Controls ═══ */}
      <div className="switcher-right">
        {!conn ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎛️</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Select or Add a Switcher</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
              Choose a connected switcher from the left panel, or click "Add Switcher" to configure a new one.
              Supports OBS Studio, Datavideo, Roland, NewTek TriCaster, Panasonic, FOR-A, Livestream/Mevo, and OSEE.
            </p>
          </div>
        ) : (
          <>
            {/* Switcher Title Bar */}
            <div className="switcher-title-bar" style={{ background: connTheme.color || 'var(--bg-card)', borderColor: connTheme.accent || 'var(--border)', color: '#ffffff' }}>
              <div className="switcher-title-left">
                <span style={{ fontSize: '1.4rem' }}>{connTheme.icon || '🎛️'}</span>
                <div>
                  <div className="switcher-title-name" style={{ color: '#ffffff' }}>{conn.name}</div>
                  <div className="switcher-title-sub" style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                    {connTheme.label} · {conn.protocol?.toUpperCase()} {conn.ip}:{conn.port}
                    {status?.connected && <span className="badge badge-online" style={{ marginLeft: 8, fontSize: '.6rem' }}>CONNECTED</span>}
                  </div>
                </div>
              </div>
              {status?.fadeToBlack && (
                <div className="badge badge-danger" style={{ animation: 'ftb-pulse 1s infinite alternate' }}>FTB ACTIVE</div>
              )}
            </div>

            {/* Tab Navigation */}
            <div className="switcher-tabs">
              {['control', 'inputs', 'log'].map(t => (
                <button key={t} className={`switcher-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
                  style={tab === t ? { borderBottomColor: connTheme.accent || 'var(--accent)' } : {}}>
                  {t === 'control' ? '🎬 Switcher Control' : t === 'inputs' ? '📋 Input Mapping' : '📝 Action Log'}
                </button>
              ))}
            </div>

            {tab === 'control' && (
              <div className="switcher-control-panel">
                {/* Program Bus */}
                <div className="switcher-bus-section">
                  <div className="switcher-bus-label pgm">
                    <span className="switcher-bus-dot pgm"></span>
                    PROGRAM (ON AIR)
                  </div>
                  <div className="switcher-bus-grid">
                    {inputsToDisplay.map(inp => (
                      <button key={inp.id}
                        className={`switcher-bus-btn ${status?.programInput === inp.id ? 'pgm' : ''}`}
                        onClick={() => doAction('setProgram', { input: inp.id })}
                        title={inp.longName}>
                        <span className="bus-btn-label">{inp.shortName}</span>
                        <span className="bus-btn-sub">#{inp.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview Bus */}
                <div className="switcher-bus-section">
                  <div className="switcher-bus-label pvw">
                    <span className="switcher-bus-dot pvw"></span>
                    PREVIEW (NEXT CUE)
                  </div>
                  <div className="switcher-bus-grid">
                    {inputsToDisplay.map(inp => (
                      <button key={inp.id}
                        className={`switcher-bus-btn ${status?.previewInput === inp.id ? 'pvw' : ''}`}
                        onClick={() => doAction('setPreview', { input: inp.id })}
                        title={inp.longName}>
                        <span className="bus-btn-label">{inp.shortName}</span>
                        <span className="bus-btn-sub">#{inp.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transition Controls */}
                <div className="switcher-transition-bar">
                  <div className="switcher-trans-label">Transition & Cut Controls</div>
                  <div className="switcher-trans-row">
                    <button className="switcher-trans-btn cut" onClick={() => doAction('cut')}>CUT</button>
                    <button className="switcher-trans-btn auto" onClick={() => doAction('auto')}>AUTO</button>
                    <button className={`switcher-trans-btn ftb ${status?.fadeToBlack ? 'active' : ''}`}
                      onClick={() => doAction('fadeToBlack')}>FTB</button>
                    <div className="switcher-trans-styles">
                      {TRANSITION_STYLES.map(st => (
                        <button key={st.id}
                          className={`switcher-style-btn ${status?.transitionStyle === st.id ? 'active' : ''}`}
                          style={status?.transitionStyle === st.id ? { background: connTheme.accent || 'var(--accent)' } : {}}
                          onClick={() => doAction('setTransitionStyle', { style: st.id })}>
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* T-Bar */}
                  <div className="switcher-tbar">
                    <div className="switcher-tbar-header">
                      <span>Virtual T-Bar Fader</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{tbarVal}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={tbarVal}
                      style={{ accentColor: connTheme.accent || 'var(--orange)' }}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        setTbarVal(v);
                        doAction('setTransitionPosition', { position: v / 100 });
                      }} />
                  </div>
                </div>

                {/* ═══ PiP Controls (ATEM only) ═══ */}
                {conn?.manufacturer === 'atem' && (
                  <div className="switcher-pip-panel" style={{ marginTop: 12, padding: 16, background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div className="card-header" style={{ marginBottom: 8 }}>
                      <span className="card-title">🖼️ Picture-in-Picture (PiP)</span>
                      <button
                        className={`btn btn-sm ${pipEnabled ? 'btn-danger' : 'btn-primary'}`}
                        onClick={async () => {
                          if (pipEnabled) {
                            await doAction('disablePiP', {});
                            setPipEnabled(false);
                          } else {
                            const POS_MAP = {
                              'top-left': { posX: -7200, posY: 4000 },
                              'top-right': { posX: 7200, posY: 4000 },
                              'bottom-left': { posX: -7200, posY: -4000 },
                              'bottom-right': { posX: 7200, posY: -4000 },
                              'center': { posX: 0, posY: 0 },
                            };
                            const pos = POS_MAP[pipPosition] || POS_MAP['bottom-right'];
                            await doAction('enablePiP', { source: pipSource, opts: { ...pos, sizeX: pipSize, sizeY: pipSize, border: true } });
                            setPipEnabled(true);
                          }
                        }}
                      >
                        {pipEnabled ? '⏹ Disable PiP' : '▶ Enable PiP'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: '.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>PiP Source (Camera)</label>
                        <select className="form-input" value={pipSource}
                          onChange={e => { const src = parseInt(e.target.value); setPipSource(src); if (pipEnabled) doAction('setPiPSource', { source: src }); }}>
                          {inputsToDisplay.map(inp => (
                            <option key={inp.id} value={inp.id}>{inp.shortName} — {inp.longName}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Position</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                          {[
                            { id: 'top-left', label: '↖ TL' }, { id: 'center', label: '⊙ C' }, { id: 'top-right', label: '↗ TR' },
                            { id: 'bottom-left', label: '↙ BL' }, { id: 'custom', label: '—' }, { id: 'bottom-right', label: '↘ BR' },
                          ].map(pos => (
                            <button key={pos.id}
                              className={`btn btn-xs ${pipPosition === pos.id ? '' : 'btn-outline'}`}
                              style={pipPosition === pos.id ? { background: connTheme.accent || 'var(--accent)', color: '#fff' } : {}}
                              disabled={pos.id === 'custom'}
                              onClick={() => {
                                setPipPosition(pos.id);
                                if (pipEnabled) {
                                  const P = { 'top-left': { posX: -7200, posY: 4000 }, 'top-right': { posX: 7200, posY: 4000 }, 'bottom-left': { posX: -7200, posY: -4000 }, 'bottom-right': { posX: 7200, posY: -4000 }, 'center': { posX: 0, posY: 0 } };
                                  if (P[pos.id]) doAction('updatePiP', { opts: P[pos.id] });
                                }
                              }}>
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)' }}>
                        <span>PiP Size</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{Math.round(pipSize / 10)}%</span>
                      </div>
                      <input type="range" min="100" max="500" value={pipSize}
                        style={{ width: '100%', accentColor: connTheme.accent || 'var(--accent)' }}
                        onChange={e => { const v = parseInt(e.target.value); setPipSize(v); if (pipEnabled) doAction('updatePiP', { opts: { sizeX: v, sizeY: v } }); }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: 'var(--text-muted)' }}>
                        <span>10%</span><span>25%</span><span>50%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Input Mapping */}
            {tab === 'inputs' && (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Input #</th><th>Label</th><th>Full Name</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {inputsToDisplay.map(inp => {
                        const isPgm = status?.programInput === inp.id;
                        const isPvw = status?.previewInput === inp.id;
                        return (
                          <tr key={inp.id}>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>#{inp.id}</td>
                            <td style={{ fontWeight: 600 }}>{inp.shortName}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{inp.longName}</td>
                            <td>
                              {isPgm && <span className="badge badge-danger">PGM LIVE</span>}
                              {isPvw && <span className="badge badge-online">PVW CUE</span>}
                              {!isPgm && !isPvw && <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Standby</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-xs" onClick={() => doAction('setPreview', { input: inp.id })}>PVW</button>
                                <button className="btn btn-xs btn-danger" onClick={() => doAction('setProgram', { input: inp.id })}>PGM</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Action Log */}
            {tab === 'log' && (
              <div className="card">
                <div className="log-panel" style={{ maxHeight: 500 }}>
                  {logs.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No actions recorded yet</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="log-entry">
                        <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                        <span className="log-type switcher">sw</span>
                        <span className="log-msg">{log.message}</span>
                      </div>
                    ))
                  )}
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

            {/* Manufacturer Selector Grid */}
            <div className="form-group">
              <label className="form-label">Select Manufacturer</label>
              <div className="switcher-mfr-grid">
                {Object.entries(MFR_THEME).map(([key, theme]) => (
                  <button key={key}
                    className={`switcher-mfr-card ${form.manufacturer === key ? 'selected' : ''}`}
                    style={form.manufacturer === key ? { borderColor: theme.accent, background: theme.color + '44' } : {}}
                    onClick={() => {
                      const mfr = manufacturers.find(m => m.id === key);
                      setForm(f => ({
                        ...f,
                        manufacturer: key,
                        name: theme.label,
                        port: mfr?.defaultPort || '',
                      }));
                    }}>
                    <span className="mfr-card-icon">{theme.icon}</span>
                    <span className="mfr-card-name" style={{ color: '#ffffff' }}>{theme.label}</span>
                    <span className="mfr-card-protocol" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{theme.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.manufacturer && (
              <>
                <div className="form-group">
                  <label className="form-label">Switcher Name</label>
                  <input className="form-input" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={MFR_THEME[form.manufacturer]?.label || 'My Switcher'} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">IP Address</label>
                    <input className="form-input" value={form.ip}
                      onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                      placeholder="192.168.1.100" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Port</label>
                    <input className="form-input" type="number" value={form.port}
                      onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                      placeholder={manufacturers.find(m => m.id === form.manufacturer)?.defaultPort || '0'} />
                  </div>
                </div>
                {form.manufacturer === 'obs' && (
                  <div className="form-group">
                    <label className="form-label">WebSocket Password (optional)</label>
                    <input className="form-input" type="password" value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Leave empty if no password" />
                  </div>
                )}
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  <strong>Supported models:</strong> {MFR_THEME[form.manufacturer]?.models || 'Various'}
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addConn} disabled={!form.manufacturer || !form.ip.trim()}>
                Add Switcher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
