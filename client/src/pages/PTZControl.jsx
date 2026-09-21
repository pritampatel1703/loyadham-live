import { useState, useRef, useCallback, useEffect } from 'react';
import { ptzApi, devicesApi } from '../api/client';
import { productionSocket, signalingSocket } from '../socket';
import { getIceConfig } from '../webrtc';

/* ═══════════════════════════════════════════════════════════
   PTZ CAMERA CONTROL — Broadcast Pan/Tilt/Zoom Controller
   Supports: Live WebRTC Phone Cameras, PGM Relay, Local Webcam,
             and IP PTZ Cameras (VISCA/ONVIF/CGI/NDI)
   ═══════════════════════════════════════════════════════════ */

const PROTOCOLS = ['VISCA', 'VISCA-over-IP', 'ONVIF', 'CGI', 'NDI'];

export default function PTZControl() {
  const [cameras, setCameras] = useState([]);
  const [activeCam, setActiveCam] = useState(null);
  const [videoSource, setVideoSource] = useState('camera'); // 'camera' | 'pgm' | 'webcam'
  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [digitalPTZ, setDigitalPTZ] = useState(false);
  const [videoFit, setVideoFit] = useState('contain'); // 'contain' | 'cover'
  const [presets, setPresets] = useState([]);
  const [speed, setSpeed] = useState(5);
  const [autoFocus, setAutoFocus] = useState(true);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', model: '', ip: '', port: 80, protocol: 'VISCA', streamUrl: '' });
  const [connectionStatus, setConnectionStatus] = useState({});
  const [isMoving, setIsMoving] = useState(false);
  const [lastAction, setLastAction] = useState('');
  const [localPTZ, setLocalPTZ] = useState({ pan: 0, tilt: 0, zoom: 50, focus: 50 });
  const [tally, setTally] = useState('off'); // 'pgm' | 'pvw' | 'off'
  const [telemetry, setTelemetry] = useState({ resolution: '', fps: 0, bitrate: 0, battery: -1, signal: -1 });
  const [connectingMsg, setConnectingMsg] = useState('Initializing video feed...');
  const [shortcutFeedback, setShortcutFeedback] = useState(null);
  const [activeKeyHighlight, setActiveKeyHighlight] = useState(null);

  // Refs
  const joystickAreaRef = useRef(null);
  const moveTimerRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const iceQueueRef = useRef([]);
  const webcamStreamRef = useRef(null);
  const retryTimerRef = useRef(null);
  const activeCamRef = useRef(null);
  const videoSourceRef = useRef(videoSource);
  const localPTZRef = useRef(localPTZ);
  const speedRef = useRef(speed);
  const presetsRef = useRef(presets);
  const feedbackTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);

  activeCamRef.current = activeCam;
  videoSourceRef.current = videoSource;
  localPTZRef.current = localPTZ;
  speedRef.current = speed;
  presetsRef.current = presets;

  const setShortcutBadge = (text, keyType) => {
    setShortcutFeedback(text);
    if (keyType) {
      setActiveKeyHighlight(keyType);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setActiveKeyHighlight(null), 250);
    }
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setShortcutFeedback(null);
    }, 1200);
  };

  const cam = cameras.find(c => c.id === activeCam) || cameras[0];

  // ── Load cameras from server ──
  const loadCameras = useCallback(async () => {
    try {
      const res = await ptzApi.cameras();
      if (res.cameras && res.cameras.length > 0) {
        setCameras(res.cameras);
        // Default to first camera if none selected, prioritizing online or phone cameras
        if (!activeCamRef.current) {
          const preferred = res.cameras.find(c => c.online) || res.cameras.find(c => c.isPhone) || res.cameras[0];
          setActiveCam(preferred.id);
        }
      }
    } catch (err) {
      console.error('[PTZ] Load cameras error:', err);
    }
  }, []);

  // ── Load presets for active camera ──
  const loadPresets = useCallback(async (camId) => {
    const id = camId || activeCam;
    if (!id) return;
    try {
      const res = await ptzApi.presets(id);
      setPresets(res.presets || []);
    } catch (_) {
      setPresets([]);
    }
  }, [activeCam]);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  useEffect(() => {
    if (activeCam) {
      loadPresets(activeCam);
      const current = cameras.find(c => c.id === activeCam);
      if (current) {
        setLocalPTZ({
          pan: current.pan || 0,
          tilt: current.tilt || 0,
          zoom: current.zoom !== undefined ? current.zoom : 50,
          focus: current.focus !== undefined ? current.focus : 50
        });
        setTelemetry({
          resolution: current.resolution || '1080p',
          fps: current.fps || 30,
          bitrate: current.bitrate || 0,
          battery: current.battery !== undefined ? current.battery : -1,
          signal: current.signal !== undefined ? current.signal : -1,
        });
      }
    }
  }, [activeCam, cameras, loadPresets]);

  // ── Cleanup current video connection ──
  const cleanupStream = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (peerConnRef.current) {
      try { peerConnRef.current.close(); } catch (_) {}
      peerConnRef.current = null;
    }
    if (webcamStreamRef.current) {
      try {
        webcamStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (_) {}
      webcamStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    iceQueueRef.current = [];
    setHasLiveVideo(false);
  }, []);

  // ── Helper: Attach stream to video element ──
  const attachLiveStream = useCallback((stream) => {
    if (!stream) return;
    remoteStreamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = isMuted;
      videoRef.current.play().then(() => {
        setHasLiveVideo(true);
      }).catch(err => {
        console.warn('[PTZ] Autoplay error, muting video:', err);
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
          setHasLiveVideo(true);
        }
      });
    }
  }, [isMuted]);

  // ── WebRTC connection engine (Camera or PGM) ──
  useEffect(() => {
    cleanupStream();

    // 1. Local Webcam Mode
    if (videoSource === 'webcam') {
      setConnectingMsg('Requesting camera access...');
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
        .then(stream => {
          webcamStreamRef.current = stream;
          attachLiveStream(stream);
          setConnectingMsg('');
        })
        .catch(err => {
          console.error('[PTZ] Local webcam error:', err);
          setConnectingMsg('Camera access denied or unavailable');
        });
      return cleanupStream;
    }

    // 2. WebRTC Stream: Camera Feed or PGM Master
    const targetRoom = videoSource === 'pgm' ? 'pgm-master' : (cam?.deviceId ? `camera-${cam.deviceId}` : null);
    const targetStreamId = videoSource === 'pgm' ? 'pgm-master' : cam?.deviceId;

    if (!targetRoom && videoSource === 'camera' && (!cam || !cam.isPhone)) {
      setConnectingMsg(cam ? `IP Camera: ${cam.ip}:${cam.port}` : 'No camera selected');
      return cleanupStream;
    }

    setConnectingMsg(`Connecting to ${videoSource === 'pgm' ? 'PGM Master' : (cam?.name || 'Camera')}...`);

    signalingSocket.connect();
    signalingSocket.emit('join-room', { roomId: targetRoom });
    signalingSocket.emit('request-offer', { roomId: targetRoom });

    // Periodically re-request offer until stream is active
    retryTimerRef.current = setInterval(() => {
      if (!remoteStreamRef.current || remoteStreamRef.current.getVideoTracks().length === 0) {
        if (signalingSocket.connected && targetRoom) {
          signalingSocket.emit('request-offer', { roomId: targetRoom });
        }
      }
    }, 2500);

    // Incoming WebRTC Offer Handler
    const handleOffer = async ({ fromId, sdp, streamId }) => {
      // Validate stream matches current target
      if (videoSourceRef.current === 'pgm') {
        if (streamId && streamId !== 'pgm-master') return;
      } else if (cam?.deviceId) {
        if (streamId && streamId !== cam.deviceId && streamId !== `camera-${cam.deviceId}`) return;
      }

      try {
        if (peerConnRef.current) {
          try { peerConnRef.current.close(); } catch (_) {}
        }

        const iceConfig = await getIceConfig();
        const pc = new RTCPeerConnection(iceConfig);
        peerConnRef.current = pc;

        pc.ontrack = (e) => {
          const stream = e.streams[0] || new MediaStream();
          if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
          attachLiveStream(stream);

          if (e.track.kind === 'video') {
            e.track.onunmute = () => {
              attachLiveStream(stream);
              setHasLiveVideo(true);
            };
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            signalingSocket.emit('ice-candidate', {
              targetId: fromId,
              candidate: e.candidate,
              streamId: targetStreamId,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setConnectingMsg('');
          } else if (['failed', 'disconnected'].includes(pc.connectionState)) {
            setHasLiveVideo(false);
            setConnectingMsg('Reconnecting feed...');
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });

        // Flush queued ICE candidates
        if (iceQueueRef.current.length > 0) {
          iceQueueRef.current.forEach(c => {
            pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          });
          iceQueueRef.current = [];
        }
      } catch (err) {
        console.error('[PTZ] WebRTC setup error:', err);
      }
    };

    // Incoming ICE Candidates
    const handleIceCandidate = ({ candidate }) => {
      if (!candidate) return;
      if (peerConnRef.current && peerConnRef.current.remoteDescription) {
        peerConnRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        iceQueueRef.current.push(candidate);
      }
    };

    // Peer joined or room peers
    const handlePeerJoined = ({ peerId }) => {
      signalingSocket.emit('request-offer', { targetId: peerId, roomId: targetRoom });
    };

    signalingSocket.on('offer', handleOffer);
    signalingSocket.on('ice-candidate', handleIceCandidate);
    signalingSocket.on('peer-joined', handlePeerJoined);

    return () => {
      signalingSocket.off('offer', handleOffer);
      signalingSocket.off('ice-candidate', handleIceCandidate);
      signalingSocket.off('peer-joined', handlePeerJoined);
      cleanupStream();
    };
  }, [videoSource, cam?.id, cam?.deviceId, cam?.isPhone, cleanupStream, attachLiveStream]);

  // ── Socket & Tally Listeners ──
  useEffect(() => {
    productionSocket.connect();

    const onHeartbeat = (data) => {
      if (cam && data.device_id === cam.deviceId) {
        setTelemetry(prev => ({
          ...prev,
          battery: data.battery !== undefined ? data.battery : prev.battery,
          signal: data.signal !== undefined ? data.signal : prev.signal,
          fps: data.fps || prev.fps,
          bitrate: data.bitrate || prev.bitrate,
          resolution: data.resolution || prev.resolution,
        }));
      }
    };

    const onTallyUpdate = ({ pgmId, pvwId }) => {
      if (!cam) return;
      if (pgmId === cam.deviceId || pgmId === cam.id) setTally('pgm');
      else if (pvwId === cam.deviceId || pvwId === cam.id) setTally('pvw');
      else setTally('off');
    };

    const onDeviceOnline = () => loadCameras();
    const onDeviceOffline = () => loadCameras();

    productionSocket.on('device:heartbeat', onHeartbeat);
    productionSocket.on('tally-update', onTallyUpdate);
    productionSocket.on('device:online', onDeviceOnline);
    productionSocket.on('device:offline', onDeviceOffline);

    return () => {
      productionSocket.off('device:heartbeat', onHeartbeat);
      productionSocket.off('tally-update', onTallyUpdate);
      productionSocket.off('device:online', onDeviceOnline);
      productionSocket.off('device:offline', onDeviceOffline);
    };
  }, [cam, loadCameras]);

  // ── PTZ Actions: Pan/Tilt ──
  const sendMove = useCallback(async (dpan, dtilt) => {
    const camId = activeCamRef.current;
    if (!camId) return;
    const spd = speedRef.current;
    const current = localPTZRef.current || { pan: 0, tilt: 0, zoom: 50, focus: 50 };
    const newPan = Math.max(-180, Math.min(180, Math.round((current.pan + dpan * spd) * 10) / 10));
    const newTilt = Math.max(-90, Math.min(90, Math.round((current.tilt + dtilt * spd) * 10) / 10));
    localPTZRef.current = { ...current, pan: newPan, tilt: newTilt };
    setLocalPTZ(prev => ({ ...prev, pan: newPan, tilt: newTilt }));
    setIsMoving(true);
    setLastAction(`Pan: ${newPan.toFixed(1)}° · Tilt: ${newTilt.toFixed(1)}°`);

    try {
      await ptzApi.move(camId, newPan, newTilt, spd);
    } catch (err) {
      console.error('[PTZ] Move error:', err);
    }

    setTimeout(() => setIsMoving(false), 250);
  }, []);

  // ── PTZ Actions: Zoom ──
  const sendZoom = useCallback(async (newZoom) => {
    const camId = activeCamRef.current;
    if (!camId) return;
    const z = Math.max(0, Math.min(100, Math.round(newZoom)));
    localPTZRef.current = { ...localPTZRef.current, zoom: z };
    setLocalPTZ(prev => ({ ...prev, zoom: z }));
    setLastAction(`Zoom: ${z}%`);
    try {
      await ptzApi.zoom(camId, z);
    } catch (err) {
      console.error('[PTZ] Zoom error:', err);
    }
  }, []);

  // ── PTZ Actions: Focus ──
  const sendFocus = useCallback(async (newFocus) => {
    const camId = activeCamRef.current;
    if (!camId) return;
    const f = Math.max(0, Math.min(100, Math.round(newFocus)));
    localPTZRef.current = { ...localPTZRef.current, focus: f };
    setLocalPTZ(prev => ({ ...prev, focus: f }));
    setLastAction(`Focus: ${f}%`);
    try {
      await ptzApi.focus(camId, f, autoFocus);
    } catch (err) {
      console.error('[PTZ] Focus error:', err);
    }
  }, [autoFocus]);

  // ── PTZ Actions: Home ──
  const goHome = useCallback(async () => {
    const camId = activeCamRef.current;
    if (!camId) return;
    localPTZRef.current = { ...localPTZRef.current, pan: 0, tilt: 0, zoom: 50 };
    setLocalPTZ(prev => ({ ...prev, pan: 0, tilt: 0, zoom: 50 }));
    setLastAction('Reset Home Position');
    try {
      await ptzApi.home(camId);
    } catch (err) {
      console.error('[PTZ] Home error:', err);
    }
  }, []);

  // ── Presets ──
  const savePreset = async () => {
    const camId = activeCamRef.current;
    if (!camId) return;
    const name = prompt('Preset Name:', `Shot ${(presetsRef.current?.length || 0) + 1}`);
    if (!name) return;
    try {
      const cur = localPTZRef.current;
      const res = await ptzApi.savePreset(camId, name, cur.pan, cur.tilt, cur.zoom, cur.focus);
      if (res.preset) {
        setPresets(prev => [...prev, res.preset]);
        setLastAction(`Saved preset: "${name}"`);
        setShortcutBadge(`💾 Saved Preset "${name}"`);
      }
    } catch (err) {
      console.error('[PTZ] Save preset error:', err);
    }
  };

  const recallPreset = useCallback(async (preset) => {
    const camId = activeCamRef.current;
    if (!camId || !preset) return;
    localPTZRef.current = {
      ...localPTZRef.current,
      pan: preset.pan,
      tilt: preset.tilt,
      zoom: preset.zoom,
      focus: preset.focus !== undefined ? preset.focus : 50,
    };
    setLocalPTZ({ pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom, focus: preset.focus !== undefined ? preset.focus : 50 });
    setLastAction(`Recalled preset: "${preset.name}"`);
    try {
      await ptzApi.recallPreset(camId, preset.id);
    } catch (err) {
      console.error('[PTZ] Recall error:', err);
    }
  }, []);

  const deletePreset = async (presetId) => {
    const camId = activeCamRef.current;
    if (!camId) return;
    try {
      await ptzApi.deletePreset(camId, presetId);
      setPresets(prev => prev.filter(p => p.id !== presetId));
    } catch (err) {
      console.error('[PTZ] Delete preset error:', err);
    }
  };

  // ── Phone Remote Control Actions ──
  const sendPhoneCmd = async (cmd) => {
    if (!activeCam) return;
    setLastAction(`Phone Action: ${cmd}`);
    try {
      await ptzApi.action(activeCam, cmd);
    } catch (err) {
      console.error('[PTZ] Phone action error:', err);
    }
  };

  // ── Joystick Handlers ──
  const handleJoystickStart = (e) => {
    e.preventDefault();
    setJoystickActive(true);
    const rect = joystickAreaRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const onMove = (moveEvt) => {
      const clientX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const clientY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
      const dx = (clientX - centerX) / (rect.width / 2);
      const dy = (clientY - centerY) / (rect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(1, dist);
      const angle = Math.atan2(dy, dx);
      const normX = Math.cos(angle) * clampedDist;
      const normY = Math.sin(angle) * clampedDist;
      setJoystickPos({ x: normX, y: normY });

      if (!moveTimerRef.current) {
        moveTimerRef.current = setTimeout(() => {
          sendMove(normX * 2, -normY * 2);
          moveTimerRef.current = null;
        }, 80);
      }
    };

    const onEnd = () => {
      setJoystickActive(false);
      setJoystickPos({ x: 0, y: 0 });
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
        moveTimerRef.current = null;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  // ── Snapshot Capture ──
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const v = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `ptz-snap-${cam?.name || 'camera'}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setLastAction('📸 Snapshot captured');
    } catch (err) {
      console.warn('Snapshot error:', err);
    }
  };

  // ── Fullscreen Toggle ──
  const toggleFullscreen = () => {
    const el = document.getElementById('ptz-video-container');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ── Test Connection for IP camera ──
  const testConnection = async (camId) => {
    setConnectionStatus(prev => ({ ...prev, [camId]: 'testing' }));
    try {
      const res = await ptzApi.test(camId);
      setConnectionStatus(prev => ({ ...prev, [camId]: res.online ? 'online' : 'offline' }));
      setLastAction(res.online ? `Camera ${camId} online` : `Camera ${camId} offline`);
    } catch (_) {
      setConnectionStatus(prev => ({ ...prev, [camId]: 'offline' }));
    }
  };

  // ── Add Camera ──
  const addCamera = async () => {
    if (!addForm.name || !addForm.ip) return;
    try {
      const res = await ptzApi.addCamera(addForm);
      if (res.camera) {
        setCameras(prev => [...prev, res.camera]);
        setActiveCam(res.camera.id);
        setShowAddCamera(false);
        setAddForm({ name: '', model: '', ip: '', port: 80, protocol: 'VISCA', streamUrl: '' });
      }
    } catch (err) {
      alert('Failed to add camera: ' + err.message);
    }
  };

  // ── Remove Camera ──
  const removeCamera = async (camId) => {
    if (!confirm('Remove this camera?')) return;
    try {
      await ptzApi.removeCamera(camId);
      setCameras(prev => prev.filter(c => c.id !== camId));
      if (activeCam === camId) {
        const remaining = cameras.filter(c => c.id !== camId);
        setActiveCam(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('[PTZ] Remove error:', err);
    }
  };

  // ── Keyboard Shortcuts (Capture Phase & Ref-driven) ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept when user is typing in a text input or textarea
      const tag = e.target.tagName?.toLowerCase();
      const isTextInput = tag === 'textarea' || (tag === 'input' && ['text', 'password', 'search', 'email', 'number'].includes(e.target.type));
      if (isTextInput) return;

      const key = e.key;
      const code = e.code || '';

      // Pan & Tilt: Arrow keys or WASD
      if (key === 'ArrowUp' || code === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault();
        e.stopPropagation();
        sendMove(0, 1);
        setShortcutBadge('▲ Tilt Up', 'up');
        return;
      }
      if (key === 'ArrowDown' || code === 'ArrowDown' || key === 's' || key === 'S') {
        e.preventDefault();
        e.stopPropagation();
        sendMove(0, -1);
        setShortcutBadge('▼ Tilt Down', 'down');
        return;
      }
      if (key === 'ArrowLeft' || code === 'ArrowLeft' || key === 'a' || key === 'A') {
        e.preventDefault();
        e.stopPropagation();
        sendMove(-1, 0);
        setShortcutBadge('◄ Pan Left', 'left');
        return;
      }
      if (key === 'ArrowRight' || code === 'ArrowRight' || key === 'd' || key === 'D') {
        e.preventDefault();
        e.stopPropagation();
        sendMove(1, 0);
        setShortcutBadge('► Pan Right', 'right');
        return;
      }

      // Zoom In: + / = / NumpadAdd / E
      if (key === '+' || key === '=' || code === 'NumpadAdd' || code === 'Equal' || key === 'e' || key === 'E') {
        e.preventDefault();
        e.stopPropagation();
        const currentZ = localPTZRef.current?.zoom !== undefined ? localPTZRef.current.zoom : 50;
        const nextZ = Math.min(100, currentZ + 5);
        sendZoom(nextZ);
        setShortcutBadge(`🔍 Zoom In: ${nextZ}%`, 'zoom-in');
        return;
      }

      // Zoom Out: - / _ / NumpadSubtract / Minus / Q
      if (key === '-' || key === '_' || code === 'NumpadSubtract' || code === 'Minus' || key === 'q' || key === 'Q') {
        e.preventDefault();
        e.stopPropagation();
        const currentZ = localPTZRef.current?.zoom !== undefined ? localPTZRef.current.zoom : 50;
        const nextZ = Math.max(0, currentZ - 5);
        sendZoom(nextZ);
        setShortcutBadge(`🔎 Zoom Out: ${nextZ}%`, 'zoom-out');
        return;
      }

      // Home Position: H or Home
      if (key === 'h' || key === 'H' || code === 'KeyH' || code === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        goHome();
        setShortcutBadge('🏠 Reset Home', 'home');
        return;
      }

      // Presets: 1 to 9 (top number row or numpad)
      let presetNum = null;
      if (key >= '1' && key <= '9') {
        presetNum = parseInt(key, 10);
      } else if (code.startsWith('Numpad') && code.length === 7) {
        const d = parseInt(code.replace('Numpad', ''), 10);
        if (d >= 1 && d <= 9) presetNum = d;
      } else if (code.startsWith('Digit')) {
        const d = parseInt(code.replace('Digit', ''), 10);
        if (d >= 1 && d <= 9) presetNum = d;
      }

      if (presetNum !== null) {
        e.preventDefault();
        e.stopPropagation();
        const list = presetsRef.current || [];
        const targetPreset = list[presetNum - 1];
        if (targetPreset) {
          recallPreset(targetPreset);
          setShortcutBadge(`🎯 Preset ${presetNum}: "${targetPreset.name}"`, `preset-${presetNum}`);
        } else {
          setShortcutBadge(`⚠️ Preset ${presetNum} empty`, `preset-${presetNum}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [sendMove, sendZoom, goHome, recallPreset]);

  // Digital pan/zoom preview style calculation
  const zoomFactor = digitalPTZ ? 1 + (localPTZ.zoom / 100) * 1.5 : 1;
  const panShiftX = digitalPTZ ? (localPTZ.pan / 180) * 20 : 0;
  const panShiftY = digitalPTZ ? (-localPTZ.tilt / 90) * 20 : 0;

  const isPhone = cam?.isPhone;
  const protocolBadge = videoSource === 'pgm' ? 'PGM MASTER' : videoSource === 'webcam' ? 'LOCAL WEBCAM' : (cam?.protocol || 'WebRTC');

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
            {lastAction || 'Pan · Tilt · Zoom controller with real-time video feed & presets'}
          </p>
        </div>

        {/* Source Selector Pills & Quick Switch */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,.05)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
            <button
              className={`btn btn-xs ${videoSource === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVideoSource('camera')}
              style={{ fontSize: '.72rem', padding: '3px 8px' }}
              title="Direct Camera Feed"
            >
              📱 Camera Feed
            </button>
            <button
              className={`btn btn-xs ${videoSource === 'pgm' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVideoSource('pgm')}
              style={{ fontSize: '.72rem', padding: '3px 8px' }}
              title="Program Master Output"
            >
              🔴 PGM Output
            </button>
            <button
              className={`btn btn-xs ${videoSource === 'webcam' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVideoSource('webcam')}
              style={{ fontSize: '.72rem', padding: '3px 8px' }}
              title="Local PC Webcam"
            >
              💻 PC Webcam
            </button>
          </div>

          <select
            className="form-input"
            style={{ width: 190, fontSize: '.78rem' }}
            value={activeCam || ''}
            onChange={e => {
              setActiveCam(e.target.value);
              setVideoSource('camera');
              e.target.blur();
            }}
          >
            {cameras.length === 0 && <option value="">No cameras registered</option>}
            {cameras.map(c => (
              <option key={c.id} value={c.id}>
                {c.isPhone ? '📱' : '📹'} {c.name} {c.online ? '(Live)' : ''}
              </option>
            ))}
          </select>

          <button className="btn btn-xs btn-primary" onClick={() => setShowAddCamera(true)} style={{ whiteSpace: 'nowrap' }}>
            + Add IP Camera
          </button>
          <button className="btn btn-xs btn-outline" onClick={loadCameras} title="Refresh Device List">
            🔄
          </button>
        </div>
      </div>

      <div className="ptz-layout">
        {/* ══ LEFT: Camera List ══ */}
        <div className="ptz-cam-list">
          <div className="ptz-cam-list-title">
            📹 Studio Cameras ({cameras.length})
          </div>
          {cameras.map(c => {
            const isSelected = activeCam === c.id;
            const isOnline = c.online || (c.isPhone && hasLiveVideo && isSelected);
            const dotColor = isOnline ? '#4ade80' : '#64748b';

            return (
              <div
                key={c.id}
                className={`ptz-cam-item ${isSelected ? 'active' : ''}`}
                onClick={() => { setActiveCam(c.id); setVideoSource('camera'); }}
              >
                <div
                  className="ptz-cam-dot"
                  style={{
                    background: dotColor,
                    boxShadow: isOnline ? '0 0 8px #4ade80' : 'none'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ptz-cam-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{c.isPhone ? '📱' : '📹'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  </div>
                  <div className="ptz-cam-model">
                    {c.model} · {c.protocol}
                  </div>
                </div>

                {!c.isPhone && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={(e) => { e.stopPropagation(); testConnection(c.id); }}
                      title="Test Connection"
                      style={{ padding: '2px 4px', fontSize: '.6rem' }}
                    >
                      🔌
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={(e) => { e.stopPropagation(); removeCamera(c.id); }}
                      title="Remove"
                      style={{ padding: '2px 4px', fontSize: '.6rem', color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {cameras.length === 0 && (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>
              No cameras found.<br/>
              Open the Camera App on your phone or click "+ Add IP Camera".
            </div>
          )}

          {/* Direct Camera Links */}
          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
              📱 Mobile Connections
            </div>
            <a
              href="/camera"
              target="_blank"
              rel="noreferrer"
              className="btn btn-xs btn-outline"
              style={{ width: '100%', fontSize: '.65rem', textAlign: 'center', display: 'block', textDecoration: 'none' }}
            >
              Open Camera App ↗
            </a>
          </div>
        </div>

        {/* ══ CENTER: Live Video Preview + Controls ══ */}
        <div className="ptz-center">
          {/* Camera Preview Box */}
          <div className="ptz-preview" id="ptz-video-container">
            <div className="ptz-preview-video" style={{ position: 'relative', overflow: 'hidden', background: '#020617' }}>
              {/* Live Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                onPlaying={() => setHasLiveVideo(true)}
                onLoadedMetadata={() => setHasLiveVideo(true)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: videoFit,
                  display: hasLiveVideo ? 'block' : 'none',
                  background: '#000',
                  transform: `scale(${zoomFactor}) translate(${panShiftX}%, ${panShiftY}%)`,
                  transformOrigin: 'center center',
                  transition: isMoving ? 'none' : 'transform 0.15s ease-out',
                }}
              />

              {/* Offline / Connecting Broadcast Fallback Screen */}
              {!hasLiveVideo && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  padding: 24,
                  textAlign: 'center',
                  zIndex: 2,
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(99,102,241,.15)',
                    border: '2px solid rgba(99,102,241,.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem',
                    animation: 'pulse 2s infinite',
                  }}>
                    {videoSource === 'pgm' ? '🔴' : videoSource === 'webcam' ? '💻' : '📹'}
                  </div>

                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                      {videoSource === 'pgm' ? 'PGM Master Stream' : videoSource === 'webcam' ? 'Local PC Webcam' : (cam?.name || 'Selected Camera')}
                    </div>
                    <div style={{ fontSize: '.75rem', color: '#94a3b8', marginTop: 4 }}>
                      {connectingMsg || 'Waiting for live video feed...'}
                    </div>
                  </div>

                  {/* Fallback Action Buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={() => {
                        cleanupStream();
                        setHasLiveVideo(false);
                        const targetRoom = videoSource === 'pgm' ? 'pgm-master' : (cam?.deviceId ? `camera-${cam.deviceId}` : null);
                        if (targetRoom) signalingSocket.emit('request-offer', { roomId: targetRoom });
                      }}
                      style={{ fontSize: '.7rem' }}
                    >
                      🔄 Retry Connection
                    </button>
                    {videoSource !== 'pgm' && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => setVideoSource('pgm')}
                        style={{ fontSize: '.7rem' }}
                      >
                        🔴 View PGM Master
                      </button>
                    )}
                    {videoSource !== 'webcam' && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => setVideoSource('webcam')}
                        style={{ fontSize: '.7rem' }}
                      >
                        💻 Use PC Webcam
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Crosshair Overlay */}
              {showCrosshair && (
                <div className="ptz-crosshair" style={{ opacity: 0.65, pointerEvents: 'none' }} />
              )}

              {/* 3x3 Grid Overlay */}
              {showGrid && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr',
                  border: '1px solid rgba(255,255,255,.15)',
                }}>
                  {[...Array(9)].map((_, i) => (
                    <div key={i} style={{ border: '1px solid rgba(255,255,255,.12)' }} />
                  ))}
                </div>
              )}

              {/* 16:9 Safe Area Margins */}
              {showSafeAreas && (
                <div style={{
                  position: 'absolute', inset: '5%', pointerEvents: 'none',
                  border: '1px dashed rgba(245,158,11,.4)',
                  borderRadius: 4,
                }}>
                  <div style={{
                    position: 'absolute', inset: '5%',
                    border: '1px dashed rgba(34,197,94,.35)',
                  }} />
                </div>
              )}

              {/* Active Keyboard Shortcut Feedback Toast */}
              {shortcutFeedback && (
                <div style={{
                  position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,23,42,.95)', border: '2px solid #818cf8',
                  borderRadius: 8, padding: '8px 18px', color: '#fff',
                  fontSize: '.95rem', fontWeight: 800,
                  boxShadow: '0 8px 30px rgba(0,0,0,.9), 0 0 16px rgba(99,102,241,.6)',
                  pointerEvents: 'none', zIndex: 60,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>⌨️</span>
                  <span>{shortcutFeedback}</span>
                </div>
              )}

              {/* TOP BAR OVERLAYS: Badges, Tally, Battery, Signal */}
              <div style={{
                position: 'absolute', top: 10, left: 10, right: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Tally Badge */}
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: '.62rem', fontWeight: 900,
                    background: tally === 'pgm' ? '#ef4444' : tally === 'pvw' ? '#22c55e' : 'rgba(15,23,42,.85)',
                    color: '#fff',
                    border: tally === 'pgm' ? '1px solid #dc2626' : tally === 'pvw' ? '1px solid #16a34a' : '1px solid rgba(255,255,255,.2)',
                    boxShadow: tally === 'pgm' ? '0 0 10px rgba(239,68,68,.6)' : 'none',
                  }}>
                    {tally === 'pgm' ? '🔴 ON AIR (PGM)' : tally === 'pvw' ? '🟢 PREVIEW (PVW)' : 'CAM ACTIVE'}
                  </span>

                  {/* Protocol Badge */}
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: '.62rem', fontWeight: 800,
                    background: 'rgba(15,23,42,.85)',
                    color: '#818cf8',
                    border: '1px solid rgba(99,102,241,.3)',
                  }}>
                    {protocolBadge}
                  </span>

                  {/* Live Status */}
                  {hasLiveVideo && (
                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: '.62rem', fontWeight: 800,
                      background: 'rgba(34,197,94,.2)', color: '#4ade80',
                      border: '1px solid rgba(34,197,94,.4)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse-badge 1s infinite' }} />
                      LIVE FEED
                    </span>
                  )}
                </div>

                {/* Telemetry (Battery / Signal / Resolution / FPS) */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
                  {telemetry.signal >= 0 && (
                    <span style={{ background: 'rgba(0,0,0,.75)', padding: '2px 6px', borderRadius: 4, fontSize: '.6rem', color: '#94a3b8' }}>
                      📶 {telemetry.signal}%
                    </span>
                  )}
                  {telemetry.battery >= 0 && (
                    <span style={{
                      background: 'rgba(0,0,0,.75)', padding: '2px 6px', borderRadius: 4, fontSize: '.6rem',
                      color: telemetry.battery < 20 ? '#ef4444' : '#4ade80',
                    }}>
                      🔋 {telemetry.battery}%
                    </span>
                  )}
                  {telemetry.resolution && (
                    <span style={{ background: 'rgba(0,0,0,.75)', padding: '2px 6px', borderRadius: 4, fontSize: '.6rem', color: '#cbd5e1' }}>
                      {telemetry.resolution} {telemetry.fps ? `@ ${telemetry.fps}fps` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* BOTTOM TOOLBAR OVERLAYS: Mute, Overlays, Snapshot, Fullscreen */}
              <div style={{
                position: 'absolute', bottom: 10, left: 10, right: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                zIndex: 10,
              }}>
                {/* Telemetry Coordinates */}
                <div className="ptz-pos-overlay" style={{ position: 'relative', inset: 'auto', background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(4px)' }}>
                  <span>P: <b>{localPTZ.pan.toFixed(1)}°</b></span>
                  <span style={{ marginLeft: 8 }}>T: <b>{localPTZ.tilt.toFixed(1)}°</b></span>
                  <span style={{ marginLeft: 8 }}>Z: <b>{localPTZ.zoom}%</b></span>
                  <span style={{ marginLeft: 8 }}>F: <b>{autoFocus ? 'AUTO' : `${localPTZ.focus}%`}</b></span>
                </div>

                {/* Quick Screen Overlay Buttons */}
                <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,.75)', padding: '3px 6px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
                  <button
                    className={`btn btn-xs ${!isMuted ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      const next = !isMuted;
                      setIsMuted(next);
                      if (videoRef.current) videoRef.current.muted = next;
                    }}
                    title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>

                  <button
                    className={`btn btn-xs ${showCrosshair ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowCrosshair(s => !s)}
                    title="Toggle Crosshairs"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    🎯
                  </button>

                  <button
                    className={`btn btn-xs ${showGrid ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowGrid(g => !g)}
                    title="Toggle 3x3 Grid"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    📐
                  </button>

                  <button
                    className={`btn btn-xs ${showSafeAreas ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowSafeAreas(s => !s)}
                    title="Toggle Safe Margins"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    🔲
                  </button>

                  <button
                    className={`btn btn-xs ${digitalPTZ ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDigitalPTZ(d => !d)}
                    title="Toggle Digital Pan/Zoom Preview"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    🔎 PTZ Sim
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setVideoFit(f => f === 'contain' ? 'cover' : 'contain')}
                    title={`Video Fit: ${videoFit}`}
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    {videoFit === 'contain' ? '↔ Fit' : '↕ Fill'}
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={takeSnapshot}
                    title="Capture Snapshot"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    📸
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={toggleFullscreen}
                    title="Fullscreen Preview"
                    style={{ padding: '2px 6px', fontSize: '.7rem' }}
                  >
                    ⛶
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Row: Joystick, D-Pad, Sliders */}
          <div className="ptz-controls-row">
            {/* Joystick */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                className="ptz-joystick-area"
                ref={joystickAreaRef}
                onMouseDown={handleJoystickStart}
                onTouchStart={handleJoystickStart}
              >
                <div
                  className="ptz-joystick-bg"
                  style={{ borderColor: joystickActive ? 'var(--accent)' : 'var(--border)' }}
                >
                  <div className="ptz-joystick-crosshair-h" />
                  <div className="ptz-joystick-crosshair-v" />
                  <div
                    className="ptz-joystick-knob"
                    style={{
                      transform: `translate(${joystickPos.x * 50}px, ${joystickPos.y * 50}px)`,
                      background: joystickActive ? '#22c55e' : 'var(--accent)',
                      boxShadow: joystickActive ? '0 0 16px rgba(34,197,94,.5)' : '0 2px 8px rgba(99,102,241,.4)',
                    }}
                  >
                    <div className="ptz-joystick-inner" />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                {joystickActive ? '🟢 Active Movement' : 'Drag Joystick'}
              </div>
            </div>

            {/* D-Pad & Phone Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="ptz-dpad">
                <button
                  className="ptz-dpad-btn ptz-dpad-up"
                  style={{
                    background: activeKeyHighlight === 'up' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'up' ? '#fff' : undefined,
                    transform: activeKeyHighlight === 'up' ? 'scale(0.92)' : undefined,
                  }}
                  onMouseDown={() => sendMove(0, 1)}
                  title="Tilt Up (↑ or W)"
                >▲</button>
                <button
                  className="ptz-dpad-btn ptz-dpad-left"
                  style={{
                    background: activeKeyHighlight === 'left' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'left' ? '#fff' : undefined,
                    transform: activeKeyHighlight === 'left' ? 'scale(0.92)' : undefined,
                  }}
                  onMouseDown={() => sendMove(-1, 0)}
                  title="Pan Left (← or A)"
                >◄</button>
                <button
                  className="ptz-dpad-btn ptz-dpad-center"
                  style={{
                    background: activeKeyHighlight === 'home' ? '#22c55e' : undefined,
                    color: activeKeyHighlight === 'home' ? '#fff' : undefined,
                    transform: activeKeyHighlight === 'home' ? 'scale(0.92)' : undefined,
                  }}
                  onClick={goHome}
                  title="Home Position (H)"
                >⌂</button>
                <button
                  className="ptz-dpad-btn ptz-dpad-right"
                  style={{
                    background: activeKeyHighlight === 'right' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'right' ? '#fff' : undefined,
                    transform: activeKeyHighlight === 'right' ? 'scale(0.92)' : undefined,
                  }}
                  onMouseDown={() => sendMove(1, 0)}
                  title="Pan Right (→ or D)"
                >►</button>
                <button
                  className="ptz-dpad-btn ptz-dpad-down"
                  style={{
                    background: activeKeyHighlight === 'down' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'down' ? '#fff' : undefined,
                    transform: activeKeyHighlight === 'down' ? 'scale(0.92)' : undefined,
                  }}
                  onMouseDown={() => sendMove(0, -1)}
                  title="Tilt Down (↓ or S)"
                >▼</button>
              </div>

              {/* Phone Tools (Flip, Torch, Mute) */}
              {isPhone && (
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('flip')} title="Flip Camera (Front/Back)">
                    🔄 Flip
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('torch')} title="Toggle Flashlight/Torch">
                    🔦 Torch
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('mute')} title="Toggle Phone Mic">
                    🔇 Mic
                  </button>
                </div>
              )}
            </div>

            {/* Zoom, Focus, Speed Sliders */}
            <div className="ptz-sliders">
              {/* Zoom Slider */}
              <div className="ptz-slider-group">
                <label>🔍 Zoom</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localPTZ.zoom}
                  onChange={e => sendZoom(parseInt(e.target.value))}
                  onMouseUp={e => e.target.blur()}
                  onTouchEnd={e => e.target.blur()}
                />
                <span>{localPTZ.zoom}%</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-xs btn-outline"
                  style={{
                    flex: 1,
                    background: activeKeyHighlight === 'zoom-out' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'zoom-out' ? '#fff' : undefined,
                  }}
                  onClick={() => sendZoom((localPTZRef.current?.zoom || 50) - 10)}
                  title="Zoom Out (− or Q)"
                >Z−</button>
                <button
                  className="btn btn-xs btn-outline"
                  style={{
                    flex: 1,
                    background: activeKeyHighlight === 'zoom-in' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'zoom-in' ? '#fff' : undefined,
                  }}
                  onClick={() => sendZoom((localPTZRef.current?.zoom || 50) + 10)}
                  title="Zoom In (+ or E)"
                >Z+</button>
              </div>

              {/* Focus Slider */}
              <div className="ptz-slider-group" style={{ marginTop: 2 }}>
                <label>🎯 Focus</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localPTZ.focus}
                  disabled={autoFocus}
                  onChange={e => sendFocus(parseInt(e.target.value))}
                />
                <span>{autoFocus ? 'AF' : `${localPTZ.focus}%`}</span>
              </div>
              <button
                className={`btn btn-xs ${autoFocus ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => {
                  const next = !autoFocus;
                  setAutoFocus(next);
                  if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, next).catch(() => {});
                }}
                style={{ width: '100%', fontSize: '.68rem' }}
              >
                Auto Focus: {autoFocus ? 'ON ✓' : 'MANUAL'}
              </button>

              {/* Speed Slider */}
              <div className="ptz-slider-group" style={{ marginTop: 2 }}>
                <label>⚡ Speed</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={speed}
                  onChange={e => setSpeed(parseInt(e.target.value))}
                />
                <span>{speed}x</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Presets & Quick Actions ══ */}
        <div className="ptz-presets">
          <div className="ptz-presets-header">
            <span style={{ fontWeight: 700, fontSize: '.8rem' }}>🎯 Preset Positions</span>
            <button className="btn btn-xs btn-primary" onClick={savePreset} title="Save Current Position as Preset">
              + Save
            </button>
          </div>

          <div className="ptz-preset-list">
            {presets.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '.7rem', textAlign: 'center', padding: '16px 0' }}>
                No presets saved yet.<br/>Position the camera and click "+ Save".
              </div>
            )}
            {presets.map((p, i) => (
              <div key={p.id} className="ptz-preset-item">
                <button className="ptz-preset-btn" onClick={() => recallPreset(p)}>
                  <div className="ptz-preset-num">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ptz-preset-name">{p.name}</div>
                    <div className="ptz-preset-vals">P:{p.pan?.toFixed(0)}° T:{p.tilt?.toFixed(0)}° Z:{p.zoom}%</div>
                  </div>
                </button>
                <button
                  className="btn btn-xs btn-ghost"
                  style={{ color: '#ef4444', padding: '2px 6px' }}
                  onClick={() => deletePreset(p.id)}
                  title="Delete Preset"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 'auto' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              Quick Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button className="btn btn-xs btn-outline" onClick={goHome} style={{ fontSize: '.65rem' }}>🏠 Home</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(100)} style={{ fontSize: '.65rem' }}>🔍 Max Zoom</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(0)} style={{ fontSize: '.65rem' }}>🔎 Wide</button>
              <button
                className="btn btn-xs btn-outline"
                onClick={() => {
                  const next = !autoFocus;
                  setAutoFocus(next);
                  if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, next).catch(() => {});
                }}
                style={{ fontSize: '.65rem' }}
              >
                🎯 AF {autoFocus ? 'Off' : 'On'}
              </button>
            </div>
          </div>

          {/* Keyboard Shortcuts Guide */}
          <div className="ptz-shortcuts">
            <div style={{ fontSize: '.7rem', fontWeight: 800, color: '#f8fafc', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⌨️ Keyboard Shortcuts
              <span style={{ fontSize: '.6rem', fontWeight: 600, color: '#4ade80', background: 'rgba(34,197,94,.15)', padding: '1px 6px', borderRadius: 4 }}>
                Active
              </span>
            </div>
            <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pan / Tilt</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 700 }}>↑ ↓ ← → / WASD</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Zoom In / Out</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 700 }}>+ / − (or E / Q)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Reset Home</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 700 }}>H / Home</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Recall Preset</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 700 }}>1 to 9</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADD CAMERA MODAL ── */}
      {showAddCamera && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddCamera(false); }}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, width: 440, maxWidth: '90vw',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>📹 Add IP PTZ Camera</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Camera Name</label>
                <input
                  className="form-input"
                  placeholder="Main Stage PTZ"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Model</label>
                <input
                  className="form-input"
                  placeholder="PTZ Optics 30x / Lumens"
                  value={addForm.model}
                  onChange={e => setAddForm(p => ({ ...p, model: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>IP Address</label>
                  <input
                    className="form-input"
                    placeholder="192.168.1.101"
                    value={addForm.ip}
                    onChange={e => setAddForm(p => ({ ...p, ip: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Port</label>
                  <input
                    className="form-input"
                    type="number"
                    value={addForm.port}
                    onChange={e => setAddForm(p => ({ ...p, port: parseInt(e.target.value) || 80 }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Control Protocol</label>
                <select
                  className="form-input"
                  value={addForm.protocol}
                  onChange={e => setAddForm(p => ({ ...p, protocol: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Video Stream URL (Optional RTSP / MJPEG / HTTP)
                </label>
                <input
                  className="form-input"
                  placeholder="http://192.168.1.101/mjpeg or rtsp://..."
                  value={addForm.streamUrl}
                  onChange={e => setAddForm(p => ({ ...p, streamUrl: e.target.value }))}
                  style={{ width: '100%' }}
                />
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
