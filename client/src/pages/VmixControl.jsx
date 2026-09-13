import { useState, useEffect, useCallback } from 'react';
import { vmixApi, analyticsApi } from '../api/client';

export default function VmixControl() {
  const [connections, setConnections] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: 'vMix', host: '127.0.0.1', port: 8088 });
  const [testing, setTesting] = useState(false);
  const [faderValue, setFaderValue] = useState(0);
  const [volumes, setVolumes] = useState({});
  const [masterVol, setMasterVol] = useState(100);
  const [busAVol, setBusAVol] = useState(100);
  const [busBVol, setBusBVol] = useState(100);
  const [mutedInputs, setMutedInputs] = useState({});
  const [soloInputs, setSoloInputs] = useState({});
  const [overlays, setOverlays] = useState({ 1: false, 2: false, 3: false, 4: false });
  const [overlayInputs, setOverlayInputs] = useState({ 1: '', 2: '', 3: '', 4: '' });
  const [titleInput, setTitleInput] = useState('');
  const [titleIndex, setTitleIndex] = useState(0);
  const [titleValue, setTitleValue] = useState('');
  const [activeSection, setActiveSection] = useState('controls');

  const loadConns = () => vmixApi.connections().then(d => {
    setConnections(d.connections || []);
    if (!active && d.connections?.[0]) setActive(d.connections[0].id);
  }).catch(console.error);

  const loadLogs = () => analyticsApi.logs('vmix', 30).then(d => setLogs(d.logs || [])).catch(console.error);

  useEffect(() => { loadConns(); loadLogs(); }, []);

  useEffect(() => {
    if (!active) return;
    const poll = () => vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }).catch(() => setStatus(null));
    poll(); const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [active]);

  const testConn = async () => {
    setTesting(true);
    try {
      const r = await vmixApi.test(active);
      alert(r.connected ? '✅ Connected to vMix!' : '❌ Failed: ' + r.error);
      loadConns(); loadLogs();
    } catch (e) { alert('❌ ' + e.message); }
    setTesting(false);
  };

  const doAction = useCallback(async (action, params) => {
    try {
      await vmixApi.action(active, action, params);
      loadLogs();
      if (['setPreview','setProgram','cut','fade','fadeToBlack','overlayOn','overlayOff','overlayToggle'].includes(action)) {
        vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); });
      }
    } catch (e) { alert('❌ ' + e.message); }
  }, [active]);

  const addConn = async () => { await vmixApi.createConn(form); setShowAdd(false); loadConns(); };

  const handleVolumeChange = (input, val) => {
    setVolumes(v => ({ ...v, [input]: val }));
    doAction('setVolume', { input, volume: val });
  };

  const handleMuteToggle = (input) => {
    const newMuted = !mutedInputs[input];
    setMutedInputs(m => ({ ...m, [input]: newMuted }));
    doAction(newMuted ? 'mute' : 'unmute', { input });
  };

  const handleSoloToggle = (input) => {
    const newSolo = !soloInputs[input];
    setSoloInputs(s => ({ ...s, [input]: newSolo }));
    doAction('soloToggle', { input });
  };

  const handleOverlayToggle = (num) => {
    const newState = !overlays[num];
    setOverlays(o => ({ ...o, [num]: newState }));
    if (newState && overlayInputs[num]) {
      doAction('overlayOn', { number: num, input: overlayInputs[num] });
    } else {
      doAction('overlayOff', { number: num });
    }
  };

  const handleFaderChange = (val) => {
    setFaderValue(val);
    doAction('setFader', { value: val });
  };

  const conn = connections.find(c => c.id === active);

  const tabs = [
    { key: 'controls', label: '🎬 Controls', icon: '🎬' },
    { key: 'audio', label: '🔊 Audio Mixer', icon: '🔊' },
    { key: 'overlays', label: '🖼️ Overlays', icon: '🖼️' },
    { key: 'playback', label: '▶ Playback', icon: '▶' },
    { key: 'replay', label: '⏪ Replay', icon: '⏪' },
    { key: 'titles', label: '📝 Titles', icon: '📝' },
    { key: 'inputs', label: '📋 Inputs', icon: '📋' },
    { key: 'log', label: '📜 Log', icon: '📜' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ═══ Top: Connection ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔗 vMix Connection</span>
            <button className="btn btn-sm" onClick={() => setShowAdd(true)}>➕ Add</button>
          </div>
          {connections.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No connections configured</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connections.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius)', background: active === c.id ? 'var(--bg-card-hover)' : 'transparent', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => setActive(c.id)}>
                  <span className={`conn-dot ${c.is_connected ? 'connected' : 'disconnected'}`}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{c.host}:{c.port}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {conn && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={testConn} disabled={testing}>
                {testing ? '⏳ Testing…' : '🔌 Test Connection'}
              </button>
            </div>
          )}
        </div>

        {/* Status Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Status</span>
            {status && <span className="badge badge-online">v{status.version}</span>}
          </div>
          {!status ? (
            <p style={{ color: 'var(--text-muted)' }}>Not connected</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Edition</div>
                <div className="vmix-stat-value">{status.edition || 'N/A'}</div>
              </div>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Recording</div>
                <div className="vmix-stat-value" style={{ color: status.recording ? '#ef4444' : '#94a3b8' }}>
                  {status.recording ? '⏺ REC' : '⏸ Idle'}
                </div>
              </div>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Streaming</div>
                <div className="vmix-stat-value" style={{ color: status.streaming ? '#22c55e' : '#94a3b8' }}>
                  {status.streaming ? '📡 LIVE' : '⏸ Idle'}
                </div>
              </div>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Inputs</div>
                <div className="vmix-stat-value">{status.inputs?.length || 0}</div>
              </div>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Active (PGM)</div>
                <div className="vmix-stat-value" style={{ color: '#ef4444' }}>Input {status.activeInput}</div>
              </div>
              <div className="vmix-stat-card">
                <div className="vmix-stat-label">Preview (PVW)</div>
                <div className="vmix-stat-value" style={{ color: '#22c55e' }}>Input {status.previewInput}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section Tabs ═══ */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveSection(t.key)} style={{
              padding: '10px 18px', background: activeSection === t.key ? 'var(--accent)' : 'transparent',
              color: activeSection === t.key ? '#fff' : 'var(--text-secondary)', border: 'none',
              cursor: 'pointer', fontWeight: 600, fontSize: '.82rem', whiteSpace: 'nowrap',
              borderBottom: activeSection === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all .15s'
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {/* ═══ CONTROLS TAB ═══ */}
          {activeSection === 'controls' && status && (
            <div>
              {/* Program Bus */}
              <div style={{ marginBottom: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>🔴 Program Bus (Live Output)</div>
                <div className="vmix-bus">
                  {(status.inputs || []).map(inp => (
                    <button key={inp.number} className={`vmix-bus-btn ${inp.number === status.activeInput ? 'pgm' : ''}`} onClick={() => doAction('setProgram', { input: inp.number })} title={inp.title}>
                      {inp.number}
                    </button>
                  ))}
                </div>
              </div>
              {/* Preview Bus */}
              <div style={{ marginBottom: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>🟢 Preview Bus</div>
                <div className="vmix-bus">
                  {(status.inputs || []).map(inp => (
                    <button key={inp.number} className={`vmix-bus-btn ${inp.number === status.previewInput ? 'pvw' : ''}`} onClick={() => doAction('setPreview', { input: inp.number })} title={inp.title}>
                      {inp.number}
                    </button>
                  ))}
                </div>
              </div>
              {/* Transition Bar */}
              <div className="vmix-transition-bar" style={{ flexWrap: 'wrap' }}>
                <button className="vmix-trans-btn cut" onClick={() => doAction('cut')}>CUT</button>
                <button className="vmix-trans-btn fade" onClick={() => doAction('fade', { duration: 1000 })}>FADE</button>
                <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 1 })}>T1</button>
                <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 2 })}>T2</button>
                <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 3 })}>T3</button>
                <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 4 })}>T4</button>
                <div style={{ width: 1, height: 28, background: 'var(--border)' }}></div>
                <button className="vmix-trans-btn" style={{ background: '#1e293b', color: '#ef4444', border: '2px solid #ef4444' }} onClick={() => doAction('fadeToBlack')}>FTB</button>
              </div>
              {/* T-Bar Slider */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>T-Bar</span>
                <input type="range" min="0" max="255" value={faderValue} onChange={e => handleFaderChange(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '.75rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)', minWidth: 40 }}>{faderValue}/255</span>
              </div>
              {/* Record / Stream / Snapshot */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`btn btn-sm ${status.recording ? 'btn-danger' : 'btn-success'}`} onClick={() => doAction(status.recording ? 'stopRecording' : 'startRecording')}>
                  {status.recording ? '⏹ Stop Recording' : '⏺ Start Recording'}
                </button>
                <button className={`btn btn-sm ${status.streaming ? 'btn-danger' : 'btn-success'}`} onClick={() => doAction(status.streaming ? 'stopStreaming' : 'startStreaming')}>
                  {status.streaming ? '⏹ Stop Streaming' : '📡 Start Streaming'}
                </button>
                <button className="btn btn-sm" onClick={() => doAction('snapshot')}>📷 Snapshot</button>
                <button className="btn btn-sm" onClick={() => doAction('fullscreenOff')}>⛶ Exit Fullscreen</button>
              </div>
            </div>
          )}
          {activeSection === 'controls' && !status && (
            <p style={{ color: 'var(--text-muted)' }}>Connect to vMix to enable controls</p>
          )}

          {/* ═══ AUDIO MIXER TAB ═══ */}
          {activeSection === 'audio' && status && (
            <div>
              {/* Master & Bus Volumes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>🔊 Master Volume</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="0" max="100" value={masterVol} onChange={e => { setMasterVol(parseInt(e.target.value)); doAction('setMasterVolume', { volume: parseInt(e.target.value) }); }} style={{ flex: 1, accentColor: '#22c55e' }} />
                    <span style={{ fontSize: '.75rem', fontFamily: 'var(--mono)', minWidth: 30 }}>{masterVol}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => doAction('masterAudioOn')}>🔊 On</button>
                    <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={() => doAction('masterAudioOff')}>🔇 Mute</button>
                  </div>
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>🅰️ Bus A Volume</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="0" max="100" value={busAVol} onChange={e => { setBusAVol(parseInt(e.target.value)); doAction('setBusVolume', { bus: 'A', volume: parseInt(e.target.value) }); }} style={{ flex: 1, accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '.75rem', fontFamily: 'var(--mono)', minWidth: 30 }}>{busAVol}%</span>
                  </div>
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: 6 }}>🅱️ Bus B Volume</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="0" max="100" value={busBVol} onChange={e => { setBusBVol(parseInt(e.target.value)); doAction('setBusVolume', { bus: 'B', volume: parseInt(e.target.value) }); }} style={{ flex: 1, accentColor: '#f59e0b' }} />
                    <span style={{ fontSize: '.75rem', fontFamily: 'var(--mono)', minWidth: 30 }}>{busBVol}%</span>
                  </div>
                </div>
              </div>

              {/* Per-Input Audio */}
              <div className="form-label" style={{ marginBottom: 8 }}>🎤 Input Audio</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {(status.inputs || []).map(inp => (
                  <div key={inp.number} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: '.85rem' }}>#{inp.number} {inp.title?.substring(0, 14)}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleMuteToggle(inp.number)} style={{
                          background: mutedInputs[inp.number] ? '#ef4444' : '#334155', color: '#fff',
                          border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '.7rem', fontWeight: 700
                        }}>
                          {mutedInputs[inp.number] ? '🔇' : '🔊'}
                        </button>
                        <button onClick={() => handleSoloToggle(inp.number)} style={{
                          background: soloInputs[inp.number] ? '#f59e0b' : '#334155', color: '#fff',
                          border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '.7rem', fontWeight: 700
                        }}>
                          S
                        </button>
                      </div>
                    </div>
                    <input type="range" min="0" max="100" value={volumes[inp.number] || 100}
                      onChange={e => handleVolumeChange(inp.number, parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: mutedInputs[inp.number] ? '#ef4444' : '#22c55e' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      <span>{volumes[inp.number] || 100}%</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => doAction('audioBusOn', { input: inp.number, bus: 'A' })} style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: 3, padding: '0 4px', cursor: 'pointer', fontSize: '.65rem' }}>A</button>
                        <button onClick={() => doAction('audioBusOn', { input: inp.number, bus: 'B' })} style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: 3, padding: '0 4px', cursor: 'pointer', fontSize: '.65rem' }}>B</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeSection === 'audio' && !status && <p style={{ color: 'var(--text-muted)' }}>Connect to vMix first</p>}

          {/* ═══ OVERLAYS TAB ═══ */}
          {activeSection === 'overlays' && status && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[1, 2, 3, 4].map(num => (
                  <div key={num} style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: `2px solid ${overlays[num] ? '#22c55e' : 'var(--border)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>Overlay {num}</span>
                      <span style={{ fontSize: '.75rem', padding: '2px 8px', borderRadius: 4, background: overlays[num] ? '#22c55e20' : '#ef444420', color: overlays[num] ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {overlays[num] ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Input Number</label>
                      <input className="form-input" type="number" placeholder="Input #" value={overlayInputs[num]} onChange={e => setOverlayInputs(o => ({ ...o, [num]: e.target.value }))} style={{ marginTop: 4 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-success" onClick={() => { if (overlayInputs[num]) { doAction('overlayOn', { number: num, input: overlayInputs[num] }); setOverlays(o => ({ ...o, [num]: true })); } }}>ON</button>
                      <button className="btn btn-sm btn-danger" onClick={() => { doAction('overlayOff', { number: num }); setOverlays(o => ({ ...o, [num]: false })); }}>OFF</button>
                      <button className="btn btn-sm" onClick={() => handleOverlayToggle(num)}>Toggle</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeSection === 'overlays' && !status && <p style={{ color: 'var(--text-muted)' }}>Connect to vMix first</p>}

          {/* ═══ PLAYBACK TAB ═══ */}
          {activeSection === 'playback' && status && (
            <div>
              <div className="form-label" style={{ marginBottom: 12 }}>🎬 Input Playback Controls</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {(status.inputs || []).filter(i => ['Video', 'VideoList', 'AudioFile', 'Flash', 'GT'].includes(i.type)).length === 0 && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No video/audio inputs found. Showing controls for all inputs:</p>
                  </div>
                )}
                {(status.inputs || []).map(inp => (
                  <div key={inp.number} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <span>#{inp.number} {inp.title?.substring(0, 20)}</span>
                      <span className="badge badge-info" style={{ fontSize: '.65rem' }}>{inp.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-success" onClick={() => doAction('play', { input: inp.number })}>▶ Play</button>
                      <button className="btn btn-sm" onClick={() => doAction('pause', { input: inp.number })}>⏸ Pause</button>
                      <button className="btn btn-sm" onClick={() => doAction('restart', { input: inp.number })}>⏮ Restart</button>
                      <button className="btn btn-sm" onClick={() => doAction('loopOn', { input: inp.number })}>🔁 Loop</button>
                      <button className="btn btn-sm" onClick={() => doAction('loopOff', { input: inp.number })}>🔁̸ No Loop</button>
                      <button className="btn btn-sm" onClick={() => doAction('quickPlay', { input: inp.number })}>⚡ Quick</button>
                      <button className="btn btn-sm" onClick={() => doAction('fullscreen', { input: inp.number })}>⛶ Full</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeSection === 'playback' && !status && <p style={{ color: 'var(--text-muted)' }}>Connect to vMix first</p>}

          {/* ═══ REPLAY TAB ═══ */}
          {activeSection === 'replay' && (
            <div>
              <div className="form-label" style={{ marginBottom: 12 }}>⏪ Replay Controls</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-success" onClick={() => doAction('replayPlay')}>▶ Play</button>
                <button className="btn btn-sm" onClick={() => doAction('replayPause')}>⏸ Pause</button>
                <button className="btn btn-sm" onClick={() => doAction('replayJumpToNow')}>⏭ Jump to Now</button>
                <button className="btn btn-sm" onClick={() => doAction('replayMoveLastEvent')}>📌 Last Event</button>
                <div style={{ width: 1, height: 28, background: 'var(--border)' }}></div>
                <button className="btn btn-sm" onClick={() => doAction('replayFastBackward', { speed: 2 })}>⏪ 2x</button>
                <button className="btn btn-sm" onClick={() => doAction('replayFastBackward', { speed: 4 })}>⏪ 4x</button>
                <button className="btn btn-sm" onClick={() => doAction('replayFastForward', { speed: 2 })}>⏩ 2x</button>
                <button className="btn btn-sm" onClick={() => doAction('replayFastForward', { speed: 4 })}>⏩ 4x</button>
                <div style={{ width: 1, height: 28, background: 'var(--border)' }}></div>
                <button className="btn btn-sm" style={{ background: '#22c55e', color: '#000' }} onClick={() => doAction('replayMarkIn')}>Mark IN</button>
                <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={() => doAction('replayMarkOut')}>Mark OUT</button>
              </div>
            </div>
          )}

          {/* ═══ TITLES TAB ═══ */}
          {activeSection === 'titles' && status && (
            <div>
              <div className="form-label" style={{ marginBottom: 12 }}>📝 Title / Text Editor</div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 1fr auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Input #</label>
                  <select className="form-input" value={titleInput} onChange={e => setTitleInput(e.target.value)}>
                    <option value="">Select...</option>
                    {(status.inputs || []).map(inp => (
                      <option key={inp.number} value={inp.number}>#{inp.number} {inp.title?.substring(0, 15)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Index</label>
                  <input className="form-input" type="number" min="0" value={titleIndex} onChange={e => setTitleIndex(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '.75rem' }}>Text Value</label>
                  <input className="form-input" value={titleValue} onChange={e => setTitleValue(e.target.value)} placeholder="Enter new text..." />
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { if (titleInput && titleValue) doAction('setTitle', { input: titleInput, index: titleIndex, value: titleValue }); }} style={{ height: 36 }}>
                  Apply
                </button>
              </div>
              <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 10 }}>
                Use this to update text in Title/GT inputs. Index 0 = first text field, 1 = second, etc.
              </p>
            </div>
          )}
          {activeSection === 'titles' && !status && <p style={{ color: 'var(--text-muted)' }}>Connect to vMix first</p>}

          {/* ═══ INPUTS TAB ═══ */}
          {activeSection === 'inputs' && status && (
            <div>
              {!status?.inputs?.length ? (
                <p style={{ color: 'var(--text-muted)' }}>No inputs available</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>Title</th><th>Type</th><th>State</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {status.inputs.map(inp => (
                        <tr key={inp.number}>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{inp.number}</td>
                          <td>{inp.title}</td>
                          <td><span className="badge badge-info">{inp.type}</span></td>
                          <td>{inp.state}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <button className="btn btn-sm" onClick={() => doAction('setPreview', { input: inp.number })}>PVW</button>
                              <button className="btn btn-sm btn-danger" onClick={() => doAction('setProgram', { input: inp.number })}>PGM</button>
                              <button className="btn btn-sm" onClick={() => doAction('play', { input: inp.number })}>▶</button>
                              <button className="btn btn-sm" onClick={() => doAction('pause', { input: inp.number })}>⏸</button>
                              <button className="btn btn-sm" onClick={() => doAction('fullscreen', { input: inp.number })}>⛶</button>
                              <button className="btn btn-sm" onClick={() => doAction('snapshotInput', { input: inp.number })}>📷</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {activeSection === 'inputs' && !status && <p style={{ color: 'var(--text-muted)' }}>Connect to vMix first</p>}

          {/* ═══ LOG TAB ═══ */}
          {activeSection === 'log' && (
            <div>
              <div className="log-panel" style={{ maxHeight: 400 }}>
                {logs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No vMix actions logged</p>
                ) : logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                    <span className="log-type vmix">vmix</span>
                    <span className="log-msg">{log.message}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <button className="btn btn-sm" onClick={loadLogs}>🔄 Refresh Logs</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Add Connection Modal ═══ */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Add vMix Connection</h2>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Host IP</label><input className="form-input" value={form.host} onChange={e => setForm({...form, host: e.target.value})} placeholder="127.0.0.1" /></div>
            <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={form.port} onChange={e => setForm({...form, port: parseInt(e.target.value)})} /></div>
            <div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={addConn}>Add Connection</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
