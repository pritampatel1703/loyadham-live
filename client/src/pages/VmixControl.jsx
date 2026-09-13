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

  // Reusable input selector
  const ISel = ({ val, set, label }) => (
    <select className="vc-select" value={val} onChange={e => set(e.target.value)}>
      <option value="">{label || 'Select Input...'}</option>
      {inputs.map(i => <option key={i.number} value={i.number}>#{i.number} {i.title?.substring(0,16)}</option>)}
    </select>
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
              {[{k:'ptz',l:'🎥 PTZ Control'},{k:'color',l:'🎨 Color Correction'},{k:'position',l:'📐 Position & Crop'}].map(t => (
                <button key={t.k} className={`vc-sub-tab ${cameraSub===t.k?'active':''}`} onClick={() => setCameraSub(t.k)}>{t.l}</button>
              ))}
            </div>

            {cameraSub === 'ptz' && (
              <div className="vc-ptz">
                <div className="vc-ptz-left">
                  <div className="vc-field-label">Camera Input</div>
                  <ISel val={ptzInput} set={setPtzInput} label="Select Camera..." />
                  <div className="vc-field-label" style={{marginTop:16}}>Presets</div>
                  <div className="vc-ptz-presets">
                    {[1,2,3,4,5,6,7,8].map(n => (
                      <div key={n} className="vc-ptz-preset">
                        <button className="vc-ptz-preset-go" onClick={() => act('ptzMoveToPreset',{input:ptzInput,preset:n})}>P{n}</button>
                        <button className="vc-ptz-preset-save" onClick={() => act('ptzSavePreset',{input:ptzInput,preset:n})}>💾</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="vc-ptz-right">
                  <div className="vc-ptz-pad">
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveUpLeft',{input:ptzInput})}>↖</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveUp',{input:ptzInput,speed:1})}>⬆</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveUpRight',{input:ptzInput})}>↗</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveLeft',{input:ptzInput,speed:1})}>⬅</button>
                    <button className="vc-ptz-btn stop" onClick={() => act('ptzMoveStop',{input:ptzInput})}>⏹</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveRight',{input:ptzInput,speed:1})}>➡</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveDownLeft',{input:ptzInput})}>↙</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveDown',{input:ptzInput,speed:1})}>⬇</button>
                    <button className="vc-ptz-btn" onClick={() => act('ptzMoveDownRight',{input:ptzInput})}>↘</button>
                  </div>
                  <div className="vc-ptz-zoom">
                    <button className="vc-ptz-zbtn" onClick={() => act('ptzZoomIn',{input:ptzInput,speed:1})}>🔍 +</button>
                    <button className="vc-ptz-zbtn" onClick={() => act('ptzZoomStop',{input:ptzInput})}>⏹</button>
                    <button className="vc-ptz-zbtn" onClick={() => act('ptzZoomOut',{input:ptzInput,speed:1})}>🔍 −</button>
                  </div>
                  <div className="vc-ptz-focus">
                    <button className="vc-ptz-fbtn" onClick={() => act('ptzFocusNear',{input:ptzInput})}>Near</button>
                    <button className="vc-ptz-fbtn auto" onClick={() => act('ptzFocusAuto',{input:ptzInput})}>Auto Focus</button>
                    <button className="vc-ptz-fbtn" onClick={() => act('ptzFocusFar',{input:ptzInput})}>Far</button>
                  </div>
                  <button className="vc-ptz-home" onClick={() => act('ptzHome',{input:ptzInput})}>🏠 Home Position</button>
                </div>
              </div>
            )}

            {cameraSub === 'color' && (
              <div className="vc-color">
                <div className="vc-color-top">
                  <ISel val={ccInput} set={setCcInput} label="Select Input..." />
                  <button className="vc-color-btn" onClick={() => act('colorCorrectionAuto',{input:ccInput})}>🎨 Auto</button>
                  <button className="vc-color-btn" onClick={() => act('colorCorrectionReset',{input:ccInput})}>↩ Reset</button>
                </div>
                <div className="vc-sliders-grid">
                  {[{k:'saturation',l:'Saturation',min:0,max:200,c:'#ec4899'},{k:'hue',l:'Hue',min:-180,max:180,c:'#8b5cf6'},{k:'gamma',l:'Gamma',min:-100,max:100,c:'#f59e0b'},{k:'gain',l:'Gain',min:-100,max:100,c:'#22c55e'},{k:'lift',l:'Lift',min:-100,max:100,c:'#3b82f6'},{k:'contrast',l:'Contrast',min:-100,max:100,c:'#06b6d4'},{k:'brightness',l:'Brightness',min:-100,max:100,c:'#f97316'},{k:'alpha',l:'Alpha',min:0,max:255,c:'#94a3b8'}].map(s => (
                    <div key={s.k} className="vc-slider-row">
                      <span className="vc-slider-label">{s.l}</span>
                      <input type="range" min={s.min} max={s.max} value={cc[s.k]} className="vc-slider"
                        onChange={e => { const v = parseInt(e.target.value); setCc(c => ({...c,[s.k]:v})); act(s.k==='alpha'?'setAlpha':`set${s.l}`,{input:ccInput,value:v}); }}
                        style={{ accentColor: s.c }} />
                      <span className="vc-slider-val">{cc[s.k]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cameraSub === 'position' && (
              <div className="vc-color">
                <div className="vc-color-top">
                  <ISel val={posInput} set={setPosInput} label="Select Input..." />
                  <button className="vc-color-btn" onClick={() => act('resetInput',{input:posInput})}>↩ Reset All</button>
                </div>
                <div className="vc-sliders-grid">
                  {[{k:'panX',l:'Pan X',min:-200,max:200,a:'setPanX'},{k:'panY',l:'Pan Y',min:-200,max:200,a:'setPanY'},{k:'zoom',l:'Zoom %',min:0,max:400,a:'setZoom'},{k:'cropX1',l:'Crop Left',min:0,max:100,a:'setCropX1'},{k:'cropY1',l:'Crop Top',min:0,max:100,a:'setCropY1'},{k:'cropX2',l:'Crop Right',min:0,max:100,a:'setCropX2'},{k:'cropY2',l:'Crop Bottom',min:0,max:100,a:'setCropY2'}].map(s => (
                    <div key={s.k} className="vc-slider-row">
                      <span className="vc-slider-label">{s.l}</span>
                      <input type="range" min={s.min} max={s.max} value={pos[s.k]} className="vc-slider"
                        onChange={e => { const v = parseInt(e.target.value); setPos(p => ({...p,[s.k]:v})); act(s.a,{input:posInput,value:v}); }}
                        style={{ accentColor: 'var(--accent)' }} />
                      <span className="vc-slider-val">{pos[s.k]}</span>
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
