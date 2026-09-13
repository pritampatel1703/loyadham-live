import { useState, useEffect, useCallback } from 'react';
import { vmixApi, analyticsApi } from '../api/client';

const BUSES = ['M','A','B','C','D','E','F','G'];

export default function VmixControl() {
  const [conns, setConns] = useState([]);
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: 'vMix', host: '127.0.0.1', port: 8088 });
  const [testing, setTesting] = useState(false);
  const [tab, setTab] = useState('audio');
  const [transDur, setTransDur] = useState(1000);
  const [faderVal, setFaderVal] = useState(0);
  // Audio
  const [volumes, setVolumes] = useState({});
  const [masterVol, setMasterVol] = useState(100);
  const [busVols, setBusVols] = useState({ A:100, B:100, C:100, D:100, E:100, F:100, G:100 });
  const [mutedInputs, setMutedInputs] = useState({});
  const [soloInputs, setSoloInputs] = useState({});
  // Overlays
  const [overlayInputs, setOverlayInputs] = useState({ 1:'', 2:'', 3:'', 4:'' });
  const [overlayOn, setOverlayOn] = useState({ 1:false, 2:false, 3:false, 4:false });
  // PTZ
  const [ptzInput, setPtzInput] = useState('');
  const [ptzSpeed, setPtzSpeed] = useState(2);
  const [ptzMode, setPtzMode] = useState('motor'); // 'motor' or 'virtual'
  // Color
  const [ccInput, setCcInput] = useState('');
  const [cc, setCc] = useState({ saturation:100, hue:0, gamma:0, gain:0, lift:0, contrast:0, brightness:0, alpha:255 });
  // Position
  const [posInput, setPosInput] = useState('');
  const [pos, setPos] = useState({ panX:0, panY:0, zoom:100, cropX1:0, cropY1:0, cropX2:0, cropY2:0 });
  // Titles
  const [titleInput, setTitleInput] = useState('');
  const [titleIdx, setTitleIdx] = useState(0);
  const [titleVal, setTitleVal] = useState('');
  // Countdown
  const [cdInput, setCdInput] = useState('');
  const [cdTime, setCdTime] = useState('00:05:00');
  // Browser
  const [brInput, setBrInput] = useState('');
  const [brUrl, setBrUrl] = useState('');
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
  // Layers
  const [layerInput, setLayerInput] = useState('');
  const [layerNum, setLayerNum] = useState(1);
  const [layerSrc, setLayerSrc] = useState('');
  // Sub-tabs
  const [cameraSub, setCameraSub] = useState('ptz');
  const [mediaSub, setMediaSub] = useState('overlays');
  const [toolsSub, setToolsSub] = useState('timer');

  const loadConns = () => vmixApi.connections().then(d => { setConns(d.connections||[]); if (!active && d.connections?.[0]) setActive(d.connections[0].id); }).catch(console.error);
  const loadLogs = () => analyticsApi.logs('vmix', 50).then(d => setLogs(d.logs||[])).catch(console.error);
  useEffect(() => { loadConns(); loadLogs(); }, []);
  useEffect(() => { if (!active) return; const poll = () => vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }).catch(() => setStatus(null)); poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, [active]);

  const testConn = async () => { setTesting(true); try { const r = await vmixApi.test(active); alert(r.connected ? '✅ Connected!' : '❌ ' + r.error); loadConns(); loadLogs(); } catch(e) { alert('❌ ' + e.message); } setTesting(false); };
  const act = useCallback(async (action, params) => { try { await vmixApi.action(active, action, params); if (['setPreview','setProgram','cut','fade','fadeToBlack','startRecording','stopRecording','startStreaming','stopStreaming','overlayOn','overlayOff'].includes(action)) setTimeout(() => vmixApi.status(active).then(d => { if (d.success) setStatus(d.status); }), 200); } catch(e) { console.error(e); } }, [active]);
  const addConn = async () => { await vmixApi.createConn(form); setShowAdd(false); loadConns(); };
  const inputs = status?.inputs || [];
  const conn = conns.find(c => c.id === active);

  // Auto-select active/preview input when status updates
  useEffect(() => {
    if (status?.inputs?.length) {
      const def = status.activeInput || status.previewInput || status.inputs[0]?.number || 1;
      setPtzInput(curr => curr || def);
      setCcInput(curr => curr || def);
      setPosInput(curr => curr || def);
    }
  }, [status]);

  // Reusable input selector
  const ISel = ({ val, set, label }) => (
    <select className="vc-select" value={val || ''} onChange={e => set(e.target.value)}>
      <option value="">{label || 'Select Input...'}</option>
      {inputs.map(i => <option key={i.number} value={i.number}>#{i.number} {i.title?.substring(0,18)}</option>)}
    </select>
  );

  // Quick camera selector bar for Camera & Color tabs
  const CamTargetBar = ({ currentInput, setInput }) => (
    <div className="vc-cam-target-bar">
      <div className="vc-cam-target-info">
        <span className="vc-cam-target-title">🎯 Target Input:</span>
        <span className="vc-cam-target-badge">
          {currentInput ? `#${currentInput} — ${inputs.find(i => String(i.number) === String(currentInput))?.title?.substring(0, 22) || 'Input ' + currentInput}` : 'No Input Selected'}
        </span>
      </div>
      <div className="vc-cam-target-btns">
        <button
          type="button"
          className={`vc-quick-cam-btn pgm ${String(currentInput) === String(status?.activeInput) ? 'active' : ''}`}
          onClick={() => status?.activeInput && setInput(status.activeInput)}
          title="Target current Program output"
        >
          🔴 PGM (#{status?.activeInput || '-'})
        </button>
        <button
          type="button"
          className={`vc-quick-cam-btn pvw ${String(currentInput) === String(status?.previewInput) ? 'active' : ''}`}
          onClick={() => status?.previewInput && setInput(status.previewInput)}
          title="Target current Preview output"
        >
          🟢 PVW (#{status?.previewInput || '-'})
        </button>
        <select
          className="vc-select"
          value={currentInput || ''}
          onChange={e => setInput(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">Choose Input...</option>
          {inputs.map(i => (
            <option key={i.number} value={i.number}>
              #{i.number} {i.title?.substring(0, 20)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="vc-root">
      {/* ═══════════════════════════════════════════
           CONNECTION BAR
         ═══════════════════════════════════════════ */}
      <div className="vc-conn-bar">
        <div className="vc-conn-left">
          <span className="vc-logo">🔗 vMix</span>
          {conns.map(c => (
            <button key={c.id} onClick={() => setActive(c.id)} className={`vc-conn-chip ${active===c.id?'active':''}`}>
              <span className={`vc-dot ${c.is_connected?'on':'off'}`}></span>{c.name}
            </button>
          ))}
          <button className="vc-conn-chip" onClick={() => setShowAdd(true)}>➕</button>
        </div>
        <div className="vc-conn-right">
          {conn && <button className="vc-test-btn" onClick={testConn} disabled={testing}>{testing ? '⏳' : '🔌 Test'}</button>}
          {status && <span className="vc-version">v{status.version}</span>}
        </div>
      </div>

      {!status && <div className="vc-empty">Connect to vMix to enable controls</div>}

      {status && <>
        {/* ═══════════════════════════════════════════
             ALWAYS-VISIBLE LIVE PRODUCTION DECK
           ═══════════════════════════════════════════ */}
        <div className="vc-live-deck">
          {/* PGM Row */}
          <div className="vc-bus-section">
            <div className="vc-bus-label pgm">PGM</div>
            <div className="vc-bus-row">
              {inputs.map(i => (
                <button key={i.number} className={`vc-bus-btn ${i.number===status.activeInput?'pgm':''}`}
                  onClick={() => act('setProgram',{input:i.number})} title={i.title}>{i.number}</button>
              ))}
            </div>
          </div>
          {/* PVW Row */}
          <div className="vc-bus-section">
            <div className="vc-bus-label pvw">PVW</div>
            <div className="vc-bus-row">
              {inputs.map(i => (
                <button key={i.number} className={`vc-bus-btn ${i.number===status.previewInput?'pvw':''}`}
                  onClick={() => act('setPreview',{input:i.number})} title={i.title}>{i.number}</button>
              ))}
            </div>
          </div>
          {/* Transition Bar */}
          <div className="vc-trans-bar">
            <button className="vc-trans cut" onClick={() => act('cut')}>CUT</button>
            <button className="vc-trans fade" onClick={() => act('fade',{duration:transDur})}>FADE</button>
            {['zoom','wipe','slide','fly','cube','merge'].map(t => (
              <button key={t} className="vc-trans" onClick={() => act(t,{duration:transDur})}>{t.toUpperCase()}</button>
            ))}
            {[1,2,3,4].map(n => (
              <button key={`st${n}`} className="vc-trans stinger" onClick={() => act('stinger',{number:n})}>STING{n}</button>
            ))}
            <div className="vc-trans-spacer"></div>
            <button className="vc-trans ftb" onClick={() => act('fadeToBlack')}>FTB</button>
            <div className="vc-trans-dur">
              <input type="range" min="100" max="3000" value={transDur} onChange={e => setTransDur(parseInt(e.target.value))} />
              <span>{transDur}ms</span>
            </div>
          </div>
          {/* Status + Actions Row */}
          <div className="vc-status-row">
            <div className="vc-status-pills">
              <span className={`vc-pill ${status.recording?'rec':''}`}>{status.recording?'⏺ REC':'⏺ REC'}</span>
              <span className={`vc-pill ${status.streaming?'live':''}`}>{status.streaming?'📡 LIVE':'📡 STREAM'}</span>
            </div>
            <div className="vc-action-btns">
              <button className={`vc-action ${status.recording?'danger':''}`} onClick={() => act(status.recording?'stopRecording':'startRecording')}>{status.recording?'⏹ Stop Rec':'⏺ Record'}</button>
              <button className={`vc-action ${status.streaming?'danger':''}`} onClick={() => act(status.streaming?'stopStreaming':'startStreaming')}>{status.streaming?'⏹ Stop':'📡 Stream'}</button>
              <button className="vc-action" onClick={() => act('snapshot')}>📷</button>
            </div>
            <div className="vc-tbar">
              <span>T-Bar</span>
              <input type="range" min="0" max="255" value={faderVal} onChange={e => { setFaderVal(parseInt(e.target.value)); act('setFader',{value:parseInt(e.target.value)}); }} />
              <span className="vc-tbar-val">{faderVal}</span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
             5 MAIN TABS
           ═══════════════════════════════════════════ */}
        <div className="vc-tabs">
          {[
            { k:'audio', l:'🔊 Audio Mixer' },
            { k:'camera', l:'🎥 Camera & Color' },
            { k:'media', l:'📺 Media & Overlays' },
            { k:'output', l:'📡 Output' },
            { k:'tools', l:'🔧 Tools' },
          ].map(t => (
            <button key={t.k} className={`vc-tab ${tab===t.k?'active':''}`} onClick={() => setTab(t.k)}>{t.l}</button>
          ))}
        </div>

        <div className="vc-content">
          {/* ═══ AUDIO MIXER ═══ */}
          {tab === 'audio' && <>
            {/* Master + Bus Row */}
            <div className="vc-audio-buses">
              <div className="vc-audio-bus-card master">
                <div className="vc-abh">MASTER</div>
                <input type="range" min="0" max="100" value={masterVol} orient="vertical" className="vc-vslider"
                  onChange={e => { setMasterVol(parseInt(e.target.value)); act('setMasterVolume',{volume:parseInt(e.target.value)}); }} />
                <span className="vc-vol-val">{masterVol}%</span>
                <div className="vc-ab-btns">
                  <button className="vc-ab-btn on" onClick={() => act('masterAudioOn')}>ON</button>
                  <button className="vc-ab-btn off" onClick={() => act('masterAudioOff')}>MUTE</button>
                </div>
              </div>
              {['A','B','C','D','E','F','G'].map(b => (
                <div key={b} className="vc-audio-bus-card">
                  <div className="vc-abh">BUS {b}</div>
                  <input type="range" min="0" max="100" value={busVols[b]} className="vc-vslider"
                    onChange={e => { setBusVols(v => ({...v,[b]:parseInt(e.target.value)})); act('setBusVolume',{bus:b,volume:parseInt(e.target.value)}); }} />
                  <span className="vc-vol-val">{busVols[b]}%</span>
                  <div className="vc-ab-btns">
                    <button className="vc-ab-btn on" onClick={() => act('busAudioOn',{bus:b})}>ON</button>
                    <button className="vc-ab-btn off" onClick={() => act('busAudioOff',{bus:b})}>OFF</button>
                  </div>
                </div>
              ))}
            </div>
            {/* Per-Input Audio */}
            <div className="vc-section-label">Input Channels</div>
            <div className="vc-audio-inputs">
              {inputs.map(inp => (
                <div key={inp.number} className="vc-audio-ch">
                  <div className="vc-ach-top">
                    <span className="vc-ach-name">{inp.number}</span>
                    <span className="vc-ach-title">{inp.title?.substring(0,10)}</span>
                  </div>
                  <input type="range" min="0" max="100" value={volumes[inp.number]||100} className="vc-hslider"
                    onChange={e => { setVolumes(v => ({...v,[inp.number]:parseInt(e.target.value)})); act('setVolume',{input:inp.number,volume:parseInt(e.target.value)}); }}
                    style={{ accentColor: mutedInputs[inp.number] ? '#ef4444' : '#22c55e' }} />
                  <div className="vc-ach-btns">
                    <button className={`vc-ach-btn ${mutedInputs[inp.number]?'muted':''}`}
                      onClick={() => { setMutedInputs(m => ({...m,[inp.number]:!m[inp.number]})); act(mutedInputs[inp.number]?'unmute':'mute',{input:inp.number}); }}>
                      {mutedInputs[inp.number]?'🔇':'🔊'}
                    </button>
                    <button className={`vc-ach-btn ${soloInputs[inp.number]?'solo':''}`}
                      onClick={() => { setSoloInputs(s => ({...s,[inp.number]:!s[inp.number]})); act('soloToggle',{input:inp.number}); }}>S</button>
                    {['M','A','B'].map(b => <button key={b} className="vc-ach-bus" onClick={() => act('audioBusToggle',{input:inp.number,bus:b})}>{b}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </>}

          {/* ═══ CAMERA & COLOR ═══ */}
          {tab === 'camera' && <>
            <div className="vc-sub-tabs">
              {[
                { k: 'ptz', l: '🎥 PTZ Camera Control' },
                { k: 'color', l: '🎨 Color Correction' },
                { k: 'position', l: '📐 Position & Zoom' }
              ].map(t => (
                <button key={t.k} className={`vc-sub-tab ${cameraSub===t.k?'active':''}`} onClick={() => setCameraSub(t.k)}>{t.l}</button>
              ))}
            </div>

            {/* ─── PTZ SUB-TAB ─── */}
            {cameraSub === 'ptz' && (
              <div className="vc-cam-panel">
                <CamTargetBar currentInput={ptzInput} setInput={setPtzInput} />

                {/* Mode & Speed Bar */}
                <div className="vc-ptz-topbar">
                  <div className="vc-ptz-mode-select">
                    <span className="vc-field-label">Control Mode:</span>
                    <button
                      type="button"
                      className={`vc-mode-pill ${ptzMode==='motor'?'active':''}`}
                      onClick={() => setPtzMode('motor')}
                    >
                      🎮 Motorized PTZ (vMix/Visca)
                    </button>
                    <button
                      type="button"
                      className={`vc-mode-pill ${ptzMode==='virtual'?'active':''}`}
                      onClick={() => setPtzMode('virtual')}
                    >
                      📐 Virtual PTZ (Pan/Zoom for Any Camera)
                    </button>
                  </div>
                  <div className="vc-ptz-speed-select">
                    <span className="vc-field-label">Speed:</span>
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        type="button"
                        className={`vc-speed-pill ${ptzSpeed===s?'active':''}`}
                        onClick={() => setPtzSpeed(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vc-ptz-grid">
                  {/* Directional Pad */}
                  <div className="vc-ptz-block">
                    <div className="vc-field-label">Pan / Tilt Pad (Hold or Click)</div>
                    <div className="vc-ptz-pad">
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveUpLeft',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.max(-100, p.panX - 5 * ptzSpeed);
                              const ny = Math.min(100, p.panY + 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panX: nx, panY: ny };
                            });
                          } else {
                            act('ptzMoveUpLeft',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Up-Left"
                      >↖</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveUp',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const ny = Math.min(100, p.panY + 5 * ptzSpeed);
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panY: ny };
                            });
                          } else {
                            act('ptzMoveUp',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Tilt Up"
                      >⬆</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveUpRight',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.min(100, p.panX + 5 * ptzSpeed);
                              const ny = Math.min(100, p.panY + 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panX: nx, panY: ny };
                            });
                          } else {
                            act('ptzMoveUpRight',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Up-Right"
                      >↗</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveLeft',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.max(-100, p.panX - 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              return { ...p, panX: nx };
                            });
                          } else {
                            act('ptzMoveLeft',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Pan Left"
                      >⬅</button>
                      <button
                        className="vc-ptz-btn stop"
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => ({ ...p, panX: 0, panY: 0 }));
                            act('setPanX',{input:ptzInput,value:'0'});
                            act('setPanY',{input:ptzInput,value:'0'});
                          } else {
                            act('ptzMoveStop',{input:ptzInput});
                          }
                        }}
                        title={ptzMode==='virtual' ? 'Center Pan/Tilt' : 'Stop Movement'}
                      >⏹</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveRight',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.min(100, p.panX + 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              return { ...p, panX: nx };
                            });
                          } else {
                            act('ptzMoveRight',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Pan Right"
                      >➡</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveDownLeft',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.max(-100, p.panX - 5 * ptzSpeed);
                              const ny = Math.max(-100, p.panY - 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panX: nx, panY: ny };
                            });
                          } else {
                            act('ptzMoveDownLeft',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Down-Left"
                      >↙</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveDown',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const ny = Math.max(-100, p.panY - 5 * ptzSpeed);
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panY: ny };
                            });
                          } else {
                            act('ptzMoveDown',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Tilt Down"
                      >⬇</button>
                      <button
                        className="vc-ptz-btn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzMoveDownRight',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzMoveStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nx = Math.min(100, p.panX + 5 * ptzSpeed);
                              const ny = Math.max(-100, p.panY - 5 * ptzSpeed);
                              act('setPanX',{input:ptzInput,value:(nx/100).toFixed(2)});
                              act('setPanY',{input:ptzInput,value:(ny/100).toFixed(2)});
                              return { ...p, panX: nx, panY: ny };
                            });
                          } else {
                            act('ptzMoveDownRight',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzMoveStop',{input:ptzInput}), 350);
                          }
                        }}
                        title="Down-Right"
                      >↘</button>
                    </div>

                    {/* Zoom & Focus */}
                    <div className="vc-field-label">Zoom & Focus</div>
                    <div className="vc-ptz-zoom">
                      <button
                        className="vc-ptz-zbtn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzZoomIn',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzZoomStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nz = Math.min(300, p.zoom + 10 * ptzSpeed);
                              act('setZoom',{input:ptzInput,value:(nz/100).toFixed(2)});
                              return { ...p, zoom: nz };
                            });
                          } else {
                            act('ptzZoomIn',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzZoomStop',{input:ptzInput}), 350);
                          }
                        }}
                      >🔍 + Zoom In</button>
                      <button className="vc-ptz-zbtn" onClick={() => { if(ptzMode==='motor') act('ptzZoomStop',{input:ptzInput}); }}>⏹ Stop</button>
                      <button
                        className="vc-ptz-zbtn"
                        onMouseDown={() => { if(ptzMode==='motor') act('ptzZoomOut',{input:ptzInput,speed:ptzSpeed}); }}
                        onMouseUp={() => { if(ptzMode==='motor') act('ptzZoomStop',{input:ptzInput}); }}
                        onClick={() => {
                          if (ptzMode==='virtual') {
                            setPos(p => {
                              const nz = Math.max(10, p.zoom - 10 * ptzSpeed);
                              act('setZoom',{input:ptzInput,value:(nz/100).toFixed(2)});
                              return { ...p, zoom: nz };
                            });
                          } else {
                            act('ptzZoomOut',{input:ptzInput,speed:ptzSpeed});
                            setTimeout(() => act('ptzZoomStop',{input:ptzInput}), 350);
                          }
                        }}
                      >🔍 − Zoom Out</button>
                    </div>

                    <div className="vc-ptz-focus">
                      <button className="vc-ptz-fbtn" onClick={() => act('ptzFocusNear',{input:ptzInput})}>Near</button>
                      <button className="vc-ptz-fbtn auto" onClick={() => act('ptzFocusAuto',{input:ptzInput})}>Auto Focus</button>
                      <button className="vc-ptz-fbtn" onClick={() => act('ptzFocusFar',{input:ptzInput})}>Far</button>
                      <button className="vc-ptz-fbtn" onClick={() => act('ptzFocusStop',{input:ptzInput})}>Stop</button>
                    </div>
                    <button
                      className="vc-ptz-home"
                      onClick={() => {
                        if (ptzMode==='virtual') {
                          setPos(p => ({ ...p, panX: 0, panY: 0, zoom: 100 }));
                          act('setPanX',{input:ptzInput,value:'0'});
                          act('setPanY',{input:ptzInput,value:'0'});
                          act('setZoom',{input:ptzInput,value:'1'});
                        } else {
                          act('ptzHome',{input:ptzInput});
                        }
                      }}
                    >
                      🏠 Reset to Home Position
                    </button>
                  </div>

                  {/* Presets */}
                  <div className="vc-ptz-block presets">
                    <div className="vc-field-label">Camera Presets (P1 - P8)</div>
                    <div className="vc-ptz-presets">
                      {[1,2,3,4,5,6,7,8].map(n => (
                        <div key={n} className="vc-ptz-preset">
                          <button
                            className="vc-ptz-preset-go"
                            onClick={() => act('ptzMoveToPreset',{input:ptzInput,preset:n})}
                            title={`Move to Preset ${n}`}
                          >
                            P{n}
                          </button>
                          <button
                            className="vc-ptz-preset-save"
                            onClick={() => act('ptzSavePreset',{input:ptzInput,preset:n})}
                            title={`Save current position to Preset ${n}`}
                          >
                            💾 Save
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── COLOR CORRECTION SUB-TAB ─── */}
            {cameraSub === 'color' && (
              <div className="vc-cam-panel">
                <CamTargetBar currentInput={ccInput} setInput={setCcInput} />

                {/* Top Action Bar */}
                <div className="vc-color-actions">
                  <div className="vc-preset-chips">
                    <span className="vc-field-label" style={{alignSelf:'center',margin:0}}>Looks:</span>
                    {[
                      { l: 'Standard', cc: { saturation: 100, hue: 0, lift: 0, gamma: 0, gain: 0 } },
                      { l: 'Vivid', cc: { saturation: 135, hue: 0, lift: 0, gamma: 0, gain: 10 } },
                      { l: 'Warm', cc: { saturation: 110, hue: 15, lift: 0, gamma: 0, gain: 8 } },
                      { l: 'Cool', cc: { saturation: 105, hue: -15, lift: -5, gamma: 0, gain: 0 } },
                      { l: 'Cinematic', cc: { saturation: 115, hue: 0, lift: 8, gamma: -8, gain: 12 } },
                      { l: 'B&W', cc: { saturation: 0, hue: 0, lift: 0, gamma: 0, gain: 0 } },
                    ].map(p => (
                      <button
                        key={p.l}
                        type="button"
                        className="vc-preset-chip"
                        onClick={() => {
                          const inp = ccInput || status?.activeInput || inputs[0]?.number;
                          if (!inp) return;
                          setCc(curr => ({ ...curr, ...p.cc }));
                          act('setCCSaturation', { input: inp, value: (p.cc.saturation / 100).toFixed(2) });
                          act('setCCHue', { input: inp, value: (p.cc.hue / 180).toFixed(2) });
                          act('setCCLift', { input: inp, value: (p.cc.lift / 100).toFixed(2) });
                          act('setCCGamma', { input: inp, value: (p.cc.gamma / 100).toFixed(2) });
                          act('setCCGain', { input: inp, value: (p.cc.gain / 100).toFixed(2) });
                        }}
                      >
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="vc-color-btn reset"
                    onClick={() => {
                      const inp = ccInput || status?.activeInput || inputs[0]?.number;
                      setCc({ saturation: 100, hue: 0, gamma: 0, gain: 0, lift: 0, contrast: 0, brightness: 0, alpha: 255 });
                      if (inp) act('resetColorCorrection', { input: inp });
                    }}
                  >
                    ↩ Reset Color
                  </button>
                </div>

                {/* Sliders Grid */}
                <div className="vc-sliders-grid">
                  {[
                    { k: 'saturation', l: 'Saturation', min: 0, max: 200, unit: '%', def: 100, c: '#ec4899',
                      fn: (v) => act('setCCSaturation', { input: ccInput, value: (v / 100).toFixed(2) }) },
                    { k: 'hue', l: 'Hue', min: -180, max: 180, unit: '°', def: 0, c: '#8b5cf6',
                      fn: (v) => act('setCCHue', { input: ccInput, value: (v / 180).toFixed(2) }) },
                    { k: 'lift', l: 'Lift (Blacks)', min: -100, max: 100, unit: '', def: 0, c: '#3b82f6',
                      fn: (v) => act('setCCLift', { input: ccInput, value: (v / 100).toFixed(2) }) },
                    { k: 'gamma', l: 'Gamma (Mids)', min: -100, max: 100, unit: '', def: 0, c: '#f59e0b',
                      fn: (v) => act('setCCGamma', { input: ccInput, value: (v / 100).toFixed(2) }) },
                    { k: 'gain', l: 'Gain (Whites)', min: -100, max: 100, unit: '', def: 0, c: '#22c55e',
                      fn: (v) => act('setCCGain', { input: ccInput, value: (v / 100).toFixed(2) }) },
                    { k: 'alpha', l: 'Opacity (Alpha)', min: 0, max: 255, unit: '', def: 255, c: '#94a3b8',
                      fn: (v) => act('setAlpha', { input: ccInput, value: v }) },
                  ].map(s => (
                    <div key={s.k} className="vc-slider-card">
                      <div className="vc-slider-card-top">
                        <span className="vc-slider-label">{s.l}</span>
                        <span className="vc-slider-val">{cc[s.k]}{s.unit}</span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={cc[s.k]}
                        className="vc-slider"
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          setCc(c => ({ ...c, [s.k]: v }));
                          s.fn(v);
                        }}
                        style={{ accentColor: s.c }}
                      />
                      <div className="vc-slider-card-bot">
                        <span>{s.min}{s.unit}</span>
                        <button
                          type="button"
                          className="vc-slider-reset-dot"
                          onClick={() => {
                            setCc(c => ({ ...c, [s.k]: s.def }));
                            s.fn(s.def);
                          }}
                          title={`Reset to default (${s.def})`}
                        >
                          Def
                        </button>
                        <span>{s.max}{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── POSITION & ZOOM SUB-TAB ─── */}
            {cameraSub === 'position' && (
              <div className="vc-cam-panel">
                <CamTargetBar currentInput={posInput} setInput={setPosInput} />

                {/* Layout Presets */}
                <div className="vc-color-actions">
                  <div className="vc-preset-chips">
                    <span className="vc-field-label" style={{alignSelf:'center',margin:0}}>Layouts:</span>
                    {[
                      { l: 'Fullscreen', pos: { panX: 0, panY: 0, zoom: 100, cropX1: 0, cropY1: 0, cropX2: 0, cropY2: 0 } },
                      { l: 'PIP Bottom-Right', pos: { panX: 60, panY: -60, zoom: 35, cropX1: 0, cropY1: 0, cropX2: 0, cropY2: 0 } },
                      { l: 'PIP Top-Right', pos: { panX: 60, panY: 60, zoom: 35, cropX1: 0, cropY1: 0, cropX2: 0, cropY2: 0 } },
                      { l: 'Split Left', pos: { panX: -25, panY: 0, zoom: 100, cropX1: 0, cropY1: 0, cropX2: 50, cropY2: 0 } },
                      { l: 'Split Right', pos: { panX: 25, panY: 0, zoom: 100, cropX1: 50, cropY1: 0, cropX2: 0, cropY2: 0 } },
                    ].map(p => (
                      <button
                        key={p.l}
                        type="button"
                        className="vc-preset-chip"
                        onClick={() => {
                          const inp = posInput || status?.activeInput || inputs[0]?.number;
                          if (!inp) return;
                          setPos(curr => ({ ...curr, ...p.pos }));
                          act('setPanX', { input: inp, value: (p.pos.panX / 100).toFixed(2) });
                          act('setPanY', { input: inp, value: (p.pos.panY / 100).toFixed(2) });
                          act('setZoom', { input: inp, value: (p.pos.zoom / 100).toFixed(2) });
                          act('setCropX1', { input: inp, value: (p.pos.cropX1 / 100).toFixed(2) });
                          act('setCropY1', { input: inp, value: (p.pos.cropY1 / 100).toFixed(2) });
                          act('setCropX2', { input: inp, value: (1 - p.pos.cropX2 / 100).toFixed(2) });
                          act('setCropY2', { input: inp, value: (1 - p.pos.cropY2 / 100).toFixed(2) });
                        }}
                      >
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="vc-color-btn reset"
                    onClick={() => {
                      const inp = posInput || status?.activeInput || inputs[0]?.number;
                      setPos({ panX: 0, panY: 0, zoom: 100, cropX1: 0, cropY1: 0, cropX2: 0, cropY2: 0 });
                      if (inp) act('resetPosition', { input: inp });
                    }}
                  >
                    ↩ Reset All
                  </button>
                </div>

                {/* Sliders Grid */}
                <div className="vc-sliders-grid">
                  {[
                    { k: 'panX', l: 'Pan X (Horizontal)', min: -100, max: 100, unit: '%', def: 0, c: 'var(--accent)',
                      fn: (v) => act('setPanX', { input: posInput, value: (v / 100).toFixed(2) }) },
                    { k: 'panY', l: 'Pan Y (Vertical)', min: -100, max: 100, unit: '%', def: 0, c: 'var(--accent)',
                      fn: (v) => act('setPanY', { input: posInput, value: (v / 100).toFixed(2) }) },
                    { k: 'zoom', l: 'Zoom %', min: 10, max: 300, unit: '%', def: 100, c: '#22c55e',
                      fn: (v) => act('setZoom', { input: posInput, value: (v / 100).toFixed(2) }) },
                    { k: 'cropX1', l: 'Crop Left', min: 0, max: 50, unit: '%', def: 0, c: '#f59e0b',
                      fn: (v) => act('setCropX1', { input: posInput, value: (v / 100).toFixed(2) }) },
                    { k: 'cropY1', l: 'Crop Top', min: 0, max: 50, unit: '%', def: 0, c: '#f59e0b',
                      fn: (v) => act('setCropY1', { input: posInput, value: (v / 100).toFixed(2) }) },
                    { k: 'cropX2', l: 'Crop Right', min: 0, max: 50, unit: '%', def: 0, c: '#f59e0b',
                      fn: (v) => act('setCropX2', { input: posInput, value: (1 - v / 100).toFixed(2) }) },
                    { k: 'cropY2', l: 'Crop Bottom', min: 0, max: 50, unit: '%', def: 0, c: '#f59e0b',
                      fn: (v) => act('setCropY2', { input: posInput, value: (1 - v / 100).toFixed(2) }) },
                  ].map(s => (
                    <div key={s.k} className="vc-slider-card">
                      <div className="vc-slider-card-top">
                        <span className="vc-slider-label">{s.l}</span>
                        <span className="vc-slider-val">{pos[s.k]}{s.unit}</span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={pos[s.k]}
                        className="vc-slider"
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          setPos(p => ({ ...p, [s.k]: v }));
                          s.fn(v);
                        }}
                        style={{ accentColor: s.c }}
                      />
                      <div className="vc-slider-card-bot">
                        <span>{s.min}{s.unit}</span>
                        <button
                          type="button"
                          className="vc-slider-reset-dot"
                          onClick={() => {
                            setPos(p => ({ ...p, [s.k]: s.def }));
                            s.fn(s.def);
                          }}
                          title={`Reset to default (${s.def})`}
                        >
                          Def
                        </button>
                        <span>{s.max}{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>}

          {/* ═══ MEDIA & OVERLAYS ═══ */}
          {tab === 'media' && <>
            <div className="vc-sub-tabs">
              {[{k:'overlays',l:'🖼️ Overlays'},{k:'playback',l:'▶ Playback'},{k:'replay',l:'⏪ Replay'},{k:'titles',l:'📝 Titles'}].map(t => (
                <button key={t.k} className={`vc-sub-tab ${mediaSub===t.k?'active':''}`} onClick={() => setMediaSub(t.k)}>{t.l}</button>
              ))}
            </div>

            {mediaSub === 'overlays' && (
              <div className="vc-overlay-grid">
                {[1,2,3,4].map(n => (
                  <div key={n} className={`vc-overlay-card ${overlayOn[n]?'on':''}`}>
                    <div className="vc-ov-header">
                      <span>Overlay {n}</span>
                      <span className={`vc-ov-badge ${overlayOn[n]?'on':'off'}`}>{overlayOn[n]?'ON':'OFF'}</span>
                    </div>
                    <input className="vc-select" type="number" placeholder="Input #" value={overlayInputs[n]}
                      onChange={e => setOverlayInputs(o => ({...o,[n]:e.target.value}))} />
                    <div className="vc-ov-btns">
                      <button className="vc-ov-btn on" onClick={() => { if(overlayInputs[n]){act('overlayOn',{number:n,input:overlayInputs[n]});setOverlayOn(o=>({...o,[n]:true}));} }}>ON</button>
                      <button className="vc-ov-btn off" onClick={() => { act('overlayOff',{number:n}); setOverlayOn(o=>({...o,[n]:false})); }}>OFF</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mediaSub === 'playback' && (
              <div className="vc-playback-grid">
                {inputs.map(inp => (
                  <div key={inp.number} className="vc-play-card">
                    <div className="vc-play-header">
                      <span>#{inp.number} {inp.title?.substring(0,14)}</span>
                      <span className="vc-play-type">{inp.type}</span>
                    </div>
                    <div className="vc-play-btns">
                      <button onClick={() => act('play',{input:inp.number})}>▶</button>
                      <button onClick={() => act('pause',{input:inp.number})}>⏸</button>
                      <button onClick={() => act('restart',{input:inp.number})}>⏮</button>
                      <button onClick={() => act('loopOn',{input:inp.number})}>🔁</button>
                      <button onClick={() => act('fullscreen',{input:inp.number})}>⛶</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mediaSub === 'replay' && (
              <div className="vc-replay">
                <div className="vc-replay-main">
                  <button className="vc-rp-btn play" onClick={() => act('replayPlay')}>▶ Play</button>
                  <button className="vc-rp-btn" onClick={() => act('replayPause')}>⏸ Pause</button>
                  <button className="vc-rp-btn" onClick={() => act('replayJumpToNow')}>⏭ Now</button>
                  <button className="vc-rp-btn" onClick={() => act('replayLive')}>🔴 Live</button>
                  <button className="vc-rp-btn" onClick={() => act('replayMoveLastEvent')}>📌 Last</button>
                </div>
                <div className="vc-replay-speed">
                  {[0.25,0.5,1,2,4,8].map(s => <button key={s} className="vc-rp-speed" onClick={() => act('replayChangeSpeed',{speed:s})}>{s}x</button>)}
                </div>
                <div className="vc-replay-marks">
                  <button className="vc-rp-mark in" onClick={() => act('replayMarkIn')}>MARK IN</button>
                  <button className="vc-rp-mark out" onClick={() => act('replayMarkOut')}>MARK OUT</button>
                </div>
              </div>
            )}

            {mediaSub === 'titles' && (
              <div className="vc-titles">
                <div className="vc-title-form">
                  <ISel val={titleInput} set={setTitleInput} label="Title Input..." />
                  <input className="vc-select" type="number" min="0" placeholder="Index" value={titleIdx} onChange={e => setTitleIdx(parseInt(e.target.value)||0)} style={{maxWidth:80}} />
                  <input className="vc-select" value={titleVal} onChange={e => setTitleVal(e.target.value)} placeholder="New text..." style={{flex:1}} />
                  <button className="vc-title-apply" onClick={() => act('setText',{input:titleInput,index:titleIdx,value:titleVal})}>Apply</button>
                </div>
                <div className="vc-title-presets">
                  <button className="vc-rp-btn" onClick={() => act('previousTitlePreset',{input:titleInput})}>◀ Prev Preset</button>
                  <button className="vc-rp-btn" onClick={() => act('nextTitlePreset',{input:titleInput})}>Next Preset ▶</button>
                </div>
              </div>
            )}
          </>}

          {/* ═══ OUTPUT ═══ */}
          {tab === 'output' && (
            <div className="vc-output-grid">
              <div className="vc-out-card">
                <div className="vc-out-icon">📡</div>
                <div className="vc-out-label">External Output</div>
                <div className="vc-out-btns">
                  <button className="vc-out-btn start" onClick={() => act('startExternal')}>▶ Start</button>
                  <button className="vc-out-btn stop" onClick={() => act('stopExternal')}>⏹ Stop</button>
                </div>
              </div>
              <div className="vc-out-card">
                <div className="vc-out-icon">🎬</div>
                <div className="vc-out-label">MultiCorder</div>
                <div className="vc-out-btns">
                  <button className="vc-out-btn start" onClick={() => act('startMultiCorder')}>⏺ Start</button>
                  <button className="vc-out-btn stop" onClick={() => act('stopMultiCorder')}>⏹ Stop</button>
                </div>
              </div>
              {[0,1,2].map(n => (
                <div key={n} className="vc-out-card">
                  <div className="vc-out-icon">📺</div>
                  <div className="vc-out-label">Stream #{n+1}</div>
                  <div className="vc-out-btns">
                    <button className="vc-out-btn start" onClick={() => act('startStream',{number:n})}>▶</button>
                    <button className="vc-out-btn stop" onClick={() => act('stopStream',{number:n})}>⏹</button>
                  </div>
                </div>
              ))}
              <div className="vc-out-card wide">
                <div className="vc-out-icon">📡</div>
                <div className="vc-out-label">NDI Source Select</div>
                <div className="vc-ndi-row">
                  <ISel val={ndiInput} set={setNdiInput} label="NDI Input..." />
                  <input className="vc-select" value={ndiSource} onChange={e => setNdiSource(e.target.value)} placeholder="Source Name" style={{flex:1}} />
                  <button className="vc-title-apply" onClick={() => act('ndiSelectSource',{input:ndiInput,sourceName:ndiSource})}>Select</button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TOOLS ═══ */}
          {tab === 'tools' && <>
            <div className="vc-sub-tabs">
              {[{k:'timer',l:'⏱ Timer'},{k:'browser',l:'🌐 Browser'},{k:'layers',l:'📐 Layers'},{k:'scripts',l:'📜 Scripts'},{k:'raw',l:'🔧 Raw API'},{k:'log',l:'📋 Log'}].map(t => (
                <button key={t.k} className={`vc-sub-tab ${toolsSub===t.k?'active':''}`} onClick={() => setToolsSub(t.k)}>{t.l}</button>
              ))}
            </div>

            {toolsSub === 'timer' && (
              <div className="vc-timer">
                <ISel val={cdInput} set={setCdInput} label="Timer Input..." />
                <input className="vc-select vc-time-input" value={cdTime} onChange={e => setCdTime(e.target.value)} placeholder="00:05:00" />
                <button className="vc-timer-btn set" onClick={() => act('setCountdown',{input:cdInput,value:cdTime})}>Set Time</button>
                <button className="vc-timer-btn play" onClick={() => act('startCountdown',{input:cdInput})}>▶ Start</button>
                <button className="vc-timer-btn" onClick={() => act('pauseCountdown',{input:cdInput})}>⏸ Pause</button>
                <button className="vc-timer-btn stop" onClick={() => act('stopCountdown',{input:cdInput})}>⏹ Stop</button>
              </div>
            )}

            {toolsSub === 'browser' && (
              <div className="vc-browser-ctl">
                <div className="vc-browser-top">
                  <ISel val={brInput} set={setBrInput} label="Browser Input..." />
                  <input className="vc-select" value={brUrl} onChange={e => setBrUrl(e.target.value)} placeholder="https://..." style={{flex:1}} />
                  <button className="vc-title-apply" onClick={() => act('browserNavigate',{input:brInput,url:brUrl})}>Go</button>
                </div>
                <div className="vc-browser-btns">
                  <button className="vc-rp-btn" onClick={() => act('browserBack',{input:brInput})}>◀ Back</button>
                  <button className="vc-rp-btn" onClick={() => act('browserForward',{input:brInput})}>Forward ▶</button>
                  <button className="vc-rp-btn" onClick={() => act('browserReload',{input:brInput})}>🔄 Reload</button>
                </div>
              </div>
            )}

            {toolsSub === 'layers' && (
              <div className="vc-layers">
                <ISel val={layerInput} set={setLayerInput} label="Target Input..." />
                <input className="vc-select" type="number" min="1" max="10" value={layerNum} onChange={e => setLayerNum(parseInt(e.target.value)||1)} style={{maxWidth:80}} placeholder="Layer #" />
                <input className="vc-select" value={layerSrc} onChange={e => setLayerSrc(e.target.value)} placeholder="Source Input #" style={{maxWidth:120}} />
                <button className="vc-title-apply" onClick={() => act('setLayer',{input:layerInput,layer:layerNum,source:layerSrc})}>Set Layer</button>
                <button className="vc-rp-btn" onClick={() => act('layerOff',{input:layerInput,layer:layerNum})}>Layer Off</button>
              </div>
            )}

            {toolsSub === 'scripts' && (
              <div className="vc-scripts">
                <input className="vc-select" value={scriptName} onChange={e => setScriptName(e.target.value)} placeholder="Script Name" style={{maxWidth:200}} />
                <button className="vc-timer-btn play" onClick={() => act('scriptStart',{name:scriptName})}>▶ Start</button>
                <button className="vc-timer-btn stop" onClick={() => act('scriptStop',{name:scriptName})}>⏹ Stop</button>
                <button className="vc-rp-btn" onClick={() => act('scriptStopAll')}>Stop All Scripts</button>
                <div style={{marginTop:16,display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:'.8rem',color:'var(--text-muted)'}}>Dynamic Value</span>
                  <select className="vc-select" value={dynNum} onChange={e => setDynNum(parseInt(e.target.value))} style={{maxWidth:60}}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select>
                  <input className="vc-select" value={dynVal} onChange={e => setDynVal(e.target.value)} placeholder="Value" style={{maxWidth:200}} />
                  <button className="vc-title-apply" onClick={() => act('setDynamicValue',{number:dynNum,value:dynVal})}>Set</button>
                </div>
              </div>
            )}

            {toolsSub === 'raw' && (
              <div className="vc-raw">
                <input className="vc-select" value={rawFunc} onChange={e => setRawFunc(e.target.value)} placeholder="Function Name (e.g. SetVolume)" style={{maxWidth:240}} />
                <input className="vc-select" value={rawParams} onChange={e => setRawParams(e.target.value)} placeholder='JSON: {"Input":"1","Value":"50"}' style={{flex:1}} />
                <button className="vc-title-apply" onClick={() => { try { const rp = rawParams ? JSON.parse(rawParams) : {}; act('raw',{functionName:rawFunc,rawParams:rp}); } catch { alert('Invalid JSON'); }}}>Execute</button>
              </div>
            )}

            {toolsSub === 'log' && (
              <div>
                <div className="log-panel" style={{maxHeight:400}}>{logs.length===0?<p style={{color:'var(--text-muted)'}}>No actions</p>:logs.map((l,i) => <div key={i} className="log-entry"><span className="log-time">{new Date(l.created_at).toLocaleTimeString()}</span><span className="log-type vmix">vmix</span><span className="log-msg">{l.message}</span></div>)}</div>
                <button className="vc-rp-btn" style={{marginTop:8}} onClick={loadLogs}>🔄 Refresh</button>
              </div>
            )}
          </>}
        </div>
      </>}

      {/* ═══ ADD MODAL ═══ */}
      {showAdd && <div className="modal-overlay" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">➕ Add vMix Connection</h2>
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div>
        <div className="form-group"><label className="form-label">Host</label><input className="form-input" value={form.host} onChange={e => setForm({...form,host:e.target.value})} /></div>
        <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={form.port} onChange={e => setForm({...form,port:parseInt(e.target.value)})} /></div>
        <div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={addConn}>Add</button></div>
      </div></div>}
    </div>
  );
}
