import { useState, useEffect, useRef } from 'react';
import { atemApi, analyticsApi } from '../api/client';
import { productionSocket } from '../socket';

export default function AtemControl() {
  const [connections, setConnections] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: 'ATEM Mini Pro', ip: '192.168.1.50' });
  const [testing, setTesting] = useState(false);
  const [tbarVal, setTbarVal] = useState(0);

  const loadConns = () => atemApi.connections()
    .then(d => {
      setConnections(d.connections || []);
      if (!active && d.connections?.[0]) setActive(d.connections[0].id);
    })
    .catch(console.error);

  const loadLogs = () => analyticsApi.logs('atem', 35)
    .then(d => setLogs(d.logs || []))
    .catch(console.error);

  useEffect(() => {
    loadConns();
    loadLogs();

    productionSocket.connect();

    const onAtemState = (st) => {
      setStatus(st);
      if (st?.transitionPosition !== undefined) {
        setTbarVal(Math.round(st.transitionPosition * 100));
      }
    };

    const onAtemTally = (tally) => {
      setStatus(prev => prev ? ({ ...prev, programInput: tally.pgmInput, previewInput: tally.pvwInput, inTransition: tally.inTransition, fadeToBlack: tally.fadeToBlack }) : prev);
    };

    productionSocket.on('atem:state', onAtemState);
    productionSocket.on('atem:tally', onAtemTally);

    return () => {
      productionSocket.off('atem:state', onAtemState);
      productionSocket.off('atem:tally', onAtemTally);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const poll = () => atemApi.status(active)
      .then(d => {
        if (d.success && d.status) {
          setStatus(d.status);
          if (d.status.transitionPosition !== undefined) {
            setTbarVal(Math.round(d.status.transitionPosition * 100));
          }
        }
      })
      .catch(() => setStatus(null));

    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [active]);

  const testConn = async () => {
    if (!active) return;
    setTesting(true);
    try {
      const r = await atemApi.test(active);
      if (r.connected) {
        alert(`✅ Connected to ${r.model || 'Blackmagic ATEM'}!`);
      } else {
        alert(`❌ Connection Failed: ${r.error || 'Check IP and network'}`);
      }
      loadConns();
      loadLogs();
      if (active) atemApi.status(active).then(d => d.success && setStatus(d.status));
    } catch (e) {
      alert('❌ ' + e.message);
    }
    setTesting(false);
  };

  const doAction = async (action, params = {}) => {
    if (!active) return;
    try {
      const res = await atemApi.action(active, action, params);
      if (res.status) setStatus(res.status);
      loadLogs();
    } catch (e) {
      alert('❌ ' + e.message);
    }
  };

  const addConn = async () => {
    if (!form.ip.trim()) return alert('Please enter IP address');
    await atemApi.createConn(form);
    setShowAdd(false);
    loadConns();
  };

  const deleteConn = async (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this ATEM connection?')) {
      await atemApi.deleteConn(id);
      if (active === id) setActive(null);
      loadConns();
    }
  };

  const conn = connections.find(c => c.id === active);

  // Default fallback inputs if not yet read from hardware
  const defaultInputs = [
    { id: 1, shortName: 'CAM 1', longName: 'Camera 1' },
    { id: 2, shortName: 'CAM 2', longName: 'Camera 2' },
    { id: 3, shortName: 'CAM 3', longName: 'Camera 3' },
    { id: 4, shortName: 'CAM 4', longName: 'Camera 4' },
    { id: 0, shortName: 'BLACK', longName: 'Black' },
    { id: 1000, shortName: 'BARS', longName: 'Color Bars' },
    { id: 3010, shortName: 'MP 1', longName: 'Media Player 1' },
  ];

  const inputsToDisplay = (status?.inputs && status.inputs.length > 0) ? status.inputs : defaultInputs;

  const transitionStyles = [
    { id: 0, label: 'MIX' },
    { id: 1, label: 'DIP' },
    { id: 2, label: 'WIPE' },
    { id: 3, label: 'DVE' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16 }}>
      {/* Left Column: Connections & Hardware Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Connection Panel */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🎛️ Blackmagic ATEM Switchers</span>
            <button className="btn btn-sm" onClick={() => setShowAdd(true)}>➕ Add</button>
          </div>

          {connections.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No ATEM switchers configured</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connections.map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius)',
                    background: active === c.id ? 'var(--bg-card-hover)' : 'transparent',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => setActive(c.id)}
                >
                  <span className={`conn-dot ${status?.connected && active === c.id ? 'connected' : 'disconnected'}`}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.name}
                      {c.model && <span className="badge badge-info" style={{ fontSize: '.65rem' }}>{c.model}</span>}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      UDP {c.ip}:9910
                    </div>
                  </div>
                  <button
                    className="btn btn-icon btn-ghost btn-sm"
                    title="Delete connection"
                    onClick={(e) => deleteConn(c.id, e)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {conn && (
            <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={testConn} disabled={testing}>
                {testing ? '⏳ Connecting…' : '🔌 Connect / Test'}
              </button>
              <div style={{ fontSize: '.8rem', color: status?.connected ? 'var(--green)' : 'var(--text-muted)' }}>
                {status?.connected ? `● Online (${status.model || 'ATEM'})` : '○ Standby / Offline'}
              </div>
            </div>
          )}
        </div>

        {/* Hardware Status Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📡 Hardware Engines</span>
            {status?.model && <span className="badge badge-online">{status.model}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>USB SSD Recording</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={`badge ${status?.recording ? 'badge-danger' : 'badge-offline'}`}>
                  {status?.recording ? '⏺ RECORDING' : 'IDLE'}
                </span>
                <button
                  className={`btn btn-xs ${status?.recording ? 'btn-danger' : 'btn-outline'}`}
                  onClick={() => doAction(status?.recording ? 'stopRecording' : 'startRecording')}
                >
                  {status?.recording ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Hardware Streaming</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={`badge ${status?.streaming ? 'badge-online' : 'badge-offline'}`}>
                  {status?.streaming ? '📡 LIVE ON AIR' : 'OFF AIR'}
                </span>
                <button
                  className={`btn btn-xs ${status?.streaming ? 'btn-danger' : 'btn-outline'}`}
                  onClick={() => doAction(status?.streaming ? 'stopStreaming' : 'startStreaming')}
                >
                  {status?.streaming ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>
          </div>

          {/* DSK Overlay */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 'var(--radius)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '.85rem' }}>Downstream Keyer (DSK 1)</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Graphics overlay tie</div>
            </div>
            <button
              className={`btn btn-sm ${status?.downstreamKeyer ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => doAction('setDownstreamKey', { onAir: !status?.downstreamKeyer })}
            >
              {status?.downstreamKeyer ? '🔴 DSK ON AIR' : 'DSK OFF'}
            </button>
          </div>
        </div>

        {/* Macro Triggers */}
        {status?.macros && status.macros.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">⚡ ATEM Macros</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
              {status.macros.map(m => (
                <button
                  key={m.index}
                  className="btn btn-sm"
                  style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => doAction('runMacro', { index: m.index })}
                  title={m.name}
                >
                  ▶ {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Log */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📝 ATEM Activity Log</span>
          </div>
          <div className="log-panel">
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No ATEM actions recorded yet</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className="log-type atem">atem</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Broadcast Switcher Panel (Program / Preview / Transitions) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="atem-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.5px' }}>
                🔴 BROADCAST SWITCHER BUS
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                Two-way sync: pressing buttons on the physical ATEM console lights up buttons here.
              </div>
            </div>
            {status?.fadeToBlack && (
              <div className="badge badge-danger" style={{ animation: 'ftb-pulse 1s infinite alternate', fontSize: '.75rem' }}>
                FADE TO BLACK ACTIVE
              </div>
            )}
          </div>

          {/* Program Bus (Red) */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }}></span>
              <span style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--red)', letterSpacing: '1px' }}>PROGRAM (ON AIR)</span>
            </div>
            <div className="atem-bus">
              {inputsToDisplay.map(inp => {
                const isPgm = status?.programInput === inp.id;
                return (
                  <button
                    key={inp.id}
                    className={`atem-bus-btn ${isPgm ? 'pgm' : ''}`}
                    onClick={() => doAction('setProgram', { input: inp.id })}
                    title={inp.longName}
                  >
                    <span>{inp.shortName}</span>
                    <span className="inp-sub">#{inp.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Bus (Green) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }}></span>
              <span style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--green)', letterSpacing: '1px' }}>PREVIEW (NEXT CUE)</span>
            </div>
            <div className="atem-bus">
              {inputsToDisplay.map(inp => {
                const isPvw = status?.previewInput === inp.id;
                return (
                  <button
                    key={inp.id}
                    className={`atem-bus-btn ${isPvw ? 'pvw' : ''}`}
                    onClick={() => doAction('setPreview', { input: inp.id })}
                    title={inp.longName}
                  >
                    <span>{inp.shortName}</span>
                    <span className="inp-sub">#{inp.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transition Control Bar */}
          <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>
              Transition & Cut Controls
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="atem-trans-btn cut"
                style={{ minWidth: 100, fontSize: '1rem', padding: '14px 24px' }}
                onClick={() => doAction('cut')}
              >
                CUT
              </button>

              <button
                className="atem-trans-btn auto"
                style={{ minWidth: 100, fontSize: '1rem', padding: '14px 24px' }}
                onClick={() => doAction('auto')}
              >
                AUTO
              </button>

              <button
                className={`atem-trans-btn ftb ${status?.fadeToBlack ? 'active' : ''}`}
                style={{ padding: '14px 20px' }}
                onClick={() => doAction('fadeToBlack')}
                title="Fade to Black"
              >
                FTB
              </button>

              {/* Transition Style Selector */}
              <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', marginLeft: 'auto' }}>
                {transitionStyles.map(st => (
                  <button
                    key={st.id}
                    style={{
                      padding: '8px 12px',
                      fontSize: '.75rem',
                      fontWeight: 700,
                      background: status?.transitionStyle === st.id ? 'var(--accent)' : 'transparent',
                      color: status?.transitionStyle === st.id ? '#000' : 'var(--text-primary)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background .15s',
                    }}
                    onClick={() => doAction('setTransitionStyle', { style: st.id })}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Virtual T-Bar Slider */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Interactive T-Bar Fader</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{tbarVal}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={tbarVal}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setTbarVal(v);
                  doAction('setTransitionPosition', { position: v / 100 });
                }}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: 'var(--orange)',
                  height: 8,
                }}
              />
            </div>
          </div>
        </div>

        {/* Inputs Overview Table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📋 Input Source Mapping</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Input #</th>
                  <th>Label</th>
                  <th>Full Name</th>
                  <th>Live Status</th>
                  <th>Quick Action</th>
                </tr>
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
      </div>

      {/* Add Connection Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Add Blackmagic ATEM Switcher</h2>
            <div className="form-group">
              <label className="form-label">Switcher Label</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="ATEM Mini Pro / Extreme"
              />
            </div>
            <div className="form-group">
              <label className="form-label">IP Address on Local Network</label>
              <input
                className="form-input"
                value={form.ip}
                onChange={e => setForm({ ...form, ip: e.target.value })}
                placeholder="192.168.1.50"
              />
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Default ATEM IP is usually 192.168.10.240 or assigned by your router's DHCP.
              </span>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addConn}>Add Switcher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
