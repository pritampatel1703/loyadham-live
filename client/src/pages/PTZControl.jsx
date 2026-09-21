import { useState, useRef, useCallback, useEffect } from 'react';
import { ptzApi } from '../api/client';
import { productionSocket, signalingSocket } from '../socket';
import { getIceConfig } from '../webrtc';

/* ═══════════════════════════════════════════════════════════
   PTZ CAMERA CONTROL — Professional Pan/Tilt/Zoom Controller
   Supports: IP PTZ Cameras (VISCA/ONVIF/CGI) + Phone Cameras
   ═══════════════════════════════════════════════════════════ */

const PROTOCOLS = ['VISCA', 'VISCA-over-IP', 'ONVIF', 'CGI', 'NDI'];

export default function PTZControl() {
  const [cameras, setCameras] = useState([]);
  const [activeCam, setActiveCam] = useState(null);
  const [presets, setPresets] = useState([]);
  const [speed, setSpeed] = useState(5);
  const [autoFocus, setAutoFocus] = useState(true);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', model: '', ip: '', port: 80, protocol: 'VISCA' });
  const [connectionStatus, setConnectionStatus] = useState({});
  const [isMoving, setIsMoving] = useState(false);
  const [lastAction, setLastAction] = useState('');
  const [localPTZ, setLocalPTZ] = useState({ pan: 0, tilt: 0, zoom: 50, focus: 50 });
  
  // Refs
  const joystickAreaRef = useRef(null);
  const moveTimerRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const cam = cameras.find(c => c.id === activeCam);

  // ── Load cameras from server ──
  const loadCameras = useCallback(async () => {
    try {
      const res = await ptzApi.cameras();
      if (res.cameras) {
        setCameras(res.cameras);
        if (!activeCam && res.cameras.length > 0) {
          setActiveCam(res.cameras[0].id);
        }
      }
    } catch (err) {
      console.error('[PTZ] Load cameras error:', err);
    }
  }, [activeCam]);

  // ── Load presets for active camera ──
  const loadPresets = useCallback(async () => {
    if (!activeCam) return;
    try {
      const res = await ptzApi.presets(activeCam);
      setPresets(res.presets || []);
    } catch (_) {
      setPresets([]);
    }
  }, [activeCam]);

  useEffect(() => { loadCameras(); }, []);
  useEffect(() => { loadPresets(); }, [activeCam, loadPresets]);

  // Sync local PTZ state when camera changes
  useEffect(() => {
    if (cam) {
      setLocalPTZ({ pan: cam.pan || 0, tilt: cam.tilt || 0, zoom: cam.zoom || 50, focus: cam.focus || 50 });
    }
  }, [activeCam]);

  // ── WebRTC preview for phone cameras ──
  useEffect(() => {
    if (!cam || !cam.isPhone) {
      // Cleanup WebRTC if switching away from phone cam
      if (peerConnRef.current) {
        try { peerConnRef.current.close(); } catch (_) {}
        peerConnRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    const deviceId = cam.deviceId;
    signalingSocket.connect();
    signalingSocket.emit('join-room', { roomId: `camera-${deviceId}` });
    signalingSocket.emit('request-offer', { roomId: `camera-${deviceId}` });

    const handleOffer = async ({ fromId, sdp, streamId }) => {
      if (streamId !== deviceId) return;
      try {
        const iceConfig = await getIceConfig();
        const pc = new RTCPeerConnection(iceConfig);
        peerConnRef.current = pc;

        pc.ontrack = (e) => {
          const stream = e.streams[0] || new MediaStream();
          if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
          remoteStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            signalingSocket.emit('ice-candidate', { targetId: fromId, candidate: e.candidate, streamId: deviceId });
          }
        };

        pc.onconnectionstatechange = () => {
          if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
            try { pc.close(); } catch (_) {}
            peerConnRef.current = null;
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
      } catch (err) {
        console.error('[PTZ] WebRTC error:', err);
      }
    };

    signalingSocket.on('offer', handleOffer);
    return () => {
      signalingSocket.off('offer', handleOffer);
      if (peerConnRef.current) {
        try { peerConnRef.current.close(); } catch (_) {}
        peerConnRef.current = null;
      }
    };
  }, [cam?.id, cam?.isPhone, cam?.deviceId]);

  // ── Send PTZ commands ──
  const sendMove = useCallback(async (dpan, dtilt) => {
    if (!activeCam) return;
    const newPan = Math.max(-180, Math.min(180, localPTZ.pan + dpan * speed));
    const newTilt = Math.max(-90, Math.min(90, localPTZ.tilt + dtilt * speed));
    setLocalPTZ(prev => ({ ...prev, pan: newPan, tilt: newTilt }));
    setIsMoving(true);
    setLastAction(`Pan: ${newPan.toFixed(1)}° Tilt: ${newTilt.toFixed(1)}°`);
    
    try {
      await ptzApi.move(activeCam, newPan, newTilt, speed);
    } catch (err) {
      console.error('[PTZ] Move error:', err);
    }
    
    setTimeout(() => setIsMoving(false), 200);
  }, [activeCam, localPTZ, speed]);

  const sendZoom = useCallback(async (newZoom) => {
    if (!activeCam) return;
    const z = Math.max(0, Math.min(100, newZoom));
    setLocalPTZ(prev => ({ ...prev, zoom: z }));
    setLastAction(`Zoom: ${z}%`);
    try { await ptzApi.zoom(activeCam, z); } catch (_) {}
  }, [activeCam]);

  const sendFocus = useCallback(async (newFocus) => {
    if (!activeCam) return;
    const f = Math.max(0, Math.min(100, newFocus));
    setLocalPTZ(prev => ({ ...prev, focus: f }));
    try { await ptzApi.focus(activeCam, f, autoFocus); } catch (_) {}
  }, [activeCam, autoFocus]);

  const goHome = useCallback(async () => {
    if (!activeCam) return;
    setLocalPTZ({ pan: 0, tilt: 0, zoom: 50, focus: 50 });
    setLastAction('HOME');
    try { await ptzApi.home(activeCam); } catch (_) {}
  }, [activeCam]);

  const recallPreset = useCallback(async (preset) => {
    if (!activeCam) return;
    setLocalPTZ({ pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom, focus: preset.focus || 50 });
    setLastAction(`Preset: ${preset.name}`);
    try { await ptzApi.recallPreset(activeCam, preset.id); } catch (_) {}
  }, [activeCam]);

  const savePreset = async () => {
    const name = prompt('Preset name:');
    if (!name || !activeCam) return;
    try {
      await ptzApi.savePreset(activeCam, { name, ...localPTZ });
      loadPresets();
      setLastAction(`Saved: ${name}`);
    } catch (_) {}
  };

  const deletePreset = async (presetId) => {
    if (!activeCam) return;
    try {
      await ptzApi.deletePreset(activeCam, presetId);
      loadPresets();
    } catch (_) {}
  };

  const addCamera = async () => {
    if (!addForm.name || !addForm.ip) return;
    try {
      await ptzApi.addCamera(addForm);
      setShowAddCamera(false);
      setAddForm({ name: '', model: '', ip: '', port: 80, protocol: 'VISCA' });
      loadCameras();
    } catch (_) {}
  };

  const removeCamera = async (id) => {
    if (!confirm('Remove this PTZ camera?')) return;
    try { await ptzApi.deleteCamera(id); loadCameras(); } catch (_) {}
  };

  const testConnection = async (id) => {
    try {
      const res = await ptzApi.testCamera(id);
      setConnectionStatus(prev => ({ ...prev, [id]: res.online ? 'online' : 'offline' }));
      setLastAction(res.online ? 'Connected!' : 'Connection failed');
    } catch (_) {
      setConnectionStatus(prev => ({ ...prev, [id]: 'error' }));
    }
  };

  // ── Phone camera commands via WebSocket ──
  const sendPhoneCmd = (cmd) => {
    if (!cam?.isPhone) return;
    productionSocket.emit('camera-cmd', { deviceId: cam.deviceId, cmd });
  };

  // ── Joystick handling ──
  const handleJoystickStart = useCallback((e) => {
    setJoystickActive(true);
    e.preventDefault();
  }, []);

  const handleJoystickMove = useCallback((e) => {
    if (!joystickActive || !joystickAreaRef.current) return;
    const rect = joystickAreaRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const maxR = rect.width / 2 - 20;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
    const x = dx / maxR;
    const y = dy / maxR;
    setJoystickPos({ x, y });
    
    // Throttle move commands
    if (moveTimerRef.current) return;
    moveTimerRef.current = setTimeout(() => {
      sendMove(x * 2, -y * 2);
      moveTimerRef.current = null;
    }, 60);
  }, [joystickActive, sendMove]);

  const handleJoystickEnd = useCallback(() => {
    setJoystickActive(false);
    setJoystickPos({ x: 0, y: 0 });
    if (moveTimerRef.current) { clearTimeout(moveTimerRef.current); moveTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (joystickActive) {
      window.addEventListener('mousemove', handleJoystickMove);
      window.addEventListener('mouseup', handleJoystickEnd);
      window.addEventListener('touchmove', handleJoystickMove, { passive: false });
      window.addEventListener('touchend', handleJoystickEnd);
      return () => {
        window.removeEventListener('mousemove', handleJoystickMove);
        window.removeEventListener('mouseup', handleJoystickEnd);
        window.removeEventListener('touchmove', handleJoystickMove);
        window.removeEventListener('touchend', handleJoystickEnd);
      };
    }
  }, [joystickActive, handleJoystickMove, handleJoystickEnd]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); sendMove(-1, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); sendMove(1, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sendMove(0, 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); sendMove(0, -1); }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); sendZoom(localPTZ.zoom + 5); }
      if (e.key === '-') { e.preventDefault(); sendZoom(localPTZ.zoom - 5); }
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); goHome(); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && presets[num - 1]) {
        e.preventDefault();
        recallPreset(presets[num - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendMove, sendZoom, goHome, presets, recallPreset, localPTZ.zoom]);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(loadCameras, 15000);
    return () => clearInterval(id);
  }, [loadCameras]);

  const isPhone = cam?.isPhone;
  const protocolBadge = cam?.protocol || 'N/A';

  return (
    <div className="ptz-page">
      {/* ── HEADER ── */}
      <div className="ptz-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎯 PTZ Camera Control
            {isMoving && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse-badge 1s infinite' }} />}
          </h2>
          <p style={{ margin: 0, fontSize: '.75rem', color: 'var(--text-muted)' }}>
            {lastAction || 'Pan · Tilt · Zoom control with presets & live preview'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 200, fontSize: '.78rem' }} value={activeCam || ''} onChange={e => setActiveCam(e.target.value)}>
            {cameras.length === 0 && <option value="">No cameras</option>}
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.isPhone ? '📱' : '📹'} {c.name}</option>
            ))}
          </select>
          <button className="btn btn-xs btn-primary" onClick={() => setShowAddCamera(true)} style={{ whiteSpace: 'nowrap' }}>+ Add IP Camera</button>
          <button className="btn btn-xs btn-outline" onClick={loadCameras} title="Refresh">🔄</button>
        </div>
      </div>

      <div className="ptz-layout">
        {/* ══ LEFT: Camera List ══ */}
        <div className="ptz-cam-list">
          <div className="ptz-cam-list-title">📹 Cameras ({cameras.length})</div>
          {cameras.map(c => {
            const status = c.online || c.isPhone ? (connectionStatus[c.id] || (c.online ? 'online' : 'idle')) : (connectionStatus[c.id] || 'offline');
            const dotColor = status === 'online' ? '#4ade80' : status === 'offline' ? '#ef4444' : c.isPhone && c.online ? '#4ade80' : '#64748b';
            return (
              <div key={c.id} className={`ptz-cam-item ${activeCam === c.id ? 'active' : ''}`} onClick={() => setActiveCam(c.id)}>
                <div className="ptz-cam-dot" style={{ background: dotColor, boxShadow: dotColor === '#4ade80' ? '0 0 6px #4ade80' : 'none' }}></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ptz-cam-name">{c.isPhone ? '📱 ' : ''}{c.name}</div>
                  <div className="ptz-cam-model">{c.model} · {c.protocol}</div>
                </div>
                {!c.isPhone && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); testConnection(c.id); }} title="Test Connection" style={{ padding: '2px 4px', fontSize: '.6rem' }}>🔌</button>
                    <button className="btn btn-xs btn-ghost" onClick={(e) => { e.stopPropagation(); removeCamera(c.id); }} title="Remove" style={{ padding: '2px 4px', fontSize: '.6rem', color: '#ef4444' }}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
          {cameras.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>
              No cameras found.<br/>Add an IP PTZ camera or connect a phone.
            </div>
          )}
        </div>

        {/* ══ CENTER: Preview + Controls ══ */}
        <div className="ptz-center">
          {/* Camera Preview */}
          <div className="ptz-preview">
            <div className="ptz-preview-video" style={{ position: 'relative' }}>
              {/* Live WebRTC video for phone cameras */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: (cam?.isPhone && cam?.online) ? 'block' : 'none',
                  background: '#000',
                }}
              />
              
              {/* Placeholder for IP cameras or offline */}
              {(!cam?.isPhone || !cam?.online) && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.3 }}>
                  <span style={{ fontSize: '3rem' }}>{cam?.isPhone ? '📱' : '📹'}</span>
                  <span style={{ fontSize: '.7rem', color: '#94a3b8' }}>
                    {cam ? (cam.isPhone ? 'Phone camera offline' : `${cam.ip}:${cam.port} · ${cam.protocol}`) : 'Select a camera'}
                  </span>
                </div>
              )}

              {/* Crosshair overlay */}
              <div className="ptz-crosshair" style={{ opacity: 0.5 }}></div>

              {/* Protocol badge */}
              {cam && (
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: '.6rem', fontWeight: 800,
                    background: cam.isPhone ? 'rgba(99,102,241,.2)' : 'rgba(245,158,11,.15)',
                    color: cam.isPhone ? '#818cf8' : '#f59e0b',
                    border: `1px solid ${cam.isPhone ? 'rgba(99,102,241,.3)' : 'rgba(245,158,11,.3)'}`,
                  }}>
                    {protocolBadge}
                  </span>
                  {cam.online && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '.6rem', fontWeight: 800,
                      background: 'rgba(34,197,94,.15)', color: '#4ade80',
                      border: '1px solid rgba(34,197,94,.3)',
                    }}>
                      LIVE
                    </span>
                  )}
                </div>
              )}

              {/* Phone camera battery/signal */}
              {cam?.isPhone && cam.battery >= 0 && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  display: 'flex', gap: 8, alignItems: 'center',
                  fontSize: '.6rem', fontWeight: 700, color: '#94a3b8',
                }}>
                  {cam.signal >= 0 && <span>📶 {cam.signal}%</span>}
                  <span style={{ color: cam.battery < 20 ? '#ef4444' : '#4ade80' }}>
                    🔋 {cam.battery}%
                  </span>
                </div>
              )}
            </div>

            {/* Position telemetry bar */}
            <div className="ptz-pos-overlay" style={{ left: 'auto', right: 8, display: 'flex', gap: 12 }}>
              <span>P: <b>{localPTZ.pan.toFixed(1)}°</b></span>
              <span>T: <b>{localPTZ.tilt.toFixed(1)}°</b></span>
              <span>Z: <b>{localPTZ.zoom}%</b></span>
              <span>F: <b>{autoFocus ? 'AUTO' : localPTZ.focus + '%'}</b></span>
            </div>
          </div>

          {/* Controls Row */}
          <div className="ptz-controls-row">
            {/* Joystick */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="ptz-joystick-area" ref={joystickAreaRef} onMouseDown={handleJoystickStart} onTouchStart={handleJoystickStart}>
                <div className="ptz-joystick-bg" style={{ borderColor: joystickActive ? 'var(--accent)' : 'var(--border)' }}>
                  <div className="ptz-joystick-crosshair-h"></div>
                  <div className="ptz-joystick-crosshair-v"></div>
                  <div className="ptz-joystick-knob" style={{
                    transform: `translate(${joystickPos.x * 50}px, ${joystickPos.y * 50}px)`,
                    background: joystickActive ? '#22c55e' : 'var(--accent)',
                    boxShadow: joystickActive ? '0 0 16px rgba(34,197,94,.5)' : '0 2px 8px rgba(99,102,241,.4)',
                  }}>
                    <div className="ptz-joystick-inner"></div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                {joystickActive ? '🟢 Active' : 'Click & drag'}
              </div>
            </div>

            {/* D-Pad */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div className="ptz-dpad">
                <button className="ptz-dpad-btn ptz-dpad-up" onMouseDown={() => sendMove(0, 1)} title="Tilt Up">▲</button>
                <button className="ptz-dpad-btn ptz-dpad-left" onMouseDown={() => sendMove(-1, 0)} title="Pan Left">◄</button>
                <button className="ptz-dpad-btn ptz-dpad-center" onClick={goHome} title="Home Position" style={{ fontSize: '.65rem', fontWeight: 800 }}>⌂</button>
                <button className="ptz-dpad-btn ptz-dpad-right" onMouseDown={() => sendMove(1, 0)} title="Pan Right">►</button>
                <button className="ptz-dpad-btn ptz-dpad-down" onMouseDown={() => sendMove(0, -1)} title="Tilt Down">▼</button>
              </div>
              {/* Phone-specific buttons */}
              {isPhone && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('flip')} title="Flip Camera">🔄 Flip</button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('torch')} title="Toggle Torch">🔦</button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('mute')} title="Toggle Mute">🔇</button>
                </div>
              )}
            </div>

            {/* Zoom, Focus, Speed Sliders */}
            <div className="ptz-sliders">
              <div className="ptz-slider-group">
                <label>🔍 Zoom</label>
                <input type="range" min="0" max="100" value={localPTZ.zoom} onChange={e => sendZoom(parseInt(e.target.value))} />
                <span>{localPTZ.zoom}%</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-xs btn-outline" style={{ flex: 1 }} onClick={() => sendZoom(localPTZ.zoom - 10)}>Z−</button>
                <button className="btn btn-xs btn-outline" style={{ flex: 1 }} onClick={() => sendZoom(localPTZ.zoom + 10)}>Z+</button>
              </div>
              
              <div className="ptz-slider-group" style={{ marginTop: 4 }}>
                <label>🎯 Focus</label>
                <input type="range" min="0" max="100" value={localPTZ.focus} disabled={autoFocus} onChange={e => sendFocus(parseInt(e.target.value))} />
                <span>{autoFocus ? 'AF' : localPTZ.focus + '%'}</span>
              </div>
              <button className={`btn btn-xs ${autoFocus ? 'btn-primary' : 'btn-outline'}`} onClick={() => {
                const next = !autoFocus;
                setAutoFocus(next);
                if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, next).catch(() => {});
              }} style={{ width: '100%' }}>
                Auto Focus: {autoFocus ? 'ON ✓' : 'OFF'}
              </button>

              <div className="ptz-slider-group" style={{ marginTop: 4 }}>
                <label>⚡ Speed</label>
                <input type="range" min="1" max="10" value={speed} onChange={e => setSpeed(parseInt(e.target.value))} />
                <span>{speed}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Presets ══ */}
        <div className="ptz-presets">
          <div className="ptz-presets-header">
            <span style={{ fontWeight: 700, fontSize: '.82rem' }}>📌 Presets</span>
            <button className="btn btn-xs btn-primary" onClick={savePreset}>+ Save</button>
          </div>
          <div className="ptz-preset-list">
            {presets.length === 0 && (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.7rem' }}>
                No presets yet. Set a position and click "Save".
              </div>
            )}
            {presets.map((p, i) => (
              <div key={p.id} className="ptz-preset-item">
                <button className="ptz-preset-btn" onClick={() => recallPreset(p)}>
                  <span className="ptz-preset-num">{i + 1}</span>
                  <div>
                    <span className="ptz-preset-name">{p.name}</span>
                    <span className="ptz-preset-vals">P:{p.pan}° T:{p.tilt}° Z:{p.zoom}%</span>
                  </div>
                </button>
                <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444', padding: '2px 6px' }} onClick={() => deletePreset(p.id)} title="Delete Preset">✕</button>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 'auto' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Quick Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button className="btn btn-xs btn-outline" onClick={goHome} style={{ fontSize: '.65rem' }}>🏠 Home</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(100)} style={{ fontSize: '.65rem' }}>🔍 Max Zoom</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(0)} style={{ fontSize: '.65rem' }}>🔎 Wide</button>
              <button className="btn btn-xs btn-outline" onClick={() => { setAutoFocus(!autoFocus); if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, !autoFocus).catch(() => {}); }} style={{ fontSize: '.65rem' }}>
                🎯 AF {autoFocus ? 'Off' : 'On'}
              </button>
            </div>
          </div>

          {/* Keyboard shortcuts */}
          <div className="ptz-shortcuts">
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>⌨️ Shortcuts</div>
            <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div>↑ ↓ ← → : Pan/Tilt</div>
              <div>+ / − : Zoom In/Out</div>
              <div>H : Home position</div>
              <div>1-9 : Recall preset</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADD CAMERA MODAL ── */}
      {showAddCamera && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowAddCamera(false); }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, width: 400, maxWidth: '90vw',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>📹 Add IP PTZ Camera</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Camera Name</label>
                <input className="form-input" placeholder="Main Stage PTZ" value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Model</label>
                <input className="form-input" placeholder="PTZ Optics 30x" value={addForm.model} onChange={e => setAddForm(p => ({ ...p, model: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>IP Address</label>
                  <input className="form-input" placeholder="192.168.1.101" value={addForm.ip} onChange={e => setAddForm(p => ({ ...p, ip: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Port</label>
                  <input className="form-input" type="number" value={addForm.port} onChange={e => setAddForm(p => ({ ...p, port: parseInt(e.target.value) || 80 }))} style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Protocol</label>
                <select className="form-input" value={addForm.protocol} onChange={e => setAddForm(p => ({ ...p, protocol: e.target.value }))} style={{ width: '100%' }}>
                  {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={addCamera} style={{ flex: 1 }}>Add Camera</button>
                <button className="btn btn-outline" onClick={() => setShowAddCamera(false)} style={{ flex: 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
