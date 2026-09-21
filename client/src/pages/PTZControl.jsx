import { useState, useRef, useCallback, useEffect } from 'react';
import { ptzApi, devicesApi } from '../api/client';
import { productionSocket, signalingSocket } from '../socket';
import { getIceConfig } from '../webrtc';

/* ═══════════════════════════════════════════════════════════
   PTZ CAMERA CONTROL — BROADCAST COMMAND CONSOLE
   Professional High-End Pan/Tilt/Zoom Workstation
   ═══════════════════════════════════════════════════════════ */

const PROTOCOLS = ['VISCA', 'VISCA-over-IP', 'ONVIF', 'CGI', 'NDI'];
const SPEED_PRESETS = [
  { label: '1x Slow', value: 1 },
  { label: '3x Norm', value: 3 },
  { label: '5x Fast', value: 5 },
  { label: '10x Max', value: 10 },
];

export default function PTZControl() {
  const [cameras, setCameras] = useState([]);
  const [activeCam, setActiveCam] = useState(null);
  const [videoSource, setVideoSource] = useState('camera'); // 'camera' | 'pgm' | 'webcam'
  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [showHorizon, setShowHorizon] = useState(true);
  const [digitalPTZ, setDigitalPTZ] = useState(false);
  const [videoFit, setVideoFit] = useState('contain'); // 'contain' | 'cover'
  const [presets, setPresets] = useState([]);
  const [storeModeActive, setStoreModeActive] = useState(false);
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
  const [targetReticle, setTargetReticle] = useState(null);
  const [vuLevel, setVuLevel] = useState({ left: 35, right: 38 });

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
  const storeModeRef = useRef(storeModeActive);
  const feedbackTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const reticleTimerRef = useRef(null);

  activeCamRef.current = activeCam;
  videoSourceRef.current = videoSource;
  localPTZRef.current = localPTZ;
  speedRef.current = speed;
  presetsRef.current = presets;
  storeModeRef.current = storeModeActive;

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

  // ── VU meter simulation when audio is unmuted ──
  useEffect(() => {
    const iv = setInterval(() => {
      if (!isMuted && hasLiveVideo) {
        const l = Math.min(95, Math.max(15, Math.round(50 + (Math.random() - 0.5) * 35)));
        const r = Math.min(95, Math.max(15, Math.round(50 + (Math.random() - 0.5) * 35)));
        setVuLevel({ left: l, right: r });
      } else {
        setVuLevel({ left: 10, right: 10 });
      }
    }, 120);
    return () => clearInterval(iv);
  }, [isMuted, hasLiveVideo]);

  // ── Load cameras from server ──
  const loadCameras = useCallback(async () => {
    try {
      const res = await ptzApi.cameras();
      if (res.cameras && res.cameras.length > 0) {
        setCameras(res.cameras);
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
          focus: current.focus !== undefined ? current.focus : 50,
        });
        setTelemetry({
          resolution: current.resolution || '1080p60',
          fps: current.fps || 30,
          bitrate: current.bitrate || 4500,
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
      setConnectingMsg('Requesting local camera access...');
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
      setConnectingMsg(cam ? `IP Camera: ${cam.ip}:${cam.port} (${cam.protocol})` : 'No camera selected');
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

    const handleIceCandidate = ({ candidate }) => {
      if (!candidate) return;
      if (peerConnRef.current && peerConnRef.current.remoteDescription) {
        peerConnRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        iceQueueRef.current.push(candidate);
      }
    };

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

  // ── Micro Step Adjustments ──
  const microStep = (dpan, dtilt) => {
    const camId = activeCamRef.current;
    if (!camId) return;
    const current = localPTZRef.current || { pan: 0, tilt: 0, zoom: 50, focus: 50 };
    const newPan = Math.max(-180, Math.min(180, Math.round((current.pan + dpan) * 10) / 10));
    const newTilt = Math.max(-90, Math.min(90, Math.round((current.tilt + dtilt) * 10) / 10));
    localPTZRef.current = { ...current, pan: newPan, tilt: newTilt };
    setLocalPTZ(prev => ({ ...prev, pan: newPan, tilt: newTilt }));
    setLastAction(`Step Pan: ${newPan.toFixed(1)}° · Tilt: ${newTilt.toFixed(1)}°`);
    ptzApi.move(camId, newPan, newTilt, 1).catch(() => {});
  };

  // ── Interactive Tap-to-Point (Click on Video to Center) ──
  const handleVideoClick = (e) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Show visual click reticle
    setTargetReticle({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (reticleTimerRef.current) clearTimeout(reticleTimerRef.current);
    reticleTimerRef.current = setTimeout(() => setTargetReticle(null), 1000);

    // Vector from center (0.5, 0.5)
    const dx = clickX - 0.5;
    const dy = clickY - 0.5;

    // Convert screen offset to degree delta (approx 50° FOV)
    const dpan = dx * 40;
    const dtilt = -dy * 30;

    const camId = activeCamRef.current;
    if (!camId) return;
    const current = localPTZRef.current || { pan: 0, tilt: 0, zoom: 50, focus: 50 };
    const newPan = Math.max(-180, Math.min(180, Math.round((current.pan + dpan) * 10) / 10));
    const newTilt = Math.max(-90, Math.min(90, Math.round((current.tilt + dtilt) * 10) / 10));

    localPTZRef.current = { ...current, pan: newPan, tilt: newTilt };
    setLocalPTZ(prev => ({ ...prev, pan: newPan, tilt: newTilt }));
    setLastAction(`Target Vector: P ${newPan.toFixed(1)}° · T ${newTilt.toFixed(1)}°`);
    setShortcutBadge(`🎯 Target Lock: P ${newPan.toFixed(0)}° T ${newTilt.toFixed(0)}°`);
    ptzApi.move(camId, newPan, newTilt, speedRef.current).catch(() => {});
  };

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

  // ── Presets: Recall or Store ──
  const handlePresetClick = (preset, index) => {
    const camId = activeCamRef.current;
    if (!camId) return;

    if (storeModeRef.current) {
      // STORE CURRENT POSITION INTO THIS PRESET
      const cur = localPTZRef.current;
      const name = prompt('Update Preset Name:', preset?.name || `Preset ${index + 1}`);
      if (!name) return;
      ptzApi.savePreset(camId, name, cur.pan, cur.tilt, cur.zoom, cur.focus).then(res => {
        if (res.preset) {
          loadPresets(camId);
          setLastAction(`Stored Preset ${index + 1}: "${name}"`);
          setShortcutBadge(`💾 Stored Preset ${index + 1}: "${name}"`);
          setStoreModeActive(false);
        }
      });
      return;
    }

    if (!preset) return;
    localPTZRef.current = {
      ...localPTZRef.current,
      pan: preset.pan,
      tilt: preset.tilt,
      zoom: preset.zoom,
      focus: preset.focus !== undefined ? preset.focus : 50,
    };
    setLocalPTZ({ pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom, focus: preset.focus !== undefined ? preset.focus : 50 });
    setLastAction(`Recalled preset: "${preset.name}"`);
    setShortcutBadge(`🎯 Preset ${index + 1}: "${preset.name}"`);
    ptzApi.recallPreset(camId, preset.id).catch(() => {});
  };

  const saveNewPreset = async () => {
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

  // ── Phone Remote Actions ──
  const sendPhoneCmd = async (cmd) => {
    if (!activeCam) return;
    setLastAction(`Phone Action: ${cmd}`);
    setShortcutBadge(`📱 Command: ${cmd}`);
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
      setShortcutBadge('📸 Frame Grab Saved');
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

  // ── Cycle Cameras (Next / Prev) ──
  const cycleCamera = (dir) => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCam);
    let nextIndex = currentIndex + dir;
    if (nextIndex < 0) nextIndex = cameras.length - 1;
    if (nextIndex >= cameras.length) nextIndex = 0;
    setActiveCam(cameras[nextIndex].id);
    setVideoSource('camera');
    setShortcutBadge(`Switched: ${cameras[nextIndex].name}`);
  };

  // ── Keyboard Shortcuts (Capture Phase) ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName?.toLowerCase();
      const isTextInput = tag === 'textarea' || (tag === 'input' && ['text', 'password', 'search', 'email', 'number'].includes(e.target.type));
      if (isTextInput) return;

      const key = e.key;
      const code = e.code || '';

      // Pan & Tilt: Arrow keys or WASD
      if (key === 'ArrowUp' || code === 'ArrowUp' || key === 'w' || key === 'W') {
        e.preventDefault(); e.stopPropagation();
        sendMove(0, 1);
        setShortcutBadge('▲ Tilt Up', 'up');
        return;
      }
      if (key === 'ArrowDown' || code === 'ArrowDown' || key === 's' || key === 'S') {
        e.preventDefault(); e.stopPropagation();
        sendMove(0, -1);
        setShortcutBadge('▼ Tilt Down', 'down');
        return;
      }
      if (key === 'ArrowLeft' || code === 'ArrowLeft' || key === 'a' || key === 'A') {
        e.preventDefault(); e.stopPropagation();
        sendMove(-1, 0);
        setShortcutBadge('◄ Pan Left', 'left');
        return;
      }
      if (key === 'ArrowRight' || code === 'ArrowRight' || key === 'd' || key === 'D') {
        e.preventDefault(); e.stopPropagation();
        sendMove(1, 0);
        setShortcutBadge('► Pan Right', 'right');
        return;
      }

      // Zoom In: + / = / NumpadAdd / E
      if (key === '+' || key === '=' || code === 'NumpadAdd' || code === 'Equal' || key === 'e' || key === 'E') {
        e.preventDefault(); e.stopPropagation();
        const currentZ = localPTZRef.current?.zoom !== undefined ? localPTZRef.current.zoom : 50;
        const nextZ = Math.min(100, currentZ + 5);
        sendZoom(nextZ);
        setShortcutBadge(`🔍 Zoom In: ${nextZ}%`, 'zoom-in');
        return;
      }

      // Zoom Out: - / _ / NumpadSubtract / Minus / Q
      if (key === '-' || key === '_' || code === 'NumpadSubtract' || code === 'Minus' || key === 'q' || key === 'Q') {
        e.preventDefault(); e.stopPropagation();
        const currentZ = localPTZRef.current?.zoom !== undefined ? localPTZRef.current.zoom : 50;
        const nextZ = Math.max(0, currentZ - 5);
        sendZoom(nextZ);
        setShortcutBadge(`🔎 Zoom Out: ${nextZ}%`, 'zoom-out');
        return;
      }

      // Home Position: H or Home
      if (key === 'h' || key === 'H' || code === 'KeyH' || code === 'Home') {
        e.preventDefault(); e.stopPropagation();
        goHome();
        setShortcutBadge('🏠 Reset Home', 'home');
        return;
      }

      // Cycle Cameras: [ or ]
      if (key === '[') {
        e.preventDefault(); e.stopPropagation();
        cycleCamera(-1);
        return;
      }
      if (key === ']') {
        e.preventDefault(); e.stopPropagation();
        cycleCamera(1);
        return;
      }

      // Presets: 1 to 9
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
        e.preventDefault(); e.stopPropagation();
        const list = presetsRef.current || [];
        const targetPreset = list[presetNum - 1];
        if (targetPreset) {
          handlePresetClick(targetPreset, presetNum - 1);
        } else {
          setShortcutBadge(`⚠️ Preset ${presetNum} empty`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [sendMove, sendZoom, goHome]);

  // Digital pan/zoom preview style calculation
  const zoomFactor = digitalPTZ ? 1 + (localPTZ.zoom / 100) * 1.5 : 1;
  const panShiftX = digitalPTZ ? (localPTZ.pan / 180) * 20 : 0;
  const panShiftY = digitalPTZ ? (-localPTZ.tilt / 90) * 20 : 0;

  const isPhone = cam?.isPhone;
  const protocolBadge = videoSource === 'pgm' ? 'PGM MASTER' : videoSource === 'webcam' ? 'LOCAL WEBCAM' : (cam?.protocol || 'WebRTC');

  return (
    <div className="ptz-page">
      {/* ── HEADER: Broadcast Desk Master Status Bar ── */}
      <div className="ptz-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
            boxShadow: '0 0 16px rgba(79,70,229,.4)'
          }}>
            🎯
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '.02em', color: '#fff' }}>
                BROADCAST PTZ DESK
              </h2>
              <span style={{
                fontSize: '.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(99,102,241,.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,.3)',
                letterSpacing: '.06em', textTransform: 'uppercase',
              }}>
                UNIT 01
              </span>
              {isMoving && (
                <span style={{
                  fontSize: '.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(34,197,94,.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,.4)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse-badge 1s infinite' }} />
                  TRACKING
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: 2 }}>
              {lastAction || 'Precision Optical Pan · Tilt · Zoom Gimbal Controller'}
            </p>
          </div>
        </div>

        {/* Center: Source Selector Segmented Control */}
        <div style={{
          display: 'flex', background: 'rgba(0,0,0,.5)', padding: 3, borderRadius: 8,
          border: '1px solid rgba(255,255,255,.1)'
        }}>
          <button
            className={`btn btn-xs ${videoSource === 'camera' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVideoSource('camera')}
            style={{ fontSize: '.72rem', padding: '4px 10px', borderRadius: 6 }}
            title="Direct Live Camera Feed"
          >
            📱 Live Camera
          </button>
          <button
            className={`btn btn-xs ${videoSource === 'pgm' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVideoSource('pgm')}
            style={{ fontSize: '.72rem', padding: '4px 10px', borderRadius: 6 }}
            title="Program Master Switcher Output"
          >
            🔴 PGM Master
          </button>
          <button
            className={`btn btn-xs ${videoSource === 'webcam' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVideoSource('webcam')}
            style={{ fontSize: '.72rem', padding: '4px 10px', borderRadius: 6 }}
            title="Local PC Webcam Test"
          >
            💻 PC Webcam
          </button>
        </div>

        {/* Right: Camera Selector & Tools */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn btn-xs btn-outline" onClick={() => cycleCamera(-1)} title="Previous Camera ([)">◀</button>
            <button className="btn btn-xs btn-outline" onClick={() => cycleCamera(1)} title="Next Camera (])">▶</button>
          </div>

          <select
            className="form-input"
            style={{ width: 180, fontSize: '.78rem', background: '#0f172a' }}
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
            + Add IP Cam
          </button>
          <button className="btn btn-xs btn-outline" onClick={loadCameras} title="Refresh Device List">
            🔄
          </button>
        </div>
      </div>

      <div className="ptz-layout">
        {/* ══ LEFT PANEL: Camera Fleet Directory ══ */}
        <div className="ptz-cam-list">
          <div className="ptz-cam-list-title">
            <span>📹 Fleet Cameras</span>
            <span style={{ fontSize: '.65rem', color: 'var(--accent)' }}>{cameras.length} UNITS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 420 }}>
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
                      boxShadow: isOnline ? '0 0 10px #4ade80' : 'none'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ptz-cam-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{c.isPhone ? '📱' : '📹'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    </div>
                    <div className="ptz-cam-model">
                      {c.model} · {c.protocol}
                    </div>

                    {/* Gauges (Battery & Signal) */}
                    {c.isPhone && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: '.58rem', color: '#94a3b8' }}>
                        {c.signal >= 0 && <span>📶 {c.signal}%</span>}
                        {c.battery >= 0 && (
                          <span style={{ color: c.battery < 25 ? '#ef4444' : '#4ade80' }}>
                            🔋 {c.battery}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!c.isPhone && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={(e) => { e.stopPropagation(); testConnection(c.id); }}
                        title="Ping Camera"
                        style={{ padding: '2px 5px', fontSize: '.6rem' }}
                      >
                        🔌
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={(e) => { e.stopPropagation(); removeCamera(c.id); }}
                        title="Delete"
                        style={{ padding: '2px 5px', fontSize: '.6rem', color: '#ef4444' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {cameras.length === 0 && (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>
                No cameras discovered.<br/>
                Connect phone camera or add IP PTZ camera.
              </div>
            )}
          </div>

          {/* Quick Mobile QR Link */}
          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              📱 Mobile Studio Setup
            </div>
            <a
              href="/camera"
              target="_blank"
              rel="noreferrer"
              className="btn btn-xs btn-outline"
              style={{ width: '100%', fontSize: '.68rem', textAlign: 'center', display: 'block', textDecoration: 'none' }}
            >
              Open Camera Link ↗
            </a>
          </div>
        </div>

        {/* ══ CENTER: Cinema Viewfinder & Industrial Control Deck ══ */}
        <div className="ptz-center">
          {/* Cinema Viewfinder Box */}
          <div className={`ptz-preview ${tally === 'pgm' ? 'tally-pgm' : tally === 'pvw' ? 'tally-pvw' : ''}`} id="ptz-video-container">
            <div
              className="ptz-preview-video ptz-corners"
              onClick={handleVideoClick}
              style={{ cursor: 'crosshair', overflow: 'hidden' }}
            >
              {/* Live Video Feed */}
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

              {/* Click-to-Point Target Reticle Animation */}
              {targetReticle && (
                <div style={{
                  position: 'absolute',
                  left: targetReticle.x,
                  top: targetReticle.y,
                  width: 32,
                  height: 32,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: '2px solid #22c55e',
                  boxShadow: '0 0 12px #22c55e',
                  pointerEvents: 'none',
                  animation: 'pulse 0.8s ease-out infinite',
                  zIndex: 40,
                }}>
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%', width: 4, height: 4,
                    background: '#22c55e', borderRadius: '50%', transform: 'translate(-50%, -50%)'
                  }} />
                </div>
              )}

              {/* Offline / Connecting Broadcast Fallback Screen */}
              {!hasLiveVideo && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: 24, textAlign: 'center', zIndex: 2, pointerEvents: 'auto',
                }}>
                  <div style={{
                    width: 70, height: 70, borderRadius: '50%',
                    background: 'rgba(99,102,241,.15)',
                    border: '2px solid rgba(99,102,241,.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2.2rem',
                    animation: 'pulse 2s infinite',
                  }}>
                    {videoSource === 'pgm' ? '🔴' : videoSource === 'webcam' ? '💻' : '📹'}
                  </div>

                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                      {videoSource === 'pgm' ? 'PGM Master Switcher Relay' : videoSource === 'webcam' ? 'Local PC Webcam' : (cam?.name || 'Selected Camera')}
                    </div>
                    <div style={{ fontSize: '.75rem', color: '#94a3b8', marginTop: 4, fontFamily: 'var(--mono)' }}>
                      {connectingMsg || 'Awaiting live video frames...'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        cleanupStream();
                        setHasLiveVideo(false);
                        const targetRoom = videoSource === 'pgm' ? 'pgm-master' : (cam?.deviceId ? `camera-${cam.deviceId}` : null);
                        if (targetRoom) signalingSocket.emit('request-offer', { roomId: targetRoom });
                      }}
                      style={{ fontSize: '.72rem' }}
                    >
                      🔄 Reconnect Stream
                    </button>
                    {videoSource !== 'pgm' && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={(e) => { e.stopPropagation(); setVideoSource('pgm'); }}
                        style={{ fontSize: '.72rem' }}
                      >
                        🔴 View PGM Master
                      </button>
                    )}
                    {videoSource !== 'webcam' && (
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={(e) => { e.stopPropagation(); setVideoSource('webcam'); }}
                        style={{ fontSize: '.72rem' }}
                      >
                        💻 Use PC Webcam
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Crosshair Overlay */}
              {showCrosshair && (
                <div className="ptz-crosshair" />
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
                  border: '1px dashed rgba(245,158,11,.45)',
                  borderRadius: 4,
                }}>
                  <div style={{
                    position: 'absolute', inset: '5%',
                    border: '1px dashed rgba(34,197,94,.4)',
                  }} />
                </div>
              )}

              {/* Artificial Horizon / Compass Leveler HUD */}
              {showHorizon && (
                <div style={{
                  position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
                }}>
                  {/* Compass Bar */}
                  <div style={{
                    display: 'flex', gap: 16, fontSize: '.58rem', fontFamily: 'var(--mono)',
                    color: 'rgba(255,255,255,.6)', background: 'rgba(0,0,0,.6)',
                    padding: '2px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)',
                  }}>
                    <span>W</span>
                    <span>•</span>
                    <span style={{ color: '#818cf8', fontWeight: 800 }}>{localPTZ.pan >= 0 ? `+${localPTZ.pan.toFixed(0)}°` : `${localPTZ.pan.toFixed(0)}°`}</span>
                    <span>•</span>
                    <span>E</span>
                  </div>

                  {/* Horizon Pitch Ladder */}
                  <div style={{
                    marginTop: 18, width: 80, height: 1, background: 'rgba(34,197,94,.4)',
                    boxShadow: '0 0 6px rgba(34,197,94,.5)', position: 'relative',
                  }}>
                    <div style={{ position: 'absolute', left: 0, top: -4, width: 1, height: 9, background: 'rgba(34,197,94,.6)' }} />
                    <div style={{ position: 'absolute', right: 0, top: -4, width: 1, height: 9, background: 'rgba(34,197,94,.6)' }} />
                    <div style={{ position: 'absolute', left: '50%', top: -2, width: 4, height: 4, background: '#22c55e', borderRadius: '50%', transform: 'translateX(-50%)' }} />
                  </div>
                </div>
              )}

              {/* Stereo VU Audio Meters */}
              {hasLiveVideo && (
                <div style={{
                  position: 'absolute', bottom: 56, right: 14,
                  display: 'flex', gap: 3, alignItems: 'flex-end', height: 40,
                  background: 'rgba(0,0,0,.75)', padding: '4px 6px', borderRadius: 4,
                  border: '1px solid rgba(255,255,255,.1)', pointerEvents: 'none',
                }}>
                  <div style={{ width: 4, height: '100%', background: 'rgba(255,255,255,.1)', borderRadius: 2, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: `${vuLevel.left}%`,
                      background: vuLevel.left > 85 ? '#ef4444' : vuLevel.left > 70 ? '#f59e0b' : '#22c55e',
                      borderRadius: 2, transition: 'height .1s ease-out',
                    }} />
                  </div>
                  <div style={{ width: 4, height: '100%', background: 'rgba(255,255,255,.1)', borderRadius: 2, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: `${vuLevel.right}%`,
                      background: vuLevel.right > 85 ? '#ef4444' : vuLevel.right > 70 ? '#f59e0b' : '#22c55e',
                      borderRadius: 2, transition: 'height .1s ease-out',
                    }} />
                  </div>
                  <span style={{ fontSize: '.5rem', color: '#94a3b8', marginLeft: 2, fontFamily: 'var(--mono)' }}>VU</span>
                </div>
              )}

              {/* Active Keyboard Shortcut Feedback Toast */}
              {shortcutFeedback && (
                <div style={{
                  position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,23,42,.96)', border: '2px solid #818cf8',
                  borderRadius: 8, padding: '8px 20px', color: '#fff',
                  fontSize: '.95rem', fontWeight: 800,
                  boxShadow: '0 8px 32px rgba(0,0,0,.95), 0 0 20px rgba(99,102,241,.6)',
                  pointerEvents: 'none', zIndex: 60,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>⌨️</span>
                  <span>{shortcutFeedback}</span>
                </div>
              )}

              {/* TOP BAR OVERLAYS: Badges, Tally, Battery, Signal */}
              <div style={{
                position: 'absolute', top: 12, left: 14, right: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Tally Badge */}
                  <span style={{
                    padding: '3px 9px', borderRadius: 4, fontSize: '.64rem', fontWeight: 900,
                    background: tally === 'pgm' ? '#ef4444' : tally === 'pvw' ? '#22c55e' : 'rgba(15,23,42,.85)',
                    color: '#fff',
                    border: tally === 'pgm' ? '1px solid #dc2626' : tally === 'pvw' ? '1px solid #16a34a' : '1px solid rgba(255,255,255,.2)',
                    boxShadow: tally === 'pgm' ? '0 0 14px rgba(239,68,68,.7)' : 'none',
                    letterSpacing: '.04em',
                  }}>
                    {tally === 'pgm' ? '🔴 ON AIR (PGM)' : tally === 'pvw' ? '🟢 PREVIEW (PVW)' : 'CAM ACTIVE'}
                  </span>

                  {/* Protocol Badge */}
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: '.62rem', fontWeight: 800,
                    background: 'rgba(15,23,42,.85)', color: '#818cf8',
                    border: '1px solid rgba(99,102,241,.3)', fontFamily: 'var(--mono)',
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
                    <span style={{ background: 'rgba(0,0,0,.75)', padding: '2px 8px', borderRadius: 4, fontSize: '.62rem', color: '#94a3b8' }}>
                      📶 {telemetry.signal}%
                    </span>
                  )}
                  {telemetry.battery >= 0 && (
                    <span style={{
                      background: 'rgba(0,0,0,.75)', padding: '2px 8px', borderRadius: 4, fontSize: '.62rem',
                      color: telemetry.battery < 20 ? '#ef4444' : '#4ade80',
                    }}>
                      🔋 {telemetry.battery}%
                    </span>
                  )}
                  {telemetry.resolution && (
                    <span style={{ background: 'rgba(0,0,0,.75)', padding: '2px 8px', borderRadius: 4, fontSize: '.62rem', color: '#cbd5e1', fontFamily: 'var(--mono)' }}>
                      {telemetry.resolution} {telemetry.fps ? `@ ${telemetry.fps}fps` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* BOTTOM FLOATING TOOLBAR: Telemetry & OSD Dock */}
              <div style={{
                position: 'absolute', bottom: 12, left: 14, right: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                zIndex: 20, pointerEvents: 'auto',
              }} onClick={(e) => e.stopPropagation()}>
                {/* Telemetry Readout Box */}
                <div className="ptz-pos-overlay">
                  <span>PAN: <b>{localPTZ.pan.toFixed(1)}°</b></span>
                  <span>TILT: <b>{localPTZ.tilt.toFixed(1)}°</b></span>
                  <span>ZOOM: <b>{localPTZ.zoom}%</b></span>
                  <span>FOCUS: <b>{autoFocus ? 'AUTO' : `${localPTZ.focus}%`}</b></span>
                </div>

                {/* OSD Quick Control Dock */}
                <div style={{
                  display: 'flex', gap: 4, background: 'rgba(10,15,29,.85)', padding: '3px 6px',
                  borderRadius: 8, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.12)',
                }}>
                  <button
                    className={`btn btn-xs ${!isMuted ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      const next = !isMuted;
                      setIsMuted(next);
                      if (videoRef.current) videoRef.current.muted = next;
                    }}
                    title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    {isMuted ? '🔇' : '🔊'}
                  </button>

                  <button
                    className={`btn btn-xs ${showCrosshair ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowCrosshair(s => !s)}
                    title="Toggle Reticle Crosshairs"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    🎯
                  </button>

                  <button
                    className={`btn btn-xs ${showGrid ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowGrid(g => !g)}
                    title="Toggle 3x3 Grid"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    📐
                  </button>

                  <button
                    className={`btn btn-xs ${showSafeAreas ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowSafeAreas(s => !s)}
                    title="Toggle Safe Margins"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    🔲
                  </button>

                  <button
                    className={`btn btn-xs ${showHorizon ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setShowHorizon(h => !h)}
                    title="Toggle Horizon Leveler HUD"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    🧭
                  </button>

                  <button
                    className={`btn btn-xs ${digitalPTZ ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDigitalPTZ(d => !d)}
                    title="Toggle Digital Pan/Zoom Simulation"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    🔎 Sim
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setVideoFit(f => f === 'contain' ? 'cover' : 'contain')}
                    title={`Video Fit: ${videoFit}`}
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    {videoFit === 'contain' ? '↔ Fit' : '↕ Fill'}
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={takeSnapshot}
                    title="Frame Grab (Snapshot PNG)"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    📸
                  </button>

                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={toggleFullscreen}
                    title="Fullscreen Preview"
                    style={{ padding: '3px 8px', fontSize: '.75rem' }}
                  >
                    ⛶
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Master Industrial Control Deck (3 High-Tech Modules) */}
          <div className="ptz-controls-row">
            {/* MODULE 1: Dual-Ring Joystick Gimbal */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 150 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                🕹️ GIMBAL STICK
              </div>
              <div
                className="ptz-joystick-area"
                ref={joystickAreaRef}
                onMouseDown={handleJoystickStart}
                onTouchStart={handleJoystickStart}
              >
                <div
                  className="ptz-joystick-bg"
                  style={{
                    borderColor: joystickActive ? 'var(--accent)' : 'rgba(255,255,255,.15)',
                    boxShadow: joystickActive ? '0 0 20px rgba(99,102,241,.3), inset 0 6px 16px rgba(0,0,0,.8)' : undefined
                  }}
                >
                  <div className="ptz-joystick-crosshair-h" />
                  <div className="ptz-joystick-crosshair-v" />

                  {/* Compass Degree Ticks */}
                  <span style={{ position: 'absolute', top: 4, fontSize: '.55rem', color: 'rgba(255,255,255,.3)', fontWeight: 800 }}>N</span>
                  <span style={{ position: 'absolute', bottom: 4, fontSize: '.55rem', color: 'rgba(255,255,255,.3)', fontWeight: 800 }}>S</span>
                  <span style={{ position: 'absolute', left: 6, fontSize: '.55rem', color: 'rgba(255,255,255,.3)', fontWeight: 800 }}>W</span>
                  <span style={{ position: 'absolute', right: 6, fontSize: '.55rem', color: 'rgba(255,255,255,.3)', fontWeight: 800 }}>E</span>

                  <div
                    className="ptz-joystick-knob"
                    style={{
                      transform: `translate(${joystickPos.x * 50}px, ${joystickPos.y * 50}px)`,
                      background: joystickActive ? 'radial-gradient(circle at 35% 35%, #22c55e 0%, #15803d 70%, #14532d 100%)' : undefined,
                      boxShadow: joystickActive ? '0 0 20px rgba(34,197,94,.6), 0 4px 14px rgba(0,0,0,.6)' : undefined,
                    }}
                  >
                    <div className="ptz-joystick-inner" />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 6, fontFamily: 'var(--mono)' }}>
                {joystickActive ? `X:${(joystickPos.x).toFixed(2)} Y:${(-joystickPos.y).toFixed(2)}` : 'Drag to steer'}
              </div>
            </div>

            {/* MODULE 2: 8-Way Tactile D-Pad & Micro-Steppers */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 150 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                🧭 D-PAD & STEPPERS
              </div>
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

              {/* Micro Stepper Triggers (1° micro moves) */}
              <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                <button className="btn btn-xs btn-outline" onClick={() => microStep(-1, 0)} title="Step Left 1°" style={{ padding: '2px 5px', fontSize: '.62rem' }}>◄1°</button>
                <button className="btn btn-xs btn-outline" onClick={() => microStep(0, 1)} title="Step Up 1°" style={{ padding: '2px 5px', fontSize: '.62rem' }}>▲1°</button>
                <button className="btn btn-xs btn-outline" onClick={() => microStep(0, -1)} title="Step Down 1°" style={{ padding: '2px 5px', fontSize: '.62rem' }}>▼1°</button>
                <button className="btn btn-xs btn-outline" onClick={() => microStep(1, 0)} title="Step Right 1°" style={{ padding: '2px 5px', fontSize: '.62rem' }}>1°►</button>
              </div>

              {/* Mobile Phone Remote Tools */}
              {isPhone && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('flip')} title="Flip Camera Lens">
                    🔄 Flip
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('torch')} title="Toggle Torch Light">
                    🔦 Torch
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={() => sendPhoneCmd('mute')} title="Toggle Mic">
                    🔇 Mic
                  </button>
                </div>
              )}
            </div>

            {/* MODULE 3: Precision Optics & Speed Control */}
            <div className="ptz-sliders">
              <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                🔍 OPTICS & ZOOM RACK
              </div>

              {/* Zoom Controls */}
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
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-xs btn-outline"
                  style={{
                    flex: 1,
                    background: activeKeyHighlight === 'zoom-out' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'zoom-out' ? '#fff' : undefined,
                    fontWeight: 700,
                  }}
                  onClick={() => sendZoom((localPTZRef.current?.zoom || 50) - 10)}
                  title="Zoom Out (− or Q)"
                >
                  🔎 Wide (Z−)
                </button>
                <button
                  className="btn btn-xs btn-outline"
                  style={{
                    flex: 1,
                    background: activeKeyHighlight === 'zoom-in' ? 'var(--accent)' : undefined,
                    color: activeKeyHighlight === 'zoom-in' ? '#fff' : undefined,
                    fontWeight: 700,
                  }}
                  onClick={() => sendZoom((localPTZRef.current?.zoom || 50) + 10)}
                  title="Zoom In (+ or E)"
                >
                  🔍 Tele (Z+)
                </button>
              </div>

              {/* Focus Controls */}
              <div className="ptz-slider-group" style={{ marginTop: 2 }}>
                <label>🎯 Focus</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localPTZ.focus}
                  disabled={autoFocus}
                  onChange={e => sendFocus(parseInt(e.target.value))}
                  onMouseUp={e => e.target.blur()}
                  onTouchEnd={e => e.target.blur()}
                />
                <span>{autoFocus ? 'AUTO' : `${localPTZ.focus}%`}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={`btn btn-xs ${autoFocus ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    const next = !autoFocus;
                    setAutoFocus(next);
                    if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, next).catch(() => {});
                  }}
                  style={{ flex: 1, fontSize: '.68rem', fontWeight: 700 }}
                >
                  {autoFocus ? '✓ AF Active' : 'Manual Focus'}
                </button>
                <button
                  className="btn btn-xs btn-outline"
                  onClick={() => {
                    setAutoFocus(true);
                    if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, true).catch(() => {});
                    setShortcutBadge('🎯 One-Push AF Locked');
                  }}
                  style={{ flex: 1, fontSize: '.68rem' }}
                >
                  One-Push AF
                </button>
              </div>

              {/* Speed Multiplier Segmented Selector */}
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>⚡ Slew Speed:</span>
                  <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{speed}x</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {SPEED_PRESETS.map(sp => (
                    <button
                      key={sp.value}
                      className={`btn btn-xs ${speed === sp.value ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setSpeed(sp.value)}
                      style={{ fontSize: '.62rem', padding: '3px 2px' }}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT PANEL: Studio Preset Matrix (Launchpad Deck) ══ */}
        <div className="ptz-presets">
          <div className="ptz-presets-header">
            <div>
              <span style={{ fontWeight: 800, fontSize: '.82rem', color: '#fff' }}>🎯 PRESET MATRIX</span>
              <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                {storeModeActive ? '🔴 CLICK TILE TO STORE POSITION' : 'Instant 1-Click Shot Recall'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className={`btn btn-xs ${storeModeActive ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => setStoreModeActive(s => !s)}
                style={{
                  fontSize: '.65rem', fontWeight: 800,
                  boxShadow: storeModeActive ? '0 0 12px rgba(239,68,68,.7)' : 'none',
                  animation: storeModeActive ? 'pulse-badge 1s infinite' : 'none',
                }}
                title="Toggle Store Mode to save current position to a tile"
              >
                {storeModeActive ? '🔴 STORE ON' : '💾 Store'}
              </button>
              <button className="btn btn-xs btn-primary" onClick={saveNewPreset} title="Add New Named Preset">
                + New
              </button>
            </div>
          </div>

          {/* Preset Matrix Grid (Launchpad Style) */}
          <div className="ptz-preset-list">
            {presets.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '.72rem', textAlign: 'center', padding: '24px 0' }}>
                No presets defined.<br/>
                Position camera and click "+ New" or "💾 Store".
              </div>
            )}
            {presets.map((p, i) => {
              const isHighlighted = activeKeyHighlight === `preset-${i + 1}`;

              return (
                <div key={p.id || i} className="ptz-preset-item">
                  <button
                    className="ptz-preset-btn"
                    onClick={() => handlePresetClick(p, i)}
                    style={{
                      background: isHighlighted ? 'rgba(99,102,241,.3)' : storeModeActive ? 'rgba(239,68,68,.1)' : undefined,
                      borderColor: isHighlighted ? 'var(--accent)' : storeModeActive ? 'rgba(239,68,68,.4)' : undefined,
                      transform: isHighlighted ? 'scale(0.98)' : undefined,
                    }}
                  >
                    <div
                      className="ptz-preset-num"
                      style={{
                        background: storeModeActive ? '#ef4444' : undefined,
                        boxShadow: isHighlighted ? '0 0 12px var(--accent)' : undefined
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ptz-preset-name">{p.name}</div>
                      <div className="ptz-preset-vals">
                        P:{p.pan?.toFixed(0)}° T:{p.tilt?.toFixed(0)}° Z:{p.zoom}%
                      </div>
                    </div>
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    style={{ color: '#ef4444', padding: '4px 6px' }}
                    onClick={() => deletePreset(p.id)}
                    title="Delete Preset"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Quick Actions Bar */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10, marginTop: 'auto' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6 }}>
              QUICK COMMANDS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn btn-xs btn-outline" onClick={goHome} style={{ fontSize: '.68rem' }}>🏠 Reset Home</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(100)} style={{ fontSize: '.68rem' }}>🔍 Max Tele</button>
              <button className="btn btn-xs btn-outline" onClick={() => sendZoom(0)} style={{ fontSize: '.68rem' }}>🔎 Full Wide</button>
              <button
                className="btn btn-xs btn-outline"
                onClick={() => {
                  const next = !autoFocus;
                  setAutoFocus(next);
                  if (activeCam) ptzApi.focus(activeCam, localPTZ.focus, next).catch(() => {});
                }}
                style={{ fontSize: '.68rem' }}
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cycle Cam</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 700 }}>[ and ]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADD IP CAMERA MODAL ── */}
      {showAddCamera && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddCamera(false); }}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 14,
            padding: 24, width: 440, maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,.8)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              📹 Add IP PTZ Camera
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  placeholder="PTZOptics 30x / Lumens / BirdDog"
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
                  Direct Video Stream URL (RTSP / MJPEG / HTTP Optional)
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
