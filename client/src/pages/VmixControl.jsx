import { useState, useEffect } from 'react';
import { vmixApi, analyticsApi } from '../api/client';

export default function VmixControl() {
  const [connections, setConnections] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: 'vMix', host: '127.0.0.1', port: 8088 });
  const [testing, setTesting] = useState(false);

  const loadConns = () => vmixApi.connections().then(d => { setConnections(d.connections || []); if (!active && d.connections?.[0]) setActive(d.connections[0].id); }).catch(console.error);
  const loadLogs = () => analyticsApi.logs('vmix', 30).then(d => setLogs(d.logs || [])).catch(console.error);

  useEffect(() => { loadConns(); loadLogs(); }, []);

  useEffect(() => {
    if (!active) return;
    const poll = () => vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }).catch(() => setStatus(null));
    poll(); const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [active]);

  const testConn = async () => { setTesting(true); try { const r = await vmixApi.test(active); alert(r.connected ? '✅ Connected to vMix!' : '❌ Failed: ' + r.error); loadConns(); loadLogs(); } catch (e) { alert('❌ ' + e.message); } setTesting(false); };
  const doAction = async (action, params) => { try { await vmixApi.action(active, action, params); loadLogs(); if (['setPreview','setProgram','cut','fade'].includes(action)) vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }); } catch (e) { alert('❌ ' + e.message); } };
  const addConn = async () => { await vmixApi.createConn(form); setShowAdd(false); loadConns(); };

  const conn = connections.find(c => c.id === active);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Connection Panel */}
      <div className="card">
        <div className="card-header"><span className="card-title">🔗 vMix Connection</span><button className="btn btn-sm" onClick={() => setShowAdd(true)}>➕ Add</button></div>
        {connections.length === 0 ? <p style={{color:'var(--text-muted)'}}>No connections configured</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connections.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius)', background: active === c.id ? 'var(--bg-card-hover)' : 'transparent', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => setActive(c.id)}>
                <span className={`conn-dot ${c.is_connected ? 'connected' : 'disconnected'}`}></span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{c.host}:{c.port}</div></div>
              </div>
            ))}
          </div>
        )}
        {conn && <div style={{ marginTop: 12, display: 'flex', gap: 8 }}><button className="btn btn-primary btn-sm" onClick={testConn} disabled={testing}>{testing ? '⏳ Testing…' : '🔌 Test Connection'}</button></div>}
      </div>

      {/* Production Controls */}
      <div className="card">
        <div className="card-header"><span className="card-title">🎬 Production Controls</span>{status && <span className="badge badge-online">v{status.version}</span>}</div>
        {!status ? <p style={{color:'var(--text-muted)'}}>Connect to vMix to enable controls</p> : (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div className="form-label">Program Bus (Active)</div>
              <div className="vmix-bus">{(status.inputs || []).map(inp => (
                <button key={inp.number} className={`vmix-bus-btn ${inp.number === status.activeInput ? 'pgm' : ''}`} onClick={() => doAction('setProgram', { input: inp.number })} title={inp.title}>{inp.number}</button>
              ))}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="form-label">Preview Bus</div>
              <div className="vmix-bus">{(status.inputs || []).map(inp => (
                <button key={inp.number} className={`vmix-bus-btn ${inp.number === status.previewInput ? 'pvw' : ''}`} onClick={() => doAction('setPreview', { input: inp.number })} title={inp.title}>{inp.number}</button>
              ))}</div>
            </div>
            <div className="vmix-transition-bar">
              <button className="vmix-trans-btn cut" onClick={() => doAction('cut')}>CUT</button>
              <button className="vmix-trans-btn fade" onClick={() => doAction('fade', { duration: 1000 })}>FADE</button>
              <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 1 })}>T1</button>
              <button className="vmix-trans-btn" onClick={() => doAction('transition', { number: 2 })}>T2</button>
              <div style={{ flex: 1 }}></div>
              <button className={`btn btn-sm ${status.recording ? 'btn-danger' : 'btn-success'}`} onClick={() => doAction(status.recording ? 'stopRecording' : 'startRecording')}>{status.recording ? '⏹ Stop Rec' : '⏺ Record'}</button>
              <button className={`btn btn-sm ${status.streaming ? 'btn-danger' : 'btn-success'}`} onClick={() => doAction(status.streaming ? 'stopStreaming' : 'startStreaming')}>{status.streaming ? '⏹ Stop Stream' : '📡 Stream'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Inputs List */}
      <div className="card">
        <div className="card-header"><span className="card-title">📋 vMix Inputs</span></div>
        {!status?.inputs?.length ? <p style={{color:'var(--text-muted)'}}>No inputs available</p> : (
          <div className="table-wrap"><table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>State</th><th>Actions</th></tr></thead><tbody>
            {status.inputs.map(inp => (
              <tr key={inp.number}><td style={{fontFamily:'var(--mono)',fontWeight:700}}>{inp.number}</td><td>{inp.title}</td><td><span className="badge badge-info">{inp.type}</span></td><td>{inp.state}</td>
                <td><div style={{display:'flex',gap:4}}><button className="btn btn-sm" onClick={() => doAction('setPreview', { input: inp.number })}>PVW</button><button className="btn btn-sm btn-danger" onClick={() => doAction('setProgram', { input: inp.number })}>PGM</button><button className="btn btn-sm" onClick={() => doAction('quickPlay', { input: inp.number })}>▶</button><button className="btn btn-sm" onClick={() => doAction('fullscreen', { input: inp.number })}>⛶</button></div></td></tr>
            ))}
          </tbody></table></div>
        )}
      </div>

      {/* vMix Action Log */}
      <div className="card">
        <div className="card-header"><span className="card-title">📝 vMix Action Log</span></div>
        <div className="log-panel">
          {logs.length === 0 ? <p style={{color:'var(--text-muted)'}}>No vMix actions logged</p> : logs.map((log, i) => (
            <div key={i} className="log-entry"><span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span><span className="log-type vmix">vmix</span><span className="log-msg">{log.message}</span></div>
          ))}
        </div>
      </div>

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
