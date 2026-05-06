import { useState, useEffect, useRef } from 'react';
import { devicesApi, analyticsApi, streamsApi, vmixApi } from '../api/client';
import { productionSocket } from '../socket';

export default function Production() {
  const [devices, setDevices] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [grid, setGrid] = useState('2x2');
  const [pgm, setPgm] = useState(null);
  const [pvw, setPvw] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [vmixConns, setVmixConns] = useState([]);
  const [vmixActive, setVmixActive] = useState(null);
  const [vmixStatus, setVmixStatus] = useState(null);
  const [fullscreen, setFullscreen] = useState(null);
  const timerRef = useRef(null);

  const load = async () => {
    try {
      const [d, l, v] = await Promise.all([devicesApi.list(), analyticsApi.logs('', 30), vmixApi.connections()]);
      const devs = d.devices || [];
      setAllDevices(devs);
      setDevices(devs.length > 0 ? devs : demoCams);
      setLogs(l.logs || []);
      setVmixConns(v.connections || []);
      if (!vmixActive && v.connections?.[0]) setVmixActive(v.connections[0].id);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    load();
    productionSocket.connect();
    productionSocket.on('device:heartbeat', (data) => {
      setDevices(prev => prev.map(d => d.id === data.device_id ? { ...d, battery_percent: data.battery, signal_quality: data.signal, stream_fps: data.fps, stream_bitrate: data.bitrate, stream_resolution: data.resolution } : d));
    });
    productionSocket.on('device:online', load);
    productionSocket.on('device:offline', load);
    productionSocket.on('log:new', (log) => setLogs(prev => [log, ...prev].slice(0, 50)));
    const id = setInterval(load, 20000);
    return () => { clearInterval(id); productionSocket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!vmixActive) return;
    const poll = () => vmixApi.status(vmixActive).then(d => { if (d.success) setVmixStatus(d.status); }).catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [vmixActive]);

  const demoCams = [
    { id: 'd1', name: 'CAM 1 — Main Hall', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 4500, battery_percent: 87, signal_quality: 92, tally_state: 'off' },
    { id: 'd2', name: 'CAM 2 — Stage Left', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 3800, battery_percent: 64, signal_quality: 78, tally_state: 'off' },
    { id: 'd3', name: 'CAM 3 — Wide Shot', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 4200, battery_percent: 45, signal_quality: 85, tally_state: 'off' },
    { id: 'd4', name: 'CAM 4 — Close Up', is_online: false, stream_resolution: '1280x720', stream_fps: 25, stream_bitrate: 2800, battery_percent: 23, signal_quality: 55, tally_state: 'off' },
  ];

  const selectPgm = (id) => { setPgm(id); devicesApi.setTally(id, 'program').catch(() => {}); if (pgm && pgm !== id) devicesApi.setTally(pgm, pvw === pgm ? 'preview' : 'off').catch(() => {}); };
  const selectPvw = (id) => { setPvw(id); devicesApi.setTally(id, 'preview').catch(() => {}); if (pvw && pvw !== id) devicesApi.setTally(pvw, pgm === pvw ? 'program' : 'off').catch(() => {}); };

  const doCut = () => { if (pvw) { const old = pgm; selectPgm(pvw); if (old) selectPvw(old); } };
  const doFade = () => { doCut(); };
  const doAutoTransition = () => { doCut(); };

  const doVmixAction = async (action, params) => {
    if (!vmixActive) return;
    try { await vmixApi.action(vmixActive, action, params); load(); } catch (e) { console.error(e); }
  };

  const goLive = () => { setIsLive(true); setElapsed(0); timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000); };
  const goOff = () => { setIsLive(false); clearInterval(timerRef.current); setElapsed(0); };

  const fmtTime = (s) => { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };

  const pgmDevice = devices.find(d => d.id === pgm);
  const pvwDevice = devices.find(d => d.id === pvw);
  const gridCount = grid === '1x1' ? 1 : grid === '2x2' ? 4 : grid === '3x3' ? 9 : 16;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: 'calc(100vh - var(--header-h) - 48px)' }}>

      {/* ═══ TOP STATUS BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', marginBottom: 8 }}>
        {isLive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-live" style={{ fontSize: '.85rem', padding: '5px 14px' }}><span className="badge-dot"></span>ON AIR</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>{fmtTime(elapsed)}</span>
          </div>
        ) : (
          <span className="badge badge-offline" style={{ fontSize: '.85rem', padding: '5px 14px' }}>OFF AIR</span>
        )}
        <div style={{ flex: 1 }}></div>
        <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>📹 {devices.filter(d=>d.is_online).length}/{devices.length} cams</span>
        {vmixStatus && <span className="badge badge-online" style={{ fontSize: '.7rem' }}>vMix v{vmixStatus.version}</span>}
        <div style={{ display: 'flex', gap: 6 }}>
          {['1x1','2x2','3x3'].map(g => <button key={g} className={`btn btn-sm ${grid===g?'btn-primary':''}`} onClick={()=>setGrid(g)} style={{padding:'4px 10px',fontSize:'.75rem'}}>{g}</button>)}
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, flex: 1, overflow: 'hidden' }}>

        {/* ═══ LEFT: Program/Preview + Multiview ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

          {/* PROGRAM & PREVIEW MONITORS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* PROGRAM */}
            <div style={{ background: 'var(--bg-card)', border: '2px solid var(--red)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--red)', color: '#fff' }}>
                <span style={{ fontWeight: 800, fontSize: '.8rem', letterSpacing: 1 }}>PROGRAM</span>
                <span style={{ fontSize: '.7rem', fontFamily: 'var(--mono)' }}>{pgmDevice?.name || '—'}</span>
              </div>
              <div style={{ aspectRatio: '16/9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {pgmDevice ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a0000 0%, #0a0a0a 100%)' }}>
                    <span style={{ fontSize: '2.5rem' }}>📹</span>
                    <span style={{ fontWeight: 700, marginTop: 4, fontSize: '.9rem' }}>{pgmDevice.name}</span>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '.7rem', fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>
                      <span>{pgmDevice.stream_resolution}</span><span>{pgmDevice.stream_fps}fps</span><span>{pgmDevice.stream_bitrate}kbps</span>
                    </div>
                  </div>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>No source selected</span>}
              </div>
            </div>

            {/* PREVIEW */}
            <div style={{ background: 'var(--bg-card)', border: '2px solid var(--green)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--green)', color: '#000' }}>
                <span style={{ fontWeight: 800, fontSize: '.8rem', letterSpacing: 1 }}>PREVIEW</span>
                <span style={{ fontSize: '.7rem', fontFamily: 'var(--mono)' }}>{pvwDevice?.name || '—'}</span>
              </div>
              <div style={{ aspectRatio: '16/9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pvwDevice ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #001a00 0%, #0a0a0a 100%)' }}>
                    <span style={{ fontSize: '2.5rem' }}>📹</span>
                    <span style={{ fontWeight: 700, marginTop: 4, fontSize: '.9rem' }}>{pvwDevice.name}</span>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '.7rem', fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>
                      <span>{pvwDevice.stream_resolution}</span><span>{pvwDevice.stream_fps}fps</span><span>{pvwDevice.stream_bitrate}kbps</span>
                    </div>
                  </div>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>No source selected</span>}
              </div>
            </div>
          </div>

          {/* MULTIVIEW */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className={`multiview grid-${grid}`} style={{ height: '100%' }}>
              {devices.slice(0, gridCount).map((d, i) => (
                <div key={d.id} className={`mv-cell ${pgm === d.id ? 'active' : ''} ${pvw === d.id ? 'preview-active' : ''}`}
                  style={{ border: pgm === d.id ? '2px solid var(--red)' : pvw === d.id ? '2px solid var(--green)' : undefined, cursor: 'pointer' }}
                  onClick={() => selectPvw(d.id)} onDoubleClick={() => selectPgm(d.id)}>
                  <div className="mv-placeholder" style={{ background: d.is_online ? 'linear-gradient(180deg, #0d1520, #080c12)' : '#0a0a0a' }}>
                    {d.is_online ? '📹' : '⬛'}
                  </div>
                  {/* Tally indicator */}
                  {pgm === d.id && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--red)' }}></div>}
                  {pvw === d.id && pgm !== d.id && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--green)' }}></div>}
                  {/* Label */}
                  <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ background: 'rgba(0,0,0,.8)', padding: '2px 8px', borderRadius: 4, fontSize: '.7rem', fontWeight: 700 }}>{i+1}</span>
                    <span style={{ background: 'rgba(0,0,0,.7)', padding: '2px 8px', borderRadius: 4, fontSize: '.65rem' }}>{d.name}</span>
                  </div>
                  {/* Status badges */}
                  <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                    {pgm === d.id && <span style={{ background: 'var(--red)', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: '.6rem', fontWeight: 800 }}>PGM</span>}
                    {pvw === d.id && <span style={{ background: 'var(--green)', color: '#000', padding: '1px 6px', borderRadius: 3, fontSize: '.6rem', fontWeight: 800 }}>PVW</span>}
                  </div>
                  {/* Bottom stats */}
                  <div className="mv-cell-stats">
                    <span>{d.stream_resolution || '—'}</span>
                    <span>{d.stream_fps || 0}fps</span>
                    <span>{d.stream_bitrate || 0}kbps</span>
                    {d.battery_percent >= 0 && <span style={{ color: d.battery_percent < 20 ? 'var(--red)' : 'var(--green)' }}>🔋{d.battery_percent}%</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

          {/* CAMERA SOURCE LIST — clickable to assign PGM/PVW */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Sources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {devices.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, background: pgm === d.id ? 'var(--red)15' : pvw === d.id ? 'var(--green)15' : 'transparent', border: `1px solid ${pgm === d.id ? 'var(--red)40' : pvw === d.id ? 'var(--green)40' : 'var(--border)'}`, cursor: 'pointer', transition: 'all .15s' }} >
                  <span style={{ width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 800, background: pgm === d.id ? 'var(--red)' : pvw === d.id ? 'var(--green)' : 'var(--bg-secondary)', color: pgm === d.id || pvw === d.id ? '#fff' : 'var(--text-muted)' }}>{i+1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{d.is_online ? `${d.stream_resolution} · ${d.stream_fps}fps` : 'Offline'}</div>
                  </div>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.is_online ? 'var(--green)' : 'var(--text-muted)', flexShrink: 0 }}></span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={(e) => { e.stopPropagation(); selectPvw(d.id); }} style={{ padding: '2px 6px', fontSize: '.6rem', fontWeight: 800, borderRadius: 3, border: '1px solid var(--green)40', background: pvw===d.id ? 'var(--green)' : 'transparent', color: pvw===d.id ? '#000' : 'var(--green)', cursor: 'pointer' }}>PVW</button>
                    <button onClick={(e) => { e.stopPropagation(); selectPgm(d.id); }} style={{ padding: '2px 6px', fontSize: '.6rem', fontWeight: 800, borderRadius: 3, border: '1px solid var(--red)40', background: pgm===d.id ? 'var(--red)' : 'transparent', color: pgm===d.id ? '#fff' : 'var(--red)', cursor: 'pointer' }}>PGM</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STREAM HEALTH for selected PGM */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Program Health</div>
            {pgmDevice ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { label: 'Resolution', value: pgmDevice.stream_resolution || '—', icon: '📐' },
                  { label: 'FPS', value: (pgmDevice.stream_fps || 0) + ' fps', icon: '🎞️' },
                  { label: 'Bitrate', value: (pgmDevice.stream_bitrate || 0) + ' kbps', icon: '📊' },
                  { label: 'Battery', value: pgmDevice.battery_percent >= 0 ? pgmDevice.battery_percent + '%' : '—', icon: '🔋', color: pgmDevice.battery_percent < 20 ? 'var(--red)' : 'var(--green)' },
                  { label: 'Signal', value: pgmDevice.signal_quality >= 0 ? pgmDevice.signal_quality + '%' : '—', icon: '📶' },
                  { label: 'Network', value: pgmDevice.network_type || 'WiFi', icon: '🌐' },
                ].map(m => (
                  <div key={m.label} style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{m.icon} {m.label}</div>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, fontFamily: 'var(--mono)', color: m.color || 'var(--text-primary)', marginTop: 2 }}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Select a PGM source</p>}
          </div>

          {/* PRODUCTION LOG */}
          <div className="card" style={{ padding: 12, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Production Log</div>
            <div className="log-panel" style={{ flex: 1, maxHeight: 'none' }}>
              {logs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No logs</p> : logs.slice(0, 20).map((log, i) => (
                <div key={i} className="log-entry"><span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span><span className={`log-type ${log.type}`}>{log.type}</span><span className="log-msg">{log.message}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM SWITCHER BAR ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, padding: '10px 0', marginTop: 8, borderTop: '1px solid var(--border)' }}>

        {/* PROGRAM BUS */}
        <div>
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Program</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {devices.map((d, i) => (
              <button key={d.id} onClick={() => selectPgm(d.id)} style={{ width: 44, height: 36, borderRadius: 6, border: pgm === d.id ? '2px solid var(--red)' : '1px solid var(--border)', background: pgm === d.id ? 'var(--red)' : 'var(--bg-card)', color: pgm === d.id ? '#fff' : 'var(--text-primary)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', transition: 'all .1s' }}>{i+1}</button>
            ))}
          </div>
        </div>

        {/* TRANSITION CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Transition</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={doCut} style={{ padding: '10px 24px', borderRadius: 6, border: '2px solid var(--red)', background: 'var(--red)', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', letterSpacing: 1, transition: 'all .1s' }} onMouseOver={e => e.target.style.boxShadow='0 0 20px rgba(255,61,113,.5)'} onMouseOut={e => e.target.style.boxShadow='none'}>CUT</button>
            <button onClick={doFade} style={{ padding: '10px 20px', borderRadius: 6, border: '2px solid var(--orange)', background: 'var(--orange)', color: '#000', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', letterSpacing: 1, transition: 'all .1s' }} onMouseOver={e => e.target.style.boxShadow='0 0 20px rgba(255,171,0,.5)'} onMouseOut={e => e.target.style.boxShadow='none'}>FADE</button>
            <button onClick={doAutoTransition} style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>AUTO</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {!isLive ? (
              <button className="btn btn-success btn-sm" onClick={goLive} style={{ fontWeight: 700 }}>🔴 GO LIVE</button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={goOff} style={{ fontWeight: 700 }}>⏹ END</button>
            )}
            {vmixStatus && <>
              <button className="btn btn-sm" onClick={() => doVmixAction(vmixStatus.recording ? 'stopRecording' : 'startRecording')} style={{ fontSize: '.75rem' }}>{vmixStatus.recording ? '⏹ REC' : '⏺ REC'}</button>
              <button className="btn btn-sm" onClick={() => doVmixAction(vmixStatus.streaming ? 'stopStreaming' : 'startStreaming')} style={{ fontSize: '.75rem' }}>{vmixStatus.streaming ? '⏹ STR' : '📡 STR'}</button>
            </>}
          </div>
        </div>

        {/* PREVIEW BUS */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Preview</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {devices.map((d, i) => (
              <button key={d.id} onClick={() => selectPvw(d.id)} style={{ width: 44, height: 36, borderRadius: 6, border: pvw === d.id ? '2px solid var(--green)' : '1px solid var(--border)', background: pvw === d.id ? 'var(--green)' : 'var(--bg-card)', color: pvw === d.id ? '#000' : 'var(--text-primary)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', transition: 'all .1s' }}>{i+1}</button>
            ))}
          </div>
        </div>
      </div>

      {/* FULLSCREEN OVERLAY */}
      {fullscreen && (
        <div className="modal-overlay" onClick={() => setFullscreen(null)} style={{ cursor: 'pointer' }}>
          <div style={{ width: '90vw', aspectRatio: '16/9', background: '#000', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--accent)' }}>
            <span style={{ fontSize: '4rem' }}>📹</span>
          </div>
        </div>
      )}
    </div>
  );
}
