import { useState, useEffect, useCallback, useRef } from 'react';
import { vmixApi, analyticsApi } from '../api/client';

const BUSES = ['M','A','B','C','D','E','F','G'];
const TRANSITIONS = [
  { key: 'cut', label: 'CUT', cls: 'cut' }, { key: 'fade', label: 'FADE', cls: 'fade' },
  { key: 'zoom', label: 'ZOOM' }, { key: 'wipe', label: 'WIPE' }, { key: 'slide', label: 'SLIDE' },
  { key: 'fly', label: 'FLY' }, { key: 'crossZoom', label: 'X-ZOOM' }, { key: 'cube', label: 'CUBE' },
  { key: 'merge', label: 'MERGE' }, { key: 'verticalWipe', label: 'V-WIPE' }, { key: 'verticalSlide', label: 'V-SLIDE' },
];

const S = { card: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 } };
const Lbl = ({ children }) => <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{children}</div>;
const Slider = ({ label, min = 0, max = 100, value, onChange, color = 'var(--accent)' }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', marginBottom: 2 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{value}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(parseInt(e.target.value))} style={{ width: '100%', accentColor: color }} />
  </div>
);

export default function VmixControl() {
  const [conns, setConns] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: 'vMix', host: '127.0.0.1', port: 8088 });
  const [testing, setTesting] = useState(false);
  const [tab, setTab] = useState('controls');
  // Audio
  const [volumes, setVolumes] = useState({});
  const [masterVol, setMasterVol] = useState(100);
  const [busVols, setBusVols] = useState({ A:100, B:100, C:100, D:100, E:100, F:100, G:100 });
  const [mutedInputs, setMutedInputs] = useState({});
  const [soloInputs, setSoloInputs] = useState({});
  // Overlays
  const [overlays, setOverlays] = useState({ 1:false, 2:false, 3:false, 4:false });
  const [overlayInputs, setOverlayInputs] = useState({ 1:'', 2:'', 3:'', 4:'' });
  // T-Bar
  const [faderVal, setFaderVal] = useState(0);
  // Transition duration
  const [transDur, setTransDur] = useState(1000);
  // PTZ
  const [ptzInput, setPtzInput] = useState('');
  const [ptzSpeed, setPtzSpeed] = useState(1);
  // Color
  const [ccInput, setCcInput] = useState('');
  const [cc, setCc] = useState({ saturation: 100, hue: 0, gamma: 0, gain: 0, lift: 0, contrast: 0, brightness: 0, alpha: 255 });
  // Position
  const [posInput, setPosInput] = useState('');
  const [pos, setPos] = useState({ panX: 0, panY: 0, zoom: 100, cropX1: 0, cropY1: 0, cropX2: 0, cropY2: 0 });
  // Countdown
  const [cdInput, setCdInput] = useState('');
  const [cdTime, setCdTime] = useState('00:05:00');
  // Browser
  const [brInput, setBrInput] = useState('');
  const [brUrl, setBrUrl] = useState('');
  // Titles
  const [titleInput, setTitleInput] = useState('');
  const [titleIdx, setTitleIdx] = useState(0);
  const [titleVal, setTitleVal] = useState('');
  // Data Sources
  const [dsInput, setDsInput] = useState('');
  const [dsName, setDsName] = useState('');
  const [dsRow, setDsRow] = useState(0);
  // Layers
  const [layerInput, setLayerInput] = useState('');
  const [layerNum, setLayerNum] = useState(1);
  const [layerSrc, setLayerSrc] = useState('');
  // Script
  const [scriptName, setScriptName] = useState('');
  // Dynamic
  const [dynNum, setDynNum] = useState(1);
  const [dynVal, setDynVal] = useState('');
  // Raw
  const [rawFunc, setRawFunc] = useState('');
  const [rawParams, setRawParams] = useState('');
  // NDI
  const [ndiInput, setNdiInput] = useState('');
  const [ndiSource, setNdiSource] = useState('');
  // Video delay
  const [delayInput, setDelayInput] = useState('');
  const [delayFrames, setDelayFrames] = useState(0);
  // Stinger
  const [stingerNum, setStingerNum] = useState(1);

  const loadConns = () => vmixApi.connections().then(d => { setConns(d.connections||[]); if (!active && d.connections?.[0]) setActive(d.connections[0].id); }).catch(console.error);
  const loadLogs = () => analyticsApi.logs('vmix', 50).then(d => setLogs(d.logs||[])).catch(console.error);
  useEffect(() => { loadConns(); loadLogs(); }, []);
  useEffect(() => { if (!active) return; const poll = () => vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }).catch(() => setStatus(null)); poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, [active]);

  const testConn = async () => { setTesting(true); try { const r = await vmixApi.test(active); alert(r.connected ? '✅ Connected!' : '❌ ' + r.error); loadConns(); loadLogs(); } catch(e) { alert('❌ ' + e.message); } setTesting(false); };
  const doAction = useCallback(async (action, params) => { try { await vmixApi.action(active, action, params); if (['setPreview','setProgram','cut','fade','fadeToBlack','overlayOn','overlayOff','startRecording','stopRecording','startStreaming','stopStreaming'].includes(action)) vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }); } catch(e) { console.error(e); } }, [active]);
  const addConn = async () => { await vmixApi.createConn(form); setShowAdd(false); loadConns(); };

  const tabs = [
    { k:'controls', l:'🎬 Production' }, { k:'audio', l:'🔊 Audio' }, { k:'overlays', l:'🖼️ Overlays' },
    { k:'playback', l:'▶ Playback' }, { k:'replay', l:'⏪ Replay' }, { k:'ptz', l:'🎥 PTZ' },
    { k:'color', l:'🎨 Color' }, { k:'position', l:'📐 Position' }, { k:'countdown', l:'⏱ Timer' },
    { k:'browser', l:'🌐 Browser' }, { k:'titles', l:'📝 Titles' },
    { k:'output', l:'📡 Output' }, { k:'advanced', l:'🔧 Advanced' },
    { k:'inputs', l:'📋 Inputs' }, { k:'log', l:'📜 Log' },
  ];
  const conn = conns.find(c => c.id === active);
  const inputs = status?.inputs || [];
  const InputSel = ({ value, onChange, label }) => (
    <div><Lbl>{label || 'Input'}</Lbl><select className="form-input" value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: '.8rem' }}><option value="">Select...</option>{inputs.map(i => <option key={i.number} value={i.number}>#{i.number} {i.title?.substring(0,18)}</option>)}</select></div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* ═══ CONNECTION BAR ═══ */}
      <div style={{ display:'flex', gap:12, alignItems:'center', padding:'8px 12px', background:'var(--bg-card)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
        <span style={{ fontWeight:700, fontSize:'.85rem' }}>🔗 vMix</span>
        {conns.map(c => <button key={c.id} onClick={() => setActive(c.id)} style={{ padding:'4px 12px', borderRadius:4, border: active===c.id ? '2px solid var(--accent)' : '1px solid var(--border)', background: active===c.id ? 'var(--accent)15' : 'transparent', cursor:'pointer', color:'var(--text-primary)', fontSize:'.8rem', display:'flex', alignItems:'center', gap:6 }}><span className={`conn-dot ${c.is_connected?'connected':'disconnected'}`} style={{width:6,height:6}}></span>{c.name}</button>)}
        <button className="btn btn-sm" onClick={() => setShowAdd(true)}>➕</button>
        {conn && <button className="btn btn-sm btn-primary" onClick={testConn} disabled={testing} style={{marginLeft:'auto'}}>{testing ? '⏳' : '🔌 Test'}</button>}
        {status && <span style={{fontSize:'.7rem', color:'var(--text-muted)', fontFamily:'var(--mono)'}}>v{status.version} | {status.edition}</span>}
      </div>

      {/* ═══ STATUS PILLS ═══ */}
      {status && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            { l:'PGM', v:status.activeInput, c:'#ef4444' }, { l:'PVW', v:status.previewInput, c:'#22c55e' },
            { l:'REC', v:status.recording?'ON':'OFF', c:status.recording?'#ef4444':'#64748b' },
            { l:'STREAM', v:status.streaming?'LIVE':'OFF', c:status.streaming?'#22c55e':'#64748b' },
            { l:'EXT', v:status.external?'ON':'OFF', c:status.external?'#3b82f6':'#64748b' },
            { l:'FTB', v:status.fadeToBlack?'ON':'OFF', c:status.fadeToBlack?'#ef4444':'#64748b' },
          ].map((p,i) => <div key={i} style={{padding:'4px 10px', borderRadius:4, background:`${p.c}18`, border:`1px solid ${p.c}40`, fontSize:'.72rem', fontWeight:700, color:p.c}}>{p.l}: {p.v}</div>)}
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div style={S.card}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', overflowX:'auto', marginBottom:16, gap:0 }}>
          {tabs.map(t => <button key={t.k} onClick={() => setTab(t.k)} style={{ padding:'8px 14px', background:tab===t.k?'var(--accent)':'transparent', color:tab===t.k?'#fff':'var(--text-secondary)', border:'none', cursor:'pointer', fontWeight:600, fontSize:'.78rem', whiteSpace:'nowrap', borderBottom:tab===t.k?'2px solid var(--accent)':'2px solid transparent', transition:'all .15s' }}>{t.l}</button>)}
        </div>

        {!status && tab !== 'log' && <p style={{color:'var(--text-muted)'}}>Connect to vMix to enable controls</p>}

        {/* ═══ PRODUCTION ═══ */}
        {tab === 'controls' && status && <>
          <Lbl>🔴 Program Bus</Lbl>
          <div className="vmix-bus" style={{marginBottom:12}}>{inputs.map(i => <button key={i.number} className={`vmix-bus-btn ${i.number===status.activeInput?'pgm':''}`} onClick={() => doAction('setProgram',{input:i.number})} title={i.title}>{i.number}</button>)}</div>
          <Lbl>🟢 Preview Bus</Lbl>
          <div className="vmix-bus" style={{marginBottom:12}}>{inputs.map(i => <button key={i.number} className={`vmix-bus-btn ${i.number===status.previewInput?'pvw':''}`} onClick={() => doAction('setPreview',{input:i.number})} title={i.title}>{i.number}</button>)}</div>
          <Lbl>Transitions (Duration: {transDur}ms)</Lbl>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
            {TRANSITIONS.map(t => <button key={t.key} className={`vmix-trans-btn ${t.cls||''}`} onClick={() => doAction(t.key,{duration:transDur})}>{t.label}</button>)}
            {[1,2,3,4].map(n => <button key={`st${n}`} className="vmix-trans-btn" style={{background:'#7c3aed',color:'#fff',border:'1px solid #7c3aed'}} onClick={() => doAction('stinger',{number:n})}>STING {n}</button>)}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
            <Slider label="Duration (ms)" min={100} max={5000} value={transDur} onChange={setTransDur} color="#f59e0b" />
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
            <span style={{fontSize:'.8rem',fontWeight:600,color:'var(--text-muted)',minWidth:40}}>T-Bar</span>
            <input type="range" min="0" max="255" value={faderVal} onChange={e => { setFaderVal(parseInt(e.target.value)); doAction('setFader',{value:parseInt(e.target.value)}); }} style={{flex:1,accentColor:'var(--accent)'}} />
            <span style={{fontSize:'.7rem',fontFamily:'var(--mono)',minWidth:45}}>{faderVal}/255</span>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="vmix-trans-btn" style={{background:'#1e293b',color:'#ef4444',border:'2px solid #ef4444'}} onClick={() => doAction('fadeToBlack')}>FTB</button>
            <button className={`btn btn-sm ${status.recording?'btn-danger':'btn-success'}`} onClick={() => doAction(status.recording?'stopRecording':'startRecording')}>{status.recording?'⏹ Stop Rec':'⏺ Record'}</button>
            <button className={`btn btn-sm ${status.streaming?'btn-danger':'btn-success'}`} onClick={() => doAction(status.streaming?'stopStreaming':'startStreaming')}>{status.streaming?'⏹ Stop Stream':'📡 Stream'}</button>
            <button className="btn btn-sm" onClick={() => doAction('snapshot')}>📷 Snapshot</button>
            <button className="btn btn-sm" onClick={() => doAction('fullscreenOff')}>⛶ Exit FS</button>
            <button className="btn btn-sm" onClick={() => doAction('undo')}>↩ Undo</button>
          </div>
        </>}

        {/* ═══ AUDIO ═══ */}
        {tab === 'audio' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:20,padding:12,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
            <div><Lbl>🔊 Master</Lbl><input type="range" min="0" max="100" value={masterVol} onChange={e => {setMasterVol(parseInt(e.target.value));doAction('setMasterVolume',{volume:parseInt(e.target.value)});}} style={{width:'100%',accentColor:'#22c55e'}} /><div style={{display:'flex',gap:4,marginTop:4}}><button className="btn btn-sm" onClick={() => doAction('masterAudioOn')}>🔊</button><button className="btn btn-sm" style={{background:'#ef4444',color:'#fff'}} onClick={() => doAction('masterAudioOff')}>🔇</button></div></div>
            {['A','B','C','D','E','F','G'].map(b => <div key={b}><Lbl>Bus {b}</Lbl><input type="range" min="0" max="100" value={busVols[b]} onChange={e => {setBusVols(v => ({...v,[b]:parseInt(e.target.value)}));doAction('setBusVolume',{bus:b,volume:parseInt(e.target.value)});}} style={{width:'100%',accentColor:['#3b82f6','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316'][BUSES.indexOf(b)-1]}} /><div style={{display:'flex',gap:4,marginTop:4}}><button className="btn btn-sm" style={{fontSize:'.65rem'}} onClick={() => doAction('busAudioOn',{bus:b})}>ON</button><button className="btn btn-sm" style={{fontSize:'.65rem',background:'#ef4444',color:'#fff'}} onClick={() => doAction('busAudioOff',{bus:b})}>OFF</button></div></div>)}
          </div>
          <Lbl>🎤 Per-Input Audio</Lbl>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
            {inputs.map(inp => <div key={inp.number} style={{padding:10,background:'var(--bg-secondary)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontWeight:600,fontSize:'.8rem'}}>#{inp.number} {inp.title?.substring(0,12)}</span>
                <div style={{display:'flex',gap:3}}>
                  <button onClick={() => {setMutedInputs(m => ({...m,[inp.number]:!m[inp.number]}));doAction(mutedInputs[inp.number]?'unmute':'mute',{input:inp.number});}} style={{background:mutedInputs[inp.number]?'#ef4444':'#334155',color:'#fff',border:'none',borderRadius:3,padding:'1px 6px',cursor:'pointer',fontSize:'.65rem',fontWeight:700}}>{mutedInputs[inp.number]?'🔇':'🔊'}</button>
                  <button onClick={() => {setSoloInputs(s => ({...s,[inp.number]:!s[inp.number]}));doAction('soloToggle',{input:inp.number});}} style={{background:soloInputs[inp.number]?'#f59e0b':'#334155',color:'#fff',border:'none',borderRadius:3,padding:'1px 6px',cursor:'pointer',fontSize:'.65rem',fontWeight:700}}>S</button>
                </div>
              </div>
              <input type="range" min="0" max="100" value={volumes[inp.number]||100} onChange={e => {setVolumes(v => ({...v,[inp.number]:parseInt(e.target.value)}));doAction('setVolume',{input:inp.number,volume:parseInt(e.target.value)});}} style={{width:'100%',accentColor:mutedInputs[inp.number]?'#ef4444':'#22c55e'}} />
              <div style={{display:'flex',gap:3,marginTop:4,flexWrap:'wrap'}}>{BUSES.map(b => <button key={b} onClick={() => doAction('audioBusToggle',{input:inp.number,bus:b})} style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:3,padding:'0 4px',cursor:'pointer',fontSize:'.6rem',fontWeight:600}}>{b}</button>)}</div>
            </div>)}
          </div>
        </>}

        {/* ═══ OVERLAYS ═══ */}
        {tab === 'overlays' && status && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {[1,2,3,4].map(n => <div key={n} style={{padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)',border:`2px solid ${overlays[n]?'#22c55e':'var(--border)'}`}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><span style={{fontWeight:700}}>Overlay {n}</span><span style={{fontSize:'.7rem',padding:'2px 8px',borderRadius:4,background:overlays[n]?'#22c55e20':'#ef444420',color:overlays[n]?'#22c55e':'#ef4444',fontWeight:600}}>{overlays[n]?'ON':'OFF'}</span></div>
            <input className="form-input" type="number" placeholder="Input #" value={overlayInputs[n]} onChange={e => setOverlayInputs(o => ({...o,[n]:e.target.value}))} style={{marginBottom:8}} />
            <div style={{display:'flex',gap:6}}><button className="btn btn-sm btn-success" onClick={() => {if(overlayInputs[n]){doAction('overlayOn',{number:n,input:overlayInputs[n]});setOverlays(o => ({...o,[n]:true}));}}}>ON</button><button className="btn btn-sm btn-danger" onClick={() => {doAction('overlayOff',{number:n});setOverlays(o => ({...o,[n]:false}));}}>OFF</button><button className="btn btn-sm" onClick={() => {setOverlays(o => ({...o,[n]:!o[n]}));doAction(overlays[n]?'overlayOff':'overlayOn',overlays[n]?{number:n}:{number:n,input:overlayInputs[n]});}}>Toggle</button></div>
          </div>)}
        </div>}

        {/* ═══ PLAYBACK ═══ */}
        {tab === 'playback' && status && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
          {inputs.map(inp => <div key={inp.number} style={{padding:10,background:'var(--bg-secondary)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,marginBottom:6,display:'flex',justifyContent:'space-between'}}><span>#{inp.number} {inp.title?.substring(0,18)}</span><span className="badge badge-info" style={{fontSize:'.6rem'}}>{inp.type}</span></div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button className="btn btn-sm btn-success" onClick={() => doAction('play',{input:inp.number})}>▶</button>
              <button className="btn btn-sm" onClick={() => doAction('pause',{input:inp.number})}>⏸</button>
              <button className="btn btn-sm" onClick={() => doAction('restart',{input:inp.number})}>⏮</button>
              <button className="btn btn-sm" onClick={() => doAction('loopOn',{input:inp.number})}>🔁</button>
              <button className="btn btn-sm" onClick={() => doAction('loopOff',{input:inp.number})}>🔁̸</button>
              <button className="btn btn-sm" onClick={() => doAction('quickPlay',{input:inp.number})}>⚡</button>
              <button className="btn btn-sm" onClick={() => doAction('nextPicture',{input:inp.number})}>▸▸</button>
              <button className="btn btn-sm" onClick={() => doAction('previousPicture',{input:inp.number})}>◂◂</button>
              <button className="btn btn-sm" onClick={() => doAction('fullscreen',{input:inp.number})}>⛶</button>
            </div>
          </div>)}
        </div>}

        {/* ═══ REPLAY ═══ */}
        {tab === 'replay' && <>
          <Lbl>⏪ Replay Controls</Lbl>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            <button className="btn btn-sm btn-success" onClick={() => doAction('replayPlay')}>▶ Play</button>
            <button className="btn btn-sm" onClick={() => doAction('replayPause')}>⏸ Pause</button>
            <button className="btn btn-sm" onClick={() => doAction('replayPlayPause')}>⏯ Toggle</button>
            <button className="btn btn-sm" onClick={() => doAction('replayJumpToNow')}>⏭ Now</button>
            <button className="btn btn-sm" onClick={() => doAction('replayLive')}>🔴 Live</button>
            <button className="btn btn-sm" onClick={() => doAction('replayMoveLastEvent')}>📌 Last</button>
            <button className="btn btn-sm" onClick={() => doAction('replayChangeDirection')}>↔ Dir</button>
            <div style={{width:1,height:28,background:'var(--border)'}}></div>
            {[0.25,0.5,1,2,4,8].map(s => <button key={s} className="btn btn-sm" onClick={() => doAction('replayChangeSpeed',{speed:s})}>{s}x</button>)}
            <div style={{width:1,height:28,background:'var(--border)'}}></div>
            <button className="btn btn-sm" onClick={() => doAction('replayFastBackward',{speed:2})}>⏪2x</button>
            <button className="btn btn-sm" onClick={() => doAction('replayFastBackward',{speed:4})}>⏪4x</button>
            <button className="btn btn-sm" onClick={() => doAction('replayFastForward',{speed:2})}>⏩2x</button>
            <button className="btn btn-sm" onClick={() => doAction('replayFastForward',{speed:4})}>⏩4x</button>
            <div style={{width:1,height:28,background:'var(--border)'}}></div>
            <button className="btn btn-sm" style={{background:'#22c55e',color:'#000'}} onClick={() => doAction('replayMarkIn')}>IN</button>
            <button className="btn btn-sm" style={{background:'#ef4444',color:'#fff'}} onClick={() => doAction('replayMarkOut')}>OUT</button>
            <button className="btn btn-sm" style={{background:'#f59e0b',color:'#000'}} onClick={() => doAction('replayMarkInOut')}>IN+OUT</button>
          </div>
          <div style={{display:'flex',gap:6}}>{[1,2,3,4,5,6,7,8].map(n => <button key={n} className="btn btn-sm" onClick={() => doAction('replaySelectEvents',{value:n})}>Event {n}</button>)}</div>
        </>}

        {/* ═══ PTZ ═══ */}
        {tab === 'ptz' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16}}>
            <div><InputSel value={ptzInput} onChange={setPtzInput} label="PTZ Camera Input" /><Slider label="Speed" min={0} max={1} value={ptzSpeed} onChange={setPtzSpeed} color="#3b82f6" /></div>
            <div>
              <Lbl>Pan/Tilt</Lbl>
              <div style={{display:'grid',gridTemplateColumns:'60px 60px 60px',gap:4,marginBottom:12}}>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveUpLeft',{input:ptzInput})}>↖</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveUp',{input:ptzInput,speed:ptzSpeed})}>⬆</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveUpRight',{input:ptzInput})}>↗</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveLeft',{input:ptzInput,speed:ptzSpeed})}>⬅</button>
                <button className="btn btn-sm" style={{background:'#ef4444',color:'#fff'}} onClick={() => doAction('ptzMoveStop',{input:ptzInput})}>⏹</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveRight',{input:ptzInput,speed:ptzSpeed})}>➡</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveDownLeft',{input:ptzInput})}>↙</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveDown',{input:ptzInput,speed:ptzSpeed})}>⬇</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzMoveDownRight',{input:ptzInput})}>↘</button>
              </div>
              <Lbl>Zoom</Lbl>
              <div style={{display:'flex',gap:6,marginBottom:12}}>
                <button className="btn btn-sm" onClick={() => doAction('ptzZoomIn',{input:ptzInput,speed:ptzSpeed})}>🔍+</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzZoomStop',{input:ptzInput})}>⏹</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzZoomOut',{input:ptzInput,speed:ptzSpeed})}>🔍-</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzHome',{input:ptzInput})}>🏠 Home</button>
              </div>
              <Lbl>Focus</Lbl>
              <div style={{display:'flex',gap:6,marginBottom:12}}>
                <button className="btn btn-sm" onClick={() => doAction('ptzFocusNear',{input:ptzInput})}>Near</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzFocusAuto',{input:ptzInput})}>Auto</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzFocusFar',{input:ptzInput})}>Far</button>
                <button className="btn btn-sm" onClick={() => doAction('ptzFocusStop',{input:ptzInput})}>Stop</button>
              </div>
              <Lbl>Presets</Lbl>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {[1,2,3,4,5,6,7,8].map(n => <div key={n} style={{display:'flex',flexDirection:'column',gap:2}}>
                  <button className="btn btn-sm btn-primary" onClick={() => doAction('ptzMoveToPreset',{input:ptzInput,preset:n})} style={{fontSize:'.7rem'}}>P{n}</button>
                  <button className="btn btn-sm" onClick={() => doAction('ptzSavePreset',{input:ptzInput,preset:n})} style={{fontSize:'.6rem'}}>Save</button>
                </div>)}
              </div>
            </div>
          </div>
        </>}

        {/* ═══ COLOR ═══ */}
        {tab === 'color' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16}}>
            <div><InputSel value={ccInput} onChange={setCcInput} label="Input" />
              <div style={{marginTop:12,display:'flex',gap:6,flexDirection:'column'}}>
                <button className="btn btn-sm btn-primary" onClick={() => doAction('colorCorrectionAuto',{input:ccInput})}>🎨 Auto</button>
                <button className="btn btn-sm" onClick={() => doAction('colorCorrectionReset',{input:ccInput})}>↩ Reset</button>
                <button className="btn btn-sm" onClick={() => doAction('inputEffectOn',{input:ccInput})}>FX On</button>
                <button className="btn btn-sm" onClick={() => doAction('inputEffectOff',{input:ccInput})}>FX Off</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[{k:'saturation',l:'Saturation',min:0,max:200,c:'#ec4899'},{k:'hue',l:'Hue',min:-180,max:180,c:'#8b5cf6'},{k:'gamma',l:'Gamma',min:-1,max:1,c:'#f59e0b'},{k:'gain',l:'Gain',min:-1,max:1,c:'#22c55e'},{k:'lift',l:'Lift',min:-1,max:1,c:'#3b82f6'},{k:'contrast',l:'Contrast',min:-1,max:1,c:'#06b6d4'},{k:'brightness',l:'Brightness',min:-1,max:1,c:'#f97316'},{k:'alpha',l:'Alpha',min:0,max:255,c:'#94a3b8'}].map(s => (
                <div key={s.k}><div style={{display:'flex',justifyContent:'space-between',fontSize:'.72rem',marginBottom:2}}><span style={{color:'var(--text-muted)'}}>{s.l}</span><span style={{fontFamily:'var(--mono)',fontWeight:700}}>{cc[s.k]}</span></div>
                <input type="range" min={s.min} max={s.max} step={s.max<=1?0.01:1} value={cc[s.k]} onChange={e => {const v = parseFloat(e.target.value); setCc(c => ({...c,[s.k]:v})); doAction(s.k==='alpha'?'setAlpha':`set${s.l}`,{input:ccInput,value:v});}} style={{width:'100%',accentColor:s.c}} /></div>
              ))}
            </div>
          </div>
        </>}

        {/* ═══ POSITION ═══ */}
        {tab === 'position' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16}}>
            <div><InputSel value={posInput} onChange={setPosInput} label="Input" /><button className="btn btn-sm" style={{marginTop:12}} onClick={() => doAction('resetInput',{input:posInput})}>↩ Reset All</button></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[{k:'panX',l:'Pan X',min:-2,max:2,a:'setPanX'},{k:'panY',l:'Pan Y',min:-2,max:2,a:'setPanY'},{k:'zoom',l:'Zoom',min:0,max:400,a:'setZoom'},{k:'cropX1',l:'Crop X1',min:0,max:1,a:'setCropX1'},{k:'cropY1',l:'Crop Y1',min:0,max:1,a:'setCropY1'},{k:'cropX2',l:'Crop X2',min:0,max:1,a:'setCropX2'},{k:'cropY2',l:'Crop Y2',min:0,max:1,a:'setCropY2'}].map(s => (
                <div key={s.k}><div style={{display:'flex',justifyContent:'space-between',fontSize:'.72rem',marginBottom:2}}><span style={{color:'var(--text-muted)'}}>{s.l}</span><span style={{fontFamily:'var(--mono)',fontWeight:700}}>{pos[s.k]}</span></div>
                <input type="range" min={s.min} max={s.max} step={s.max<=2?0.01:1} value={pos[s.k]} onChange={e => {const v = parseFloat(e.target.value); setPos(p => ({...p,[s.k]:v})); doAction(s.a,{input:posInput,value:v});}} style={{width:'100%',accentColor:'var(--accent)'}} /></div>
              ))}
            </div>
          </div>
        </>}

        {/* ═══ COUNTDOWN ═══ */}
        {tab === 'countdown' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16}}>
            <InputSel value={cdInput} onChange={setCdInput} label="Timer Input" />
            <div>
              <Lbl>Set Time (HH:MM:SS)</Lbl>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
                <input className="form-input" value={cdTime} onChange={e => setCdTime(e.target.value)} placeholder="00:05:00" style={{maxWidth:160}} />
                <button className="btn btn-sm btn-primary" onClick={() => doAction('setCountdown',{input:cdInput,value:cdTime})}>Set</button>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-sm btn-success" onClick={() => doAction('startCountdown',{input:cdInput})}>▶ Start</button>
                <button className="btn btn-sm" onClick={() => doAction('pauseCountdown',{input:cdInput})}>⏸ Pause</button>
                <button className="btn btn-sm btn-danger" onClick={() => doAction('stopCountdown',{input:cdInput})}>⏹ Stop</button>
                <button className="btn btn-sm" onClick={() => doAction('changeCountdown',{input:cdInput,value:'00:00:30'})}>+30s</button>
                <button className="btn btn-sm" onClick={() => doAction('changeCountdown',{input:cdInput,value:'00:01:00'})}>+1m</button>
                <button className="btn btn-sm" onClick={() => doAction('changeCountdown',{input:cdInput,value:'-00:00:30'})}>-30s</button>
              </div>
            </div>
          </div>
        </>}

        {/* ═══ BROWSER ═══ */}
        {tab === 'browser' && status && <>
          <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16}}>
            <InputSel value={brInput} onChange={setBrInput} label="Browser Input" />
            <div>
              <Lbl>Navigate</Lbl>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <input className="form-input" value={brUrl} onChange={e => setBrUrl(e.target.value)} placeholder="https://..." style={{flex:1}} />
                <button className="btn btn-sm btn-primary" onClick={() => doAction('browserNavigate',{input:brInput,url:brUrl})}>Go</button>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button className="btn btn-sm" onClick={() => doAction('browserBack',{input:brInput})}>◀ Back</button>
                <button className="btn btn-sm" onClick={() => doAction('browserForward',{input:brInput})}>▶ Forward</button>
                <button className="btn btn-sm" onClick={() => doAction('browserReload',{input:brInput})}>🔄 Reload</button>
                <div style={{width:1,height:28,background:'var(--border)'}}></div>
                <button className="btn btn-sm" onClick={() => doAction('browserKeyboardEnabled',{input:brInput})}>⌨ KB On</button>
                <button className="btn btn-sm" onClick={() => doAction('browserKeyboardDisabled',{input:brInput})}>⌨ KB Off</button>
                <button className="btn btn-sm" onClick={() => doAction('browserMouseEnabled',{input:brInput})}>🖱 Mouse On</button>
                <button className="btn btn-sm" onClick={() => doAction('browserMouseDisabled',{input:brInput})}>🖱 Mouse Off</button>
              </div>
            </div>
          </div>
        </>}

        {/* ═══ TITLES ═══ */}
        {tab === 'titles' && status && <>
          <Lbl>📝 Title Text Editor</Lbl>
          <div style={{display:'grid',gridTemplateColumns:'140px 80px 1fr auto',gap:8,alignItems:'end',marginBottom:16}}>
            <InputSel value={titleInput} onChange={setTitleInput} label="Input" />
            <div><Lbl>Index</Lbl><input className="form-input" type="number" min="0" value={titleIdx} onChange={e => setTitleIdx(parseInt(e.target.value)||0)} /></div>
            <div><Lbl>Text</Lbl><input className="form-input" value={titleVal} onChange={e => setTitleVal(e.target.value)} placeholder="New text..." /></div>
            <button className="btn btn-primary btn-sm" onClick={() => doAction('setText',{input:titleInput,index:titleIdx,value:titleVal})} style={{height:36}}>Apply</button>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:16}}>
            <button className="btn btn-sm" onClick={() => doAction('previousTitlePreset',{input:titleInput})}>◀ Prev Preset</button>
            <button className="btn btn-sm" onClick={() => doAction('nextTitlePreset',{input:titleInput})}>Next Preset ▶</button>
          </div>
          <Lbl>📊 Data Source Navigation</Lbl>
          <div style={{display:'grid',gridTemplateColumns:'140px 140px 80px 1fr',gap:8,alignItems:'end'}}>
            <InputSel value={dsInput} onChange={setDsInput} label="Input" />
            <div><Lbl>Table/Name</Lbl><input className="form-input" value={dsName} onChange={e => setDsName(e.target.value)} placeholder="Table name" /></div>
            <div><Lbl>Row</Lbl><input className="form-input" type="number" min="0" value={dsRow} onChange={e => setDsRow(parseInt(e.target.value)||0)} /></div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button className="btn btn-sm" onClick={() => doAction('dataSourceFirstRow',{input:dsInput,value:dsName})}>⏮</button>
              <button className="btn btn-sm" onClick={() => doAction('dataSourcePreviousRow',{input:dsInput,value:dsName})}>◀</button>
              <button className="btn btn-sm" onClick={() => doAction('dataSourceNextRow',{input:dsInput,value:dsName})}>▶</button>
              <button className="btn btn-sm" onClick={() => doAction('dataSourceLastRow',{input:dsInput,value:dsName})}>⏭</button>
              <button className="btn btn-sm btn-primary" onClick={() => doAction('dataSourceSelectRow',{input:dsInput,value:dsName,row:dsRow})}>Go #{dsRow}</button>
            </div>
          </div>
        </>}

        {/* ═══ OUTPUT ═══ */}
        {tab === 'output' && <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
            <div style={{padding:16,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>📡 External Output</Lbl>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-sm btn-success" onClick={() => doAction('startExternal')}>▶ Start</button>
                <button className="btn btn-sm btn-danger" onClick={() => doAction('stopExternal')}>⏹ Stop</button>
              </div>
            </div>
            <div style={{padding:16,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>🎬 MultiCorder</Lbl>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-sm btn-success" onClick={() => doAction('startMultiCorder')}>⏺ Start</button>
                <button className="btn btn-sm btn-danger" onClick={() => doAction('stopMultiCorder')}>⏹ Stop</button>
              </div>
            </div>
            <div style={{padding:16,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>📡 Stream Destinations</Lbl>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {[0,1,2].map(n => <div key={n} style={{display:'flex',gap:4}}><button className="btn btn-sm btn-success" onClick={() => doAction('startStream',{number:n})}>#{n} ▶</button><button className="btn btn-sm btn-danger" onClick={() => doAction('stopStream',{number:n})}>⏹</button></div>)}
              </div>
            </div>
          </div>
          <div style={{marginTop:16,padding:16,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
            <Lbl>📺 NDI Controls</Lbl>
            <div style={{display:'grid',gridTemplateColumns:'160px 1fr auto',gap:8,alignItems:'end'}}>
              <InputSel value={ndiInput} onChange={setNdiInput} label="NDI Input" />
              <div><Lbl>Source Name</Lbl><input className="form-input" value={ndiSource} onChange={e => setNdiSource(e.target.value)} placeholder="MACHINE (Source)" /></div>
              <button className="btn btn-sm btn-primary" onClick={() => doAction('ndiSelectSource',{input:ndiInput,sourceName:ndiSource})}>Select</button>
            </div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button className="btn btn-sm btn-success" onClick={() => doAction('ndiStartRecording',{input:ndiInput})}>⏺ NDI Rec</button>
              <button className="btn btn-sm btn-danger" onClick={() => doAction('ndiStopRecording',{input:ndiInput})}>⏹ NDI Stop</button>
            </div>
          </div>
        </>}

        {/* ═══ ADVANCED ═══ */}
        {tab === 'advanced' && <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            {/* Layers */}
            <div style={{padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>📐 Layer Controls</Lbl>
              <div style={{display:'grid',gridTemplateColumns:'1fr 60px 1fr',gap:6,alignItems:'end',marginBottom:8}}>
                <InputSel value={layerInput} onChange={setLayerInput} label="Target Input" />
                <div><Lbl>Layer</Lbl><input className="form-input" type="number" min="1" max="10" value={layerNum} onChange={e => setLayerNum(parseInt(e.target.value)||1)} /></div>
                <div><Lbl>Source Input #</Lbl><input className="form-input" value={layerSrc} onChange={e => setLayerSrc(e.target.value)} placeholder="#" /></div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-sm btn-primary" onClick={() => doAction('setLayer',{input:layerInput,layer:layerNum,source:layerSrc})}>Set Layer</button>
                <button className="btn btn-sm btn-danger" onClick={() => doAction('layerOff',{input:layerInput,layer:layerNum})}>Layer Off</button>
              </div>
            </div>
            {/* Scripting */}
            <div style={{padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>📜 Scripting</Lbl>
              <div style={{display:'flex',gap:6,alignItems:'end',marginBottom:8}}>
                <div style={{flex:1}}><Lbl>Script Name</Lbl><input className="form-input" value={scriptName} onChange={e => setScriptName(e.target.value)} placeholder="MyScript" /></div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn btn-sm btn-success" onClick={() => doAction('scriptStart',{name:scriptName})}>▶ Start</button>
                <button className="btn btn-sm btn-danger" onClick={() => doAction('scriptStop',{name:scriptName})}>⏹ Stop</button>
                <button className="btn btn-sm" onClick={() => doAction('scriptStopAll')}>⏹ Stop All</button>
              </div>
            </div>
            {/* Dynamic Values */}
            <div style={{padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>🔢 Dynamic Values</Lbl>
              <div style={{display:'flex',gap:6,alignItems:'end',marginBottom:8}}>
                <div><Lbl>#</Lbl><select className="form-input" value={dynNum} onChange={e => setDynNum(parseInt(e.target.value))}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                <div style={{flex:1}}><Lbl>Value</Lbl><input className="form-input" value={dynVal} onChange={e => setDynVal(e.target.value)} placeholder="Value" /></div>
                <button className="btn btn-sm btn-primary" onClick={() => doAction('setDynamicValue',{number:dynNum,value:dynVal})}>Set</button>
              </div>
            </div>
            {/* Video Delay */}
            <div style={{padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
              <Lbl>⏱ Video Delay</Lbl>
              <div style={{display:'grid',gridTemplateColumns:'1fr 80px auto',gap:6,alignItems:'end'}}>
                <InputSel value={delayInput} onChange={setDelayInput} label="Input" />
                <div><Lbl>Frames</Lbl><input className="form-input" type="number" min="0" value={delayFrames} onChange={e => setDelayFrames(parseInt(e.target.value)||0)} /></div>
                <button className="btn btn-sm btn-primary" onClick={() => doAction('setVideoDelay',{input:delayInput,frames:delayFrames})}>Set</button>
              </div>
            </div>
          </div>
          {/* Raw API */}
          <div style={{marginTop:16,padding:14,background:'var(--bg-secondary)',borderRadius:'var(--radius)'}}>
            <Lbl>🔧 Raw vMix API Call</Lbl>
            <div style={{display:'grid',gridTemplateColumns:'200px 1fr auto',gap:8,alignItems:'end'}}>
              <div><Lbl>Function Name</Lbl><input className="form-input" value={rawFunc} onChange={e => setRawFunc(e.target.value)} placeholder="e.g. SetVolume" /></div>
              <div><Lbl>Params (JSON)</Lbl><input className="form-input" value={rawParams} onChange={e => setRawParams(e.target.value)} placeholder='{"Input":"1","Value":"50"}' /></div>
              <button className="btn btn-sm btn-primary" onClick={() => { try { const rp = rawParams ? JSON.parse(rawParams) : {}; doAction('raw',{functionName:rawFunc,rawParams:rp}); } catch(e) { alert('Invalid JSON'); }}}>Execute</button>
            </div>
            <p style={{fontSize:'.7rem',color:'var(--text-muted)',marginTop:6}}>Send any vMix API function directly. Use the official vMix Shortcut Function Reference for function names.</p>
          </div>
        </>}

        {/* ═══ INPUTS ═══ */}
        {tab === 'inputs' && status && <div className="table-wrap"><table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>State</th><th>Actions</th></tr></thead><tbody>
          {inputs.map(inp => <tr key={inp.number}><td style={{fontFamily:'var(--mono)',fontWeight:700}}>{inp.number}</td><td>{inp.title}</td><td><span className="badge badge-info">{inp.type}</span></td><td>{inp.state}</td>
            <td><div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
              <button className="btn btn-sm" onClick={() => doAction('setPreview',{input:inp.number})}>PVW</button>
              <button className="btn btn-sm btn-danger" onClick={() => doAction('setProgram',{input:inp.number})}>PGM</button>
              <button className="btn btn-sm" onClick={() => doAction('play',{input:inp.number})}>▶</button>
              <button className="btn btn-sm" onClick={() => doAction('pause',{input:inp.number})}>⏸</button>
              <button className="btn btn-sm" onClick={() => doAction('fullscreen',{input:inp.number})}>⛶</button>
              <button className="btn btn-sm" onClick={() => doAction('snapshotInput',{input:inp.number})}>📷</button>
              <button className="btn btn-sm" onClick={() => doAction('quickPlay',{input:inp.number})}>⚡</button>
            </div></td></tr>)}
        </tbody></table></div>}

        {/* ═══ LOG ═══ */}
        {tab === 'log' && <>
          <div className="log-panel" style={{maxHeight:500}}>{logs.length===0?<p style={{color:'var(--text-muted)'}}>No actions logged</p>:logs.map((l,i) => <div key={i} className="log-entry"><span className="log-time">{new Date(l.created_at).toLocaleTimeString()}</span><span className="log-type vmix">vmix</span><span className="log-msg">{l.message}</span></div>)}</div>
          <div style={{marginTop:8,textAlign:'right'}}><button className="btn btn-sm" onClick={loadLogs}>🔄 Refresh</button></div>
        </>}
      </div>

      {/* ═══ ADD MODAL ═══ */}
      {showAdd && <div className="modal-overlay" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">➕ Add vMix Connection</h2>
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div>
        <div className="form-group"><label className="form-label">Host</label><input className="form-input" value={form.host} onChange={e => setForm({...form,host:e.target.value})} placeholder="127.0.0.1" /></div>
        <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={form.port} onChange={e => setForm({...form,port:parseInt(e.target.value)})} /></div>
        <div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={addConn}>Add</button></div>
      </div></div>}
    </div>
  );
}
