import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ICE_SERVERS } from '../webrtc';

const URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');

export default function Camera() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('connecting');
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [isMuted, setIsMuted] = useState(false);
  const [isTorch, setIsTorch] = useState(false);
  const [resolution, setResolution] = useState('1080p');
  const [battery, setBattery] = useState(-1);
  const [signal, setSignal] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [streaming, setStreaming] = useState(false);
  
  // Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [frameRate, setFrameRate] = useState(30);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [stabilization, setStabilization] = useState('auto');
  
  // Fullscreen & Zoom
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const deviceSocketRef = useRef(null);
  const sigSocketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const timerRef = useRef(null);
  const trackRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> RTCPeerConnection

  const resMap = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '2160p': { width: 3840, height: 2160 },
  };

  // Enumerate cameras
  useEffect(() => {
    const getCams = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevs);
        if (videoDevs.length > 0 && !selectedCameraId) {
          const back = videoDevs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          setSelectedCameraId(back ? back.deviceId : videoDevs[0].deviceId);
        }
      } catch (e) { console.error('Enumerate error', e); }
    };
    getCams();
    navigator.mediaDevices.addEventListener('devicechange', getCams);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getCams);
  }, []);

  // Handle Orientation
  const handleOrientation = async (val) => {
    setOrientation(val);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
         await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock(val);
      }
    } catch (e) {
      console.warn('Orientation lock failed:', e);
    }
  };

  // ── Start camera ──
  const startCamera = async () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const r = resMap[resolution] || resMap['1080p'];
      
      const videoConstraints = {
        width: { ideal: r.width },
        height: { ideal: r.height },
        frameRate: { ideal: frameRate }
      };

      // Add stabilization if supported/requested
      // Note: Not all browsers support this constraint yet, but passing it is safe
      if (stabilization !== 'off') {
        videoConstraints.videoStabilizationMode = { ideal: stabilization };
      }

      if (selectedCameraId) {
        videoConstraints.deviceId = { exact: selectedCameraId };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true,
      });
      streamRef.current = stream;
      trackRef.current = stream.getVideoTracks()[0];
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Check zoom capabilities
      const caps = trackRef.current.getCapabilities();
      if (caps.zoom) {
        setZoomRange({ min: caps.zoom.min || 1, max: caps.zoom.max || 5, step: caps.zoom.step || 0.1 });
        setZoom(caps.zoom.min || 1);
      } else {
        setZoomRange({ min: 1, max: 1, step: 0.1 });
      }

      // Replace tracks on all existing peer connections
      peersRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        stream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) sender.replaceTrack(track);
        });
      });

      return stream;
    } catch (err) {
      console.error('Camera error:', err);
      setStatus('camera-error');
      return null;
    }
  };

  // ── WebRTC: create offer and send to a production viewer ──
  const createPeerConnection = useCallback((peerId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(peerId, pc);

    // Add local camera tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && sigSocketRef.current) {
        sigSocketRef.current.emit('ice-candidate', {
          targetId: peerId,
          candidate: e.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        pc.close();
        peersRef.current.delete(peerId);
        setViewers(peersRef.current.size);
      }
    };

    return pc;
  }, []);

  // When a production viewer joins our room, send them an offer
  const handlePeerJoined = useCallback(async ({ peerId }) => {
    console.log('[Camera] Production viewer joined:', peerId);
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sigSocketRef.current.emit('offer', {
      targetId: peerId,
      sdp: pc.localDescription,
      streamId: deviceId,
    });
    setViewers(peersRef.current.size);
    setStreaming(true);
  }, [createPeerConnection, deviceId]);

  // Handle answer from production viewer
  const handleAnswer = useCallback(async ({ fromId, sdp }) => {
    const pc = peersRef.current.get(fromId);
    if (pc && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }, []);

  // Handle ICE candidate from production viewer
  const handleIceCandidate = useCallback(async ({ fromId, candidate }) => {
    const pc = peersRef.current.get(fromId);
    if (pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
    }
  }, []);

  // When production viewer leaves
  const handlePeerLeft = useCallback(({ peerId }) => {
    const pc = peersRef.current.get(peerId);
    if (pc) { pc.close(); peersRef.current.delete(peerId); }
    setViewers(peersRef.current.size);
    if (peersRef.current.size === 0) setStreaming(false);
  }, []);

  // ── Flip camera ──
  const flipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    setSelectedCameraId(''); // clear specific lens when flipping to front
  };

  // Restart camera when settings change
  useEffect(() => {
    if (status === 'live') {
      startCamera();
    }
  }, [resolution, frameRate, selectedCameraId, facingMode, stabilization]);

  // ── Toggle torch ──
  const toggleTorch = async () => {
    if (!trackRef.current) return;
    try {
      const caps = trackRef.current.getCapabilities();
      if (caps.torch) {
        await trackRef.current.applyConstraints({ advanced: [{ torch: !isTorch }] });
        setIsTorch(t => !t);
      }
    } catch (e) { console.error('Torch error:', e); }
  };

  // ── Toggle mute ──
  const toggleMute = () => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  // ── Zoom Handler ──
  const handleZoom = async (e) => {
    const val = parseFloat(e.target.value);
    setZoom(val);
    if (trackRef.current) {
      try {
        await trackRef.current.applyConstraints({ advanced: [{ zoom: val }] });
      } catch (err) { console.warn('Zoom failed:', err); }
    }
  };

  // ── Fullscreen Toggle ──
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) { console.warn('Fullscreen failed:', e); }
  };

  // ── Battery & Network info ──
  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(b => {
        setBattery(Math.round(b.level * 100));
        b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
      });
    }
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const update = () => setSignal(conn.downlink ? Math.min(100, Math.round(conn.downlink * 10)) : -1);
      update();
      conn.addEventListener('change', update);
    }
  }, []);

  // ── Connect to server ──
  useEffect(() => {
    if (!token) { setStatus('no-token'); return; }

    // 1. Device socket — for pairing & heartbeat
    const devSock = io(`${URL}/devices`, { transports: ['websocket', 'polling'] });
    deviceSocketRef.current = devSock;

    // 2. Signaling socket — for WebRTC
    const sigSock = io(`${URL}/signaling`, { transports: ['websocket', 'polling'] });
    sigSocketRef.current = sigSock;

    devSock.on('connect', () => {
      setStatus('registering');
      devSock.emit('device:register', { pairing_token: token });
    });

    devSock.on('device:registered', async ({ device_id, device_name }) => {
      setDeviceId(device_id);
      setDeviceName(device_name);
      setStatus('live');
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

      // Start camera
      await startCamera();

      // Join signaling room with device ID so production can find us
      sigSock.emit('join-room', { roomId: `camera-${device_id}` });
      console.log(`[Camera] Joined signaling room: camera-${device_id}`);
    });

    devSock.on('device:error', ({ message }) => {
      setStatus('error');
      console.error('Device error:', message);
    });

    devSock.on('disconnect', () => setStatus('disconnected'));

    // Signaling events
    sigSock.on('peer-joined', handlePeerJoined);
    sigSock.on('answer', handleAnswer);
    sigSock.on('ice-candidate', handleIceCandidate);
    sigSock.on('peer-left', handlePeerLeft);

    return () => {
      devSock.disconnect();
      sigSock.disconnect();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
    };
  }, [token]);

  // Re-attach signaling handlers when deviceId changes
  useEffect(() => {
    const sigSock = sigSocketRef.current;
    if (!sigSock || !deviceId) return;
    sigSock.off('peer-joined');
    sigSock.off('answer');
    sigSock.off('ice-candidate');
    sigSock.off('peer-left');
    sigSock.on('peer-joined', handlePeerJoined);
    sigSock.on('answer', handleAnswer);
    sigSock.on('ice-candidate', handleIceCandidate);
    sigSock.on('peer-left', handlePeerLeft);
  }, [deviceId, handlePeerJoined, handleAnswer, handleIceCandidate, handlePeerLeft]);

  // ── Heartbeat every 5s ──
  useEffect(() => {
    if (status !== 'live' || !deviceSocketRef.current) return;
    const send = () => {
      const track = trackRef.current;
      const settings = track ? track.getSettings() : {};
      deviceSocketRef.current.emit('device:heartbeat', {
        battery, signal, temperature: -1,
        resolution: settings.width && settings.height ? `${settings.width}x${settings.height}` : '',
        fps: settings.frameRate ? Math.round(settings.frameRate) : 0,
        bitrate: 0,
        network_type: (navigator.connection?.effectiveType || '').toUpperCase(),
        ip_address: '',
      });
    };
    send();
    heartbeatRef.current = setInterval(send, 5000);
    return () => clearInterval(heartbeatRef.current);
  }, [status, battery, signal]);

  const fmtTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── RENDER ──

  if (status === 'no-token') return (
    <div style={styles.errorPage}>
      <div style={styles.errorIcon}>🔗</div>
      <h2 style={styles.errorTitle}>No Pairing Token</h2>
      <p style={styles.errorText}>Scan the QR code from the Devices tab to connect this phone as a camera.</p>
    </div>
  );

  if (status === 'error') return (
    <div style={styles.errorPage}>
      <div style={styles.errorIcon}>❌</div>
      <h2 style={styles.errorTitle}>Pairing Failed</h2>
      <p style={styles.errorText}>Invalid or expired token. Generate a new QR code from the Devices tab.</p>
    </div>
  );

  if (status === 'camera-error') return (
    <div style={styles.errorPage}>
      <div style={styles.errorIcon}>📷</div>
      <h2 style={styles.errorTitle}>Camera Access Denied</h2>
      <p style={styles.errorText}>Please allow camera and microphone permissions, then refresh.</p>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Camera Feed */}
      <video ref={videoRef} autoPlay playsInline muted style={styles.video} />

      {/* Top HUD */}
      <div style={styles.topHud}>
        <div style={styles.statusBadge}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'live' ? '#22c55e' : '#eab308', animation: status === 'live' ? 'pulse-badge 2s infinite' : 'none' }}></div>
          <span>{status === 'live' ? 'CONNECTED' : status.toUpperCase()}</span>
        </div>
        {deviceName && <span style={styles.deviceLabel}>{deviceName}</span>}
        {streaming && <span style={{ ...styles.statusBadge, background: 'rgba(239,68,68,.6)', border: '1px solid rgba(239,68,68,.4)' }}>🔴 STREAMING · {viewers} viewer{viewers !== 1 ? 's' : ''}</span>}
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {status === 'live' && <span style={styles.timer}>{fmtTime(elapsed)}</span>}
          <button style={styles.fsBtn} onClick={toggleFullscreen}>
            {isFullscreen ? '↙️' : '↗️'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {status === 'live' && (
        <div style={styles.statsBar}>
          <span>🔋 {battery >= 0 ? battery + '%' : '—'}</span>
          <span>📶 {signal >= 0 ? signal + '%' : '—'}</span>
          <span>📐 {resolution}</span>
          <span>🌐 {(navigator.connection?.effectiveType || '—').toUpperCase()}</span>
        </div>
      )}

      {/* Bottom Controls */}
      <div style={styles.controlsArea}>
        
        {/* Zoom Slider */}
        {zoomRange.max > 1 && status === 'live' && (
          <div style={styles.zoomContainer}>
            <span style={styles.zoomLabel}>1x</span>
            <input 
              type="range" 
              min={zoomRange.min} 
              max={zoomRange.max} 
              step={zoomRange.step} 
              value={zoom} 
              onChange={handleZoom} 
              style={styles.zoomSlider} 
            />
            <span style={styles.zoomLabel}>{Math.round(zoomRange.max)}x</span>
          </div>
        )}

        <div style={styles.controls}>
          <button style={styles.controlBtn} onClick={toggleMute}>
          <span style={{ fontSize: '1.5rem' }}>{isMuted ? '🔇' : '🎙️'}</span>
          <span style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button style={styles.controlBtn} onClick={toggleTorch}>
          <span style={{ fontSize: '1.5rem' }}>{isTorch ? '🔦' : '💡'}</span>
          <span style={styles.controlLabel}>{isTorch ? 'Torch Off' : 'Torch'}</span>
        </button>

        <button style={styles.controlBtn} onClick={flipCamera}>
          <span style={{ fontSize: '1.5rem' }}>🔄</span>
          <span style={styles.controlLabel}>Flip</span>
        </button>

        <button style={styles.controlBtn} onClick={() => setShowSettings(true)}>
          <span style={{ fontSize: '1.5rem' }}>⚙️</span>
          <span style={styles.controlLabel}>Settings</span>
        </button>
      </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div style={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
          <div style={styles.settingsModal} onClick={e => e.stopPropagation()}>
            <div style={styles.settingsHeader}>
              <button style={styles.backBtn} onClick={() => setShowSettings(false)}>❮</button>
              <h3 style={styles.settingsTitle}>Camera Settings</h3>
              <div style={{width: 32}}></div>
            </div>

            <div style={styles.settingsBody}>
              {/* Orientation */}
              <div style={styles.settingGroup}>
                <div style={styles.settingLabel}>Orientation</div>
                {['landscape', 'portrait'].map(o => (
                  <div key={o} style={styles.settingRow} onClick={() => handleOrientation(o)}>
                    <span>{o.charAt(0).toUpperCase() + o.slice(1)}</span>
                    {orientation === o && <span style={styles.checkIcon}>✓</span>}
                  </div>
                ))}
              </div>

              {/* Resolution */}
              <div style={styles.settingGroup}>
                <div style={styles.settingLabel}>Resolution</div>
                {['2160p', '1080p', '720p', '480p'].map(r => (
                  <div key={r} style={styles.settingRow} onClick={() => setResolution(r)}>
                    <span>{resMap[r].width}x{resMap[r].height} ({r})</span>
                    {resolution === r && <span style={styles.checkIcon}>✓</span>}
                  </div>
                ))}
              </div>

              {/* Frame Rate */}
              <div style={styles.settingGroup}>
                <div style={styles.settingLabel}>Frame rate</div>
                {[15, 24, 25, 30, 50, 60].map(fps => (
                  <div key={fps} style={styles.settingRow} onClick={() => setFrameRate(fps)}>
                    <span>{fps} fps</span>
                    {frameRate === fps && <span style={styles.checkIcon}>✓</span>}
                  </div>
                ))}
              </div>

              {/* Stabilization */}
              <div style={styles.settingGroup}>
                <div style={styles.settingLabel}>Stabilization</div>
                {['off', 'auto', 'standard', 'cinematic'].map(mode => (
                  <div key={mode} style={styles.settingRow} onClick={() => setStabilization(mode)}>
                    <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                    {stabilization === mode && <span style={styles.checkIcon}>✓</span>}
                  </div>
                ))}
              </div>

              {/* Camera Lens */}
              {cameras.length > 0 && (
                <div style={styles.settingGroup}>
                  <div style={styles.settingLabel}>Camera lens</div>
                  {cameras.map((cam, idx) => (
                    <div key={cam.deviceId} style={styles.settingRow} onClick={() => setSelectedCameraId(cam.deviceId)}>
                      <span>{cam.label || `Camera ${idx + 1}`}</span>
                      {selectedCameraId === cam.deviceId && <span style={styles.checkIcon}>✓</span>}
                    </div>
                  ))}
                  <div style={styles.settingRow} onClick={() => setSelectedCameraId('')}>
                    <span>Auto (Default)</span>
                    {!selectedCameraId && <span style={styles.checkIcon}>✓</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' },
  video: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  topHud: { position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg, rgba(0,0,0,.7), transparent)', zIndex: 10, flexWrap: 'wrap' },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.6)', padding: '4px 12px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'system-ui, sans-serif', border: '1px solid rgba(255,255,255,.1)' },
  deviceLabel: { color: '#f8fafc', fontSize: '.85rem', fontWeight: 600, fontFamily: 'system-ui, sans-serif' },
  timer: { color: '#ef4444', fontSize: '.85rem', fontWeight: 700, fontFamily: 'Consolas, monospace', background: 'rgba(0,0,0,.6)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(239,68,68,.3)' },
  fsBtn: { background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: '1rem' },
  statsBar: { position: 'absolute', top: 52, left: 0, right: 0, padding: '4px 16px', display: 'flex', gap: 16, fontSize: '.7rem', color: '#94a3b8', fontFamily: 'system-ui, sans-serif', zIndex: 10 },
  
  controlsArea: { position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(0deg, rgba(0,0,0,.8), transparent)', zIndex: 10, paddingBottom: 16 },
  zoomContainer: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 32px', width: '100%', boxSizing: 'border-box' },
  zoomLabel: { color: '#fff', fontSize: '.75rem', fontWeight: 600, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 2px #000' },
  zoomSlider: { flex: 1, accentColor: '#3b82f6', height: 4 },
  
  controls: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', width: '100%', padding: '0 16px', boxSizing: 'border-box', marginTop: 8 },
  controlBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 16, padding: '12px 20px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(8px)' },
  controlLabel: { fontSize: '.65rem', color: '#cbd5e1', fontWeight: 600, fontFamily: 'system-ui, sans-serif' },

  errorPage: { position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: 'system-ui, sans-serif' },
  errorIcon: { fontSize: '4rem', marginBottom: 16 },
  errorTitle: { color: '#f8fafc', fontSize: '1.5rem', margin: '0 0 8px', textAlign: 'center' },
  errorText: { color: '#94a3b8', fontSize: '.9rem', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 },
  
  // Settings UI
  settingsOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' },
  settingsModal: { background: '#111', width: '100%', maxHeight: '85vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' },
  settingsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #222' },
  backBtn: { background: '#222', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem' },
  settingsTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 600 },
  settingsBody: { padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 },
  settingGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  settingLabel: { fontSize: '.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 8, fontWeight: 600 },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1c1c1e', borderRadius: 12, cursor: 'pointer', fontSize: '1rem' },
  checkIcon: { color: '#3b82f6', fontWeight: 'bold', fontSize: '1.2rem' }
};
