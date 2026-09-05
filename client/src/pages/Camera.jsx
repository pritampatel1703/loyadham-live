import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { getIceConfig, ICE_SERVERS } from '../webrtc';

const URL = import.meta.env.VITE_API_URL || '';

export default function Camera() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('connecting');
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const deviceIdRef = useRef('');
  const [facingMode, setFacingMode] = useState('environment');
  const [isMuted, setIsMuted] = useState(false);
  const [isTorch, setIsTorch] = useState(false);
  const [resolution, setResolution] = useState('1080p');
  const [battery, setBattery] = useState(-1);
  const [signal, setSignal] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [tally, setTally] = useState('off');
  const [detectedBrand, setDetectedBrand] = useState(null); // 'dji' | 'gopro' | 'capture_card' | null
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  
  // Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [frameRate, setFrameRate] = useState(30);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [stabilization, setStabilization] = useState('auto');
  const [blur, setBlur] = useState(false);
  
  // Fullscreen & Zoom
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
  const [gyroSteady, setGyroSteady] = useState(false);

  // Pro Manual Controls
  const [showProControls, setShowProControls] = useState(false);
  const [proCaps, setProCaps] = useState(null); // { iso, exposureCompensation, focusDistance, colorTemperature, exposureTime, brightness }
  const [proValues, setProValues] = useState({
    iso: null,
    exposureCompensation: null,
    focusDistance: null,
    colorTemperature: null,
    exposureTime: null,
    brightness: null,
  });
  const [proModes, setProModes] = useState({
    exposureMode: 'continuous',
    focusMode: 'continuous',
    whiteBalanceMode: 'continuous',
  });
  const [canvasProcessing, setCanvasProcessing] = useState(false);
  const softFiltersRef = useRef({ brightness: 1, contrast: 1, saturate: 1, warmth: 0 });
  const [softDisplay, setSoftDisplay] = useState({ brightness: 1, contrast: 1, saturate: 1, warmth: 0 });

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const rawStreamRef = useRef(null);
  const rawTrackRef = useRef(null);
  const rawVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const renderLoopRef = useRef(null);
  const deviceSocketRef = useRef(null);
  const sigSocketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const timerRef = useRef(null);
  const trackRef = useRef(null);
  const zoomTimeoutRef = useRef(null);
  const lastZoomTimeRef = useRef(0);
  const gyroOffset = useRef({ x: 0, y: 0 });
  const orientationData = useRef({ pitch: null, yaw: null });
  const targetOrientation = useRef({ pitch: null, yaw: null });
  const peersRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const iceQueuesRef = useRef(new Map()); // peerId -> RTCIceCandidateInit[]

  const resMap = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '2160p': { width: 3840, height: 2160 },
  };

  // Detect external camera brand from device label
  const detectCameraBrand = (label) => {
    const l = label.toLowerCase();
    if (l.includes('dji') || l.includes('uvc camera') || l.includes('pocket')) return 'dji';
    if (l.includes('gopro')) return 'gopro';
    if (l.includes('cam link') || l.includes('capture') || l.includes('elgato') || l.includes('avermedia') || l.includes('magewell')) return 'capture_card';
    return null;
  };

  const brandInfo = {
    dji: { name: 'DJI Pocket 3', icon: '🎬', color: '#00c3ff' },
    gopro: { name: 'GoPro', icon: '📹', color: '#00bceb' },
    capture_card: { name: 'Capture Card', icon: '🔌', color: '#a855f7' },
  };

  // Enumerate cameras
  useEffect(() => {
    const getCams = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevs);

        // Auto-detect external cameras (DJI, GoPro, Capture Card)
        const externalCam = videoDevs.find(d => detectCameraBrand(d.label));
        if (externalCam) {
          const brand = detectCameraBrand(externalCam.label);
          setDetectedBrand(brand);
          // Auto-select the external camera if nothing is selected yet
          if (!selectedCameraId) {
            setSelectedCameraId(externalCam.deviceId);
          }
        } else if (videoDevs.length > 0 && !selectedCameraId) {
          setDetectedBrand(null);
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

  // ── Gyroscope UI Toggle ──
  const enableGyroSteady = async () => {
    if (gyroSteady) {
      setGyroSteady(false);
      return;
    }
    // Request permission for iOS
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') setGyroSteady(true);
        else alert('Gyroscope permission denied. Please allow it in settings.');
      } catch (e) { console.error('Gyro error', e); }
    } else {
      setGyroSteady(true); // Non-iOS or older
    }
  };

  // ── Gyroscope Tracking ──
  useEffect(() => {
    if (!gyroSteady) return;

    orientationData.current = { pitch: null, yaw: null };
    targetOrientation.current = { pitch: null, yaw: null };
    gyroOffset.current = { x: 0, y: 0 };

    const handleOrientationEvent = (e) => {
      if (e.beta === null || e.gamma === null) return;
      
      let pitch = e.beta;
      let yaw = e.gamma;
      
      const angle = window.screen?.orientation?.angle || 0;
      if (angle === 90) { pitch = -e.gamma; yaw = e.beta; } 
      else if (angle === -90 || angle === 270) { pitch = e.gamma; yaw = -e.beta; }
      else if (angle === 180) { pitch = -e.beta; yaw = -e.gamma; }

      if (orientationData.current.pitch === null) {
        orientationData.current = { pitch, yaw };
        targetOrientation.current = { pitch, yaw };
        return;
      }

      // Smooth follow (Low-pass filter for the "intended" direction)
      targetOrientation.current.pitch += (pitch - targetOrientation.current.pitch) * 0.05;
      targetOrientation.current.yaw += (yaw - targetOrientation.current.yaw) * 0.05;

      const shakePitch = pitch - targetOrientation.current.pitch;
      const shakeYaw = yaw - targetOrientation.current.yaw;

      // 30 px per degree is an estimate at 1x. Scales up heavily when zoomed in!
      const ppx = 30 * zoom;
      
      gyroOffset.current.y = shakePitch * ppx;
      gyroOffset.current.x = shakeYaw * ppx;
    };

    window.addEventListener('deviceorientation', handleOrientationEvent);
    return () => window.removeEventListener('deviceorientation', handleOrientationEvent);
  }, [gyroSteady, zoom]);

  // ── Start camera ──
  const startCamera = async () => {
    if (rawStreamRef.current) rawStreamRef.current.getTracks().forEach(t => t.stop());
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);

    try {
      const r = resMap[resolution] || resMap['1080p'];
      
      const videoConstraints = {
        width: { ideal: r.width },
        height: { ideal: r.height },
        frameRate: { ideal: frameRate }
      };

      if (stabilization !== 'off') {
        videoConstraints.videoStabilizationMode = { ideal: gyroSteady ? 'cinematic' : stabilization };
      }
      
      if (blur) {
        videoConstraints.backgroundBlur = true;
      }

      if (selectedCameraId) {
        videoConstraints.deviceId = { exact: selectedCameraId };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      const rawStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      rawStreamRef.current = rawStream;
      rawTrackRef.current = rawStream.getVideoTracks()[0];

      if (rawTrackRef.current.contentHint !== undefined) {
        rawTrackRef.current.contentHint = 'detail';
      }

      // Check zoom capabilities on raw hardware track
      const caps = rawTrackRef.current.getCapabilities();
      if (caps.zoom) {
        setZoomRange({ min: caps.zoom.min || 1, max: caps.zoom.max || 5, step: 0.01 }); // Smooth step
      } else {
        setZoomRange({ min: 1, max: 1, step: 0.01 });
      }

      // Detect Pro Control capabilities
      const detectedCaps = {};
      const settings = rawTrackRef.current.getSettings();
      const proProps = ['iso', 'exposureCompensation', 'focusDistance', 'colorTemperature', 'exposureTime', 'brightness'];
      proProps.forEach(prop => {
        if (caps[prop] && typeof caps[prop].min === 'number') {
          detectedCaps[prop] = { min: caps[prop].min, max: caps[prop].max, step: caps[prop].step || 1 };
        }
      });
      if (Object.keys(detectedCaps).length > 0) {
        setProCaps(detectedCaps);
        // Initialize proValues from current settings
        const initVals = {};
        proProps.forEach(prop => {
          initVals[prop] = settings[prop] ?? detectedCaps[prop]?.min ?? null;
        });
        setProValues(prev => ({ ...prev, ...initVals }));
        // Initialize modes
        setProModes({
          exposureMode: settings.exposureMode || 'continuous',
          focusMode: settings.focusMode || 'continuous',
          whiteBalanceMode: settings.whiteBalanceMode || 'continuous',
        });
      } else {
        setProCaps(null);
      }

      let finalStream = rawStream;

      if (gyroSteady || canvasProcessing) {
        if (!rawVideoRef.current) {
          rawVideoRef.current = document.createElement('video');
          rawVideoRef.current.autoplay = true;
          rawVideoRef.current.playsInline = true;
          rawVideoRef.current.muted = true;
        }
        rawVideoRef.current.srcObject = rawStream;
        await rawVideoRef.current.play().catch(e=>console.log(e));

        if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
        const canvas = canvasRef.current;
        canvas.width = r.width;
        canvas.height = r.height;
        const ctx = canvas.getContext('2d');

        const render = () => {
          if (rawVideoRef.current.readyState >= 2) {
             // Apply software filters via CSS filter string
             const sf = softFiltersRef.current;
             ctx.filter = `brightness(${sf.brightness}) contrast(${sf.contrast}) saturate(${sf.saturate})`;

             ctx.fillStyle = '#000';
             ctx.fillRect(0, 0, canvas.width, canvas.height);

             if (gyroSteady) {
               // Scale up by 20% to create a moving margin for gyro
               const scale = 1.2;
               const w = canvas.width * scale;
               const h = canvas.height * scale;
               const ccx = canvas.width / 2;
               const ccy = canvas.height / 2;
               const marginX = canvas.width * ((scale - 1) / 2);
               const marginY = canvas.height * ((scale - 1) / 2);
               let offX = Math.max(-marginX, Math.min(marginX, gyroOffset.current.x));
               let offY = Math.max(-marginY, Math.min(marginY, gyroOffset.current.y));
               ctx.drawImage(rawVideoRef.current, ccx - w/2 - offX, ccy - h/2 - offY, w, h);
             } else {
               ctx.drawImage(rawVideoRef.current, 0, 0, canvas.width, canvas.height);
             }

             // Apply warmth/color temperature overlay
             if (sf.warmth !== 0) {
               ctx.filter = 'none';
               ctx.globalCompositeOperation = 'soft-light';
               const alpha = Math.abs(sf.warmth) * 0.45;
               ctx.fillStyle = sf.warmth > 0 ? `rgba(255, 147, 41, ${alpha})` : `rgba(70, 130, 240, ${alpha})`;
               ctx.fillRect(0, 0, canvas.width, canvas.height);
               ctx.globalCompositeOperation = 'source-over';
             }

             ctx.filter = 'none';
          }
          renderLoopRef.current = requestAnimationFrame(render);
        };
        renderLoopRef.current = requestAnimationFrame(render);

        const canvasStream = canvas.captureStream(frameRate);
        const rawAudio = rawStream.getAudioTracks()[0];
        if (rawAudio) canvasStream.addTrack(rawAudio);
        
        finalStream = canvasStream;
      }

      streamRef.current = finalStream;
      trackRef.current = finalStream.getVideoTracks()[0]; // Video track sent to WebRTC
      
      if (videoRef.current) videoRef.current.srcObject = finalStream;

      // Re-apply zoom to hardware track if zooming was active
      if (zoom > 1) {
        try { await rawTrackRef.current.applyConstraints({ advanced: [{ zoom }] }); } catch(e){}
      }

      // Replace tracks on all existing peer connections AND reapply quality params
      peersRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        finalStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
            if (track.kind === 'video') applyVideoEncoderParams(sender);
          }
        });
      });

      return finalStream;
    } catch (err) {
      console.error('Camera error:', err);
      setStatus('camera-error');
      return null;
    }
  };

  // ── WebRTC Quality Tuning ──

  // Apply high-quality encoder params to a video sender
  const applyVideoEncoderParams = (sender) => {
    try {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate = 8_000_000;       // 8 Mbps cap
      params.encodings[0].scaleResolutionDownBy = 1.0;   // Never downscale resolution
      params.encodings[0].networkPriority = 'high';
      params.encodings[0].priority = 'high';
      // Never drop resolution OR framerate — send full quality always
      params.degradationPreference = 'disabled';
      sender.setParameters(params).catch(() => {});
    } catch (e) { /* browser may not support all params */ }
  };

  // Embed bandwidth hint in SDP (kbps)
  const forceHighBitrateSDP = (sdp) => {
    const lines = sdp.split('\r\n');
    const idx = lines.findIndex(l => l.startsWith('m=video'));
    if (idx > -1) lines.splice(idx + 1, 0, 'b=AS:8000');
    return lines.join('\r\n');
  };

  const createPeerConnection = useCallback(async (peerId) => {
    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peersRef.current.set(peerId, pc);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, streamRef.current);
        if (track.kind === 'video') applyVideoEncoderParams(sender);
      });
    }

    pc.ontrack = (e) => {
      if (e.track.kind === 'audio') {
        console.log('[Camera] Received Talkback audio track');
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0];
          audioRef.current.play().catch(err => console.warn('Talkback playback failed:', err));
        }
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && sigSocketRef.current) {
        console.log('[Camera] ICE candidate:', e.candidate.type, e.candidate.protocol, e.candidate.address);
        sigSocketRef.current.emit('ice-candidate', {
          targetId: peerId,
          candidate: e.candidate,
          streamId: deviceIdRef.current,
        });
      }
    };

    pc.onicecandidateerror = (e) => {
      console.warn('[Camera] ICE candidate error:', e.errorCode, e.errorText, e.url);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Camera] ICE state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('[Camera] Connection state:', pc.connectionState);
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
    const pc = await createPeerConnection(peerId);
    const offer = await pc.createOffer();
    offer.sdp = forceHighBitrateSDP(offer.sdp);
    await pc.setLocalDescription(offer);
    sigSocketRef.current.emit('offer', {
      targetId: peerId,
      sdp: pc.localDescription,
      streamId: deviceIdRef.current,
    });
    setViewers(peersRef.current.size);
    setStreaming(true);
  }, [createPeerConnection]);

  // Handle answer from production viewer
  const handleAnswer = useCallback(async ({ fromId, sdp }) => {
    const pc = peersRef.current.get(fromId);
    if (pc && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const queue = iceQueuesRef.current.get(fromId);
      if (queue) {
        queue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
        iceQueuesRef.current.delete(fromId);
      }
    }
  }, []);

  // Handle ICE candidate from production viewer
  const handleIceCandidate = useCallback(async ({ fromId, candidate }) => {
    const pc = peersRef.current.get(fromId);
    if (pc) {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
      } else {
        if (!iceQueuesRef.current.has(fromId)) iceQueuesRef.current.set(fromId, []);
        iceQueuesRef.current.get(fromId).push(candidate);
      }
    }
  }, []);

  // When production viewer leaves
  const handlePeerLeft = useCallback(({ peerId }) => {
    const pc = peersRef.current.get(peerId);
    if (pc) { pc.close(); peersRef.current.delete(peerId); }
    iceQueuesRef.current.delete(peerId);
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
  }, [resolution, frameRate, selectedCameraId, facingMode, stabilization, blur, gyroSteady, canvasProcessing]);

  // ── Toggle torch ──
  const toggleTorch = async () => {
    const targetTrack = rawTrackRef.current || trackRef.current;
    if (!targetTrack) return;
    try {
      const caps = targetTrack.getCapabilities();
      if (caps.torch) {
        setIsTorch(t => {
          targetTrack.applyConstraints({ advanced: [{ torch: !t }] }).catch(()=>{});
          return !t;
        });
      }
    } catch (e) { console.error('Torch error:', e); }
  };

  // ── Toggle mute ──
  const toggleMute = () => {
    const targetStream = rawStreamRef.current || streamRef.current;
    if (!targetStream) return;
    targetStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  // ── Zoom Handler (Smoothed & Throttled) ──
  const handleZoom = async (e) => {
    const val = parseFloat(e.target.value);
    setZoom(val); // Instant UI update for smooth slider dragging

    const targetTrack = rawTrackRef.current || trackRef.current;
    if (targetTrack) {
      const now = Date.now();
      
      // Throttle hardware API calls to max 20 times per second (every 50ms)
      if (now - lastZoomTimeRef.current > 50) {
        lastZoomTimeRef.current = now;
        try {
          await targetTrack.applyConstraints({ advanced: [{ zoom: val }] });
        } catch (err) {}
      } else {
        // Guarantee the very last frame of zoom is applied when the user stops dragging
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = setTimeout(async () => {
          lastZoomTimeRef.current = Date.now();
          try {
            await targetTrack.applyConstraints({ advanced: [{ zoom: val }] });
          } catch (err) {}
        }, 50);
      }
    }
  };

  // ── Pro Manual Control Handler ──
  const applyProConstraint = async (setting, value) => {
    const targetTrack = rawTrackRef.current || trackRef.current;
    if (!targetTrack) return;

    // Update local state immediately for smooth slider
    setProValues(prev => ({ ...prev, [setting]: value }));

    try {
      // When user drags a manual slider, switch the corresponding mode to manual
      const modeUpdates = {};
      if (setting === 'iso' || setting === 'exposureCompensation' || setting === 'exposureTime') {
        if (proModes.exposureMode !== 'manual') {
          modeUpdates.exposureMode = 'manual';
          setProModes(prev => ({ ...prev, exposureMode: 'manual' }));
        }
      }
      if (setting === 'focusDistance') {
        if (proModes.focusMode !== 'manual') {
          modeUpdates.focusMode = 'manual';
          setProModes(prev => ({ ...prev, focusMode: 'manual' }));
        }
      }
      if (setting === 'colorTemperature') {
        if (proModes.whiteBalanceMode !== 'manual') {
          modeUpdates.whiteBalanceMode = 'manual';
          setProModes(prev => ({ ...prev, whiteBalanceMode: 'manual' }));
        }
      }

      await targetTrack.applyConstraints({ advanced: [{ ...modeUpdates, [setting]: value }] });
    } catch (err) {
      console.warn('Pro control error:', setting, err);
    }
  };

  // ── Reset a pro mode back to Auto ──
  const resetProModeToAuto = async (mode) => {
    const targetTrack = rawTrackRef.current || trackRef.current;
    if (!targetTrack) return;
    try {
      await targetTrack.applyConstraints({ advanced: [{ [mode]: 'continuous' }] });
      setProModes(prev => ({ ...prev, [mode]: 'continuous' }));
    } catch (err) {
      console.warn('Pro auto reset error:', mode, err);
    }
  };

  // ── Software Filter Handler (Canvas-based) ──
  const handleSoftControl = (key, value) => {
    softFiltersRef.current = { ...softFiltersRef.current, [key]: value };
    setSoftDisplay(prev => ({ ...prev, [key]: value }));
    // Activate canvas pipeline on first software adjustment
    if (!canvasProcessing) {
      setCanvasProcessing(true);
    }
  };

  const resetSoftFilters = () => {
    const defaults = { brightness: 1, contrast: 1, saturate: 1, warmth: 0 };
    softFiltersRef.current = defaults;
    setSoftDisplay(defaults);
  };

  // ── Fullscreen Toggle ──
  const toggleFullscreen = async () => {
    try {
      const doc = document.documentElement;
      if (!document.fullscreenElement) {
        if (doc.requestFullscreen) await doc.requestFullscreen();
        else if (doc.webkitRequestFullscreen) await doc.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) { console.warn('FS error:', err); }
  };

  // ── Remote Commands Listener ──
  useEffect(() => {
    const devSock = deviceSocketRef.current;
    if (!devSock) return;

    const cmdHandler = ({ cmd }) => {
      console.log('[Camera] Remote command:', cmd);
      if (cmd === 'flip') {
        setFacingMode(f => f === 'environment' ? 'user' : 'environment');
        setSelectedCameraId('');
      } else if (cmd === 'torch') {
        toggleTorch();
      } else if (cmd === 'mute') {
        toggleMute();
      }
    };

    devSock.on('camera-cmd', cmdHandler);
    return () => devSock.off('camera-cmd', cmdHandler);
  }, [deviceId]);


  // ── Battery & Network info & Mobile setup ──
  useEffect(() => {
    // Block mobile pull-to-refresh
    document.body.style.overscrollBehaviorY = 'none';

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

    return () => { document.body.style.overscrollBehaviorY = 'auto'; };
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
      deviceIdRef.current = device_id;
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

    devSock.on('tally-update', ({ pgmId, pvwId }) => {
      if (pgmId === deviceIdRef.current) setTally('pgm');
      else if (pvwId === deviceIdRef.current) setTally('pvw');
      else setTally('off');
    });

    devSock.on('disconnect', () => setStatus('disconnected'));

    // Signaling events
    const onSigConnect = () => {
      if (deviceIdRef.current) {
        sigSock.emit('join-room', { roomId: `camera-${deviceIdRef.current}` });
        console.log(`[Camera] Signaling connected and joined room: camera-${deviceIdRef.current}`);
      }
    };
    sigSock.on('connect', onSigConnect);
    if (sigSock.connected) onSigConnect();

    sigSock.on('peer-joined', handlePeerJoined);
    sigSock.on('need-offer', ({ fromId }) => {
      if (fromId) {
        console.log('[Camera] need-offer received from:', fromId);
        handlePeerJoined({ peerId: fromId });
      }
    });
    sigSock.on('room-peers', ({ peers }) => {
      if (Array.isArray(peers)) {
        console.log('[Camera] room-peers received:', peers);
        peers.forEach(peerId => handlePeerJoined({ peerId }));
      }
    });
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
    sigSock.off('need-offer');
    sigSock.off('room-peers');
    sigSock.off('answer');
    sigSock.off('ice-candidate');
    sigSock.off('peer-left');
    sigSock.on('peer-joined', handlePeerJoined);
    sigSock.on('need-offer', ({ fromId }) => {
      if (fromId) handlePeerJoined({ peerId: fromId });
    });
    sigSock.on('room-peers', ({ peers }) => {
      if (Array.isArray(peers)) peers.forEach(peerId => handlePeerJoined({ peerId }));
    });
    sigSock.on('answer', handleAnswer);
    sigSock.on('ice-candidate', handleIceCandidate);
    sigSock.on('peer-left', handlePeerLeft);
    if (sigSock.connected) {
      sigSock.emit('join-room', { roomId: `camera-${deviceId}` });
    }
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

  const tallyBorder = tally === 'pgm' ? '6px solid #ef4444' : tally === 'pvw' ? '6px solid #22c55e' : 'none';

  return (
    <div style={{ ...styles.container, border: tallyBorder, boxSizing: 'border-box' }}>
      {/* Tally Overlay Label */}
      {tally !== 'off' && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: tally === 'pgm' ? '#ef4444' : '#22c55e', color: '#fff', padding: '6px 20px', borderRadius: 8, fontWeight: 'bold', fontSize: '1.2rem', letterSpacing: 2, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          {tally === 'pgm' ? 'LIVE' : 'PREVIEW'}
        </div>
      )}

      {/* Camera Feed */}
      <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {/* Grid Overlay */}
      {showGrid && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '100%',
          height: '100%',
          maxWidth: orientation === 'landscape' ? '100%' : 'calc(100vh * (9/16))',
          maxHeight: orientation === 'landscape' ? 'calc(100vw * (9/16))' : '100%',
          aspectRatio: orientation === 'landscape' ? '16/9' : '9/16',
          pointerEvents: 'none', 
          zIndex: 5 
        }}>
          <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.2)', boxShadow: '0 0 1px rgba(0,0,0,0.5)' }}></div>
          <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.2)', boxShadow: '0 0 1px rgba(0,0,0,0.5)' }}></div>
          <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)', boxShadow: '0 0 1px rgba(0,0,0,0.5)' }}></div>
          <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)', boxShadow: '0 0 1px rgba(0,0,0,0.5)' }}></div>
        </div>
      )}

      {/* Top HUD */}
      <div style={styles.topHud}>
        <div style={styles.statusBadge}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'live' ? '#22c55e' : '#eab308', animation: status === 'live' ? 'pulse-badge 2s infinite' : 'none' }}></div>
          <span>{status === 'live' ? 'CONNECTED' : status.toUpperCase()}</span>
        </div>
        {deviceName && <span style={styles.deviceLabel}>{deviceName}</span>}
        {streaming && <span style={{ ...styles.statusBadge, background: 'rgba(239,68,68,.6)', border: '1px solid rgba(239,68,68,.4)' }}>🔴 STREAMING · {viewers} viewer{viewers !== 1 ? 's' : ''}</span>}
        {detectedBrand && brandInfo[detectedBrand] && (
          <span style={{ ...styles.statusBadge, background: `${brandInfo[detectedBrand].color}33`, border: `1px solid ${brandInfo[detectedBrand].color}66`, color: brandInfo[detectedBrand].color }}>
            {brandInfo[detectedBrand].icon} {brandInfo[detectedBrand].name}
          </span>
        )}
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {status === 'live' && <span style={styles.timer}>{fmtTime(elapsed)}</span>}
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

      {/* Vertical Zoom Slider (Right Edge) */}
      {zoomRange.max > 1 && status === 'live' && (
        <div style={styles.verticalZoomContainer}>
          <span style={styles.verticalZoomLabel}>{zoom.toFixed(1)}x</span>
          <input 
            type="range" 
            min={zoomRange.min} 
            max={zoomRange.max} 
            step={zoomRange.step} 
            value={zoom} 
            onChange={handleZoom} 
            style={styles.verticalZoomSlider}
            orient="vertical"
          />
          <span style={styles.verticalZoomLabel}>1.0x</span>
        </div>
      )}

      {/* Bottom Controls */}
      <div style={styles.controlsArea}>
        
        {/* Zoom Slider has been moved to the right edge */}

        <div style={styles.controls}>
          <button style={styles.controlBtn} onClick={toggleFullscreen}>
            <span style={{ fontSize: '1.5rem' }}>{isFullscreen ? '↙️' : '⛶'}</span>
            <span style={styles.controlLabel}>{isFullscreen ? 'Exit FS' : 'Fullscreen'}</span>
          </button>

          <button style={styles.controlBtn} onClick={() => setShowGrid(!showGrid)}>
            <span style={{ fontSize: '1.5rem' }}>{showGrid ? '▦' : '⧉'}</span>
            <span style={styles.controlLabel}>{showGrid ? 'Hide Grid' : 'Show Grid'}</span>
          </button>

          <button style={{ ...styles.controlBtn, background: isMuted ? 'rgba(239,68,68,.2)' : 'rgba(255,255,255,.1)', borderColor: isMuted ? 'rgba(239,68,68,.5)' : 'rgba(255,255,255,.15)' }} onClick={toggleMute}>
            <span style={{ fontSize: '1.5rem' }}>{isMuted ? '🔇' : '🎙️'}</span>
            <span style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button style={styles.controlBtn} onClick={toggleTorch}>
            <span style={{ fontSize: '1.5rem' }}>{isTorch ? '🔦' : '💡'}</span>
            <span style={styles.controlLabel}>{isTorch ? 'Torch Off' : 'Torch'}</span>
          </button>

          <button style={{ ...styles.controlBtn, background: gyroSteady ? 'rgba(34, 197, 94, .2)' : 'rgba(255,255,255,.1)', borderColor: gyroSteady ? 'rgba(34, 197, 94, .5)' : 'rgba(255,255,255,.15)' }} onClick={enableGyroSteady}>
            <span style={{ fontSize: '1.5rem' }}>{gyroSteady ? '🛸' : '🚁'}</span>
            <span style={{ ...styles.controlLabel, color: gyroSteady ? '#4ade80' : '#fff' }}>{gyroSteady ? 'Super Steady' : 'Steady Off'}</span>
          </button>

          <button style={styles.controlBtn} onClick={flipCamera}>
            <span style={{ fontSize: '1.5rem' }}>🔄</span>
            <span style={styles.controlLabel}>Flip</span>
          </button>

        <button style={styles.controlBtn} onClick={() => setShowSettings(true)}>
          <span style={{ fontSize: '1.5rem' }}>⚙️</span>
          <span style={styles.controlLabel}>Settings</span>
        </button>

        <button style={{ ...styles.controlBtn, background: showProControls ? 'rgba(168, 85, 247, .2)' : 'rgba(255,255,255,.1)', borderColor: showProControls ? 'rgba(168, 85, 247, .5)' : 'rgba(255,255,255,.15)' }} onClick={() => setShowProControls(!showProControls)}>
          <span style={{ fontSize: '1.5rem' }}>🎛️</span>
          <span style={{ ...styles.controlLabel, color: showProControls ? '#c084fc' : '#fff' }}>Pro</span>
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

              {/* Background Blur */}
              <div style={styles.settingGroup}>
                <div style={styles.settingLabel}>Background Blur (If Supported)</div>
                <div style={styles.settingRow} onClick={() => {
                  setBlur(!blur);
                  // Alert iOS users since iOS blocks this API
                  if (!blur && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    alert('Note: Apple blocks this feature in browsers. To blur the background on an iPhone, open your Control Center and tap "Video Effects ➝ Portrait".');
                  }
                }}>
                  <span>Portrait Mode (Blur)</span>
                  {blur && <span style={styles.checkIcon}>✓</span>}
                </div>
              </div>

              {/* Camera Lens */}
              {cameras.length > 0 && (
                <div style={styles.settingGroup}>
                  <div style={styles.settingLabel}>Camera lens</div>
                  {cameras.map((cam, idx) => {
                    const brand = detectCameraBrand(cam.label);
                    const info = brand ? brandInfo[brand] : null;
                    return (
                      <div key={cam.deviceId} style={styles.settingRow} onClick={() => setSelectedCameraId(cam.deviceId)}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cam.label || `Camera ${idx + 1}`}
                          {info && <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 10, background: `${info.color}22`, color: info.color, fontWeight: 700 }}>{info.icon} {info.name}</span>}
                        </span>
                        {selectedCameraId === cam.deviceId && <span style={styles.checkIcon}>✓</span>}
                      </div>
                    );
                  })}
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

      {/* Pro Manual Controls Overlay */}
      {showProControls && (
        <div style={styles.proOverlay}>
          <div style={styles.proHeader}>
            <span style={styles.proTitle}>🎛️ Manual Controls</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.proSetupBtn} onClick={() => { setShowProControls(false); setShowSetupGuide(true); }}>📷 Setup Guide</button>
              <button style={styles.proCloseBtn} onClick={() => setShowProControls(false)}>✕</button>
            </div>
          </div>

          <div style={styles.proBody}>
              {/* ── HARDWARE CONTROLS (only shown when device supports them) ── */}
              {proCaps && proCaps.iso && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>ISO <span style={styles.hwBadge}>HW</span></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.proValue}>{Math.round(proValues.iso ?? proCaps.iso.min)}</span>
                      {proModes.exposureMode === 'manual' && (
                        <button style={styles.proAutoBtn} onClick={() => resetProModeToAuto('exposureMode')}>AUTO</button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={proCaps.iso.min} max={proCaps.iso.max} step={proCaps.iso.step || 1}
                    value={proValues.iso ?? proCaps.iso.min}
                    onChange={e => applyProConstraint('iso', parseFloat(e.target.value))}
                    style={styles.proSlider} />
                  <div style={styles.proRange}>
                    <span>{proCaps.iso.min}</span><span>{proCaps.iso.max}</span>
                  </div>
                </div>
              )}

              {proCaps && proCaps.exposureCompensation && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>EV ± <span style={styles.hwBadge}>HW</span></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.proValue}>{(proValues.exposureCompensation ?? 0).toFixed(1)}</span>
                      {proModes.exposureMode === 'manual' && (
                        <button style={styles.proAutoBtn} onClick={() => resetProModeToAuto('exposureMode')}>AUTO</button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={proCaps.exposureCompensation.min} max={proCaps.exposureCompensation.max} step={proCaps.exposureCompensation.step || 0.1}
                    value={proValues.exposureCompensation ?? 0}
                    onChange={e => applyProConstraint('exposureCompensation', parseFloat(e.target.value))}
                    style={styles.proSlider} />
                  <div style={styles.proRange}>
                    <span>{proCaps.exposureCompensation.min}</span><span>0</span><span>+{proCaps.exposureCompensation.max}</span>
                  </div>
                </div>
              )}

              {proCaps && proCaps.exposureTime && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>Shutter <span style={styles.hwBadge}>HW</span></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.proValue}>1/{Math.round(1 / ((proValues.exposureTime ?? proCaps.exposureTime.min) / 1000)) || '∞'}</span>
                      {proModes.exposureMode === 'manual' && (
                        <button style={styles.proAutoBtn} onClick={() => resetProModeToAuto('exposureMode')}>AUTO</button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={proCaps.exposureTime.min} max={proCaps.exposureTime.max} step={proCaps.exposureTime.step || 1}
                    value={proValues.exposureTime ?? proCaps.exposureTime.min}
                    onChange={e => applyProConstraint('exposureTime', parseFloat(e.target.value))}
                    style={styles.proSlider} />
                  <div style={styles.proRange}>
                    <span>Fast</span><span>Slow</span>
                  </div>
                </div>
              )}

              {proCaps && proCaps.focusDistance && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>Focus <span style={styles.hwBadge}>HW</span></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.proValue}>{(proValues.focusDistance ?? proCaps.focusDistance.min).toFixed(1)}m</span>
                      {proModes.focusMode === 'manual' && (
                        <button style={styles.proAutoBtn} onClick={() => resetProModeToAuto('focusMode')}>AF</button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={proCaps.focusDistance.min} max={proCaps.focusDistance.max} step={proCaps.focusDistance.step || 0.01}
                    value={proValues.focusDistance ?? proCaps.focusDistance.min}
                    onChange={e => applyProConstraint('focusDistance', parseFloat(e.target.value))}
                    style={styles.proSlider} />
                  <div style={styles.proRange}>
                    <span>Near</span><span>Far</span>
                  </div>
                </div>
              )}

              {proCaps && proCaps.colorTemperature && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>WB / Kelvin <span style={styles.hwBadge}>HW</span></span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.proValue}>{Math.round(proValues.colorTemperature ?? proCaps.colorTemperature.min)}K</span>
                      {proModes.whiteBalanceMode === 'manual' && (
                        <button style={styles.proAutoBtn} onClick={() => resetProModeToAuto('whiteBalanceMode')}>AWB</button>
                      )}
                    </div>
                  </div>
                  <input type="range" min={proCaps.colorTemperature.min} max={proCaps.colorTemperature.max} step={proCaps.colorTemperature.step || 50}
                    value={proValues.colorTemperature ?? proCaps.colorTemperature.min}
                    onChange={e => applyProConstraint('colorTemperature', parseFloat(e.target.value))}
                    style={{ ...styles.proSlider, background: 'linear-gradient(to right, #ff8c00, #fff, #87ceeb)' }} />
                  <div style={styles.proRange}>
                    <span>🔥 Warm</span><span>❄️ Cool</span>
                  </div>
                </div>
              )}

              {proCaps && proCaps.brightness && (
                <div style={styles.proGroup}>
                  <div style={styles.proGroupHeader}>
                    <span style={styles.proLabel}>Brightness <span style={styles.hwBadge}>HW</span></span>
                    <span style={styles.proValue}>{Math.round(proValues.brightness ?? proCaps.brightness.min)}</span>
                  </div>
                  <input type="range" min={proCaps.brightness.min} max={proCaps.brightness.max} step={proCaps.brightness.step || 1}
                    value={proValues.brightness ?? proCaps.brightness.min}
                    onChange={e => applyProConstraint('brightness', parseFloat(e.target.value))}
                    style={styles.proSlider} />
                  <div style={styles.proRange}>
                    <span>{proCaps.brightness.min}</span><span>{proCaps.brightness.max}</span>
                  </div>
                </div>
              )}

              {/* ── DIVIDER ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', padding: '0 10px', fontSize: '.6rem', color: '#64748b', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif' }}>Software Processing</span>
              </div>

              {/* ── SOFTWARE CONTROLS (always available) ── */}
              {/* SW Brightness */}
              <div style={styles.proGroup}>
                <div style={styles.proGroupHeader}>
                  <span style={styles.proLabel}>Brightness <span style={styles.swBadge}>SW</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.proValue}>{softDisplay.brightness.toFixed(1)}</span>
                    {softDisplay.brightness !== 1 && <button style={styles.proAutoBtn} onClick={() => handleSoftControl('brightness', 1)}>RESET</button>}
                  </div>
                </div>
                <input type="range" min={0.2} max={3.0} step={0.05}
                  value={softDisplay.brightness}
                  onChange={e => handleSoftControl('brightness', parseFloat(e.target.value))}
                  style={styles.proSlider} />
                <div style={styles.proRange}>
                  <span>Dark</span><span>1.0</span><span>Bright</span>
                </div>
              </div>

              {/* SW Contrast */}
              <div style={styles.proGroup}>
                <div style={styles.proGroupHeader}>
                  <span style={styles.proLabel}>Contrast <span style={styles.swBadge}>SW</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.proValue}>{softDisplay.contrast.toFixed(1)}</span>
                    {softDisplay.contrast !== 1 && <button style={styles.proAutoBtn} onClick={() => handleSoftControl('contrast', 1)}>RESET</button>}
                  </div>
                </div>
                <input type="range" min={0.2} max={3.0} step={0.05}
                  value={softDisplay.contrast}
                  onChange={e => handleSoftControl('contrast', parseFloat(e.target.value))}
                  style={styles.proSlider} />
                <div style={styles.proRange}>
                  <span>Flat</span><span>1.0</span><span>Punchy</span>
                </div>
              </div>

              {/* SW Saturation */}
              <div style={styles.proGroup}>
                <div style={styles.proGroupHeader}>
                  <span style={styles.proLabel}>Saturation <span style={styles.swBadge}>SW</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.proValue}>{softDisplay.saturate.toFixed(1)}</span>
                    {softDisplay.saturate !== 1 && <button style={styles.proAutoBtn} onClick={() => handleSoftControl('saturate', 1)}>RESET</button>}
                  </div>
                </div>
                <input type="range" min={0} max={3.0} step={0.05}
                  value={softDisplay.saturate}
                  onChange={e => handleSoftControl('saturate', parseFloat(e.target.value))}
                  style={styles.proSlider} />
                <div style={styles.proRange}>
                  <span>B&W</span><span>1.0</span><span>Vivid</span>
                </div>
              </div>

              {/* SW Warmth (Color Temperature) */}
              <div style={styles.proGroup}>
                <div style={styles.proGroupHeader}>
                  <span style={styles.proLabel}>Warmth <span style={styles.swBadge}>SW</span></span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={styles.proValue}>{softDisplay.warmth > 0 ? '+' : ''}{softDisplay.warmth.toFixed(1)}</span>
                    {softDisplay.warmth !== 0 && <button style={styles.proAutoBtn} onClick={() => handleSoftControl('warmth', 0)}>RESET</button>}
                  </div>
                </div>
                <input type="range" min={-1} max={1} step={0.05}
                  value={softDisplay.warmth}
                  onChange={e => handleSoftControl('warmth', parseFloat(e.target.value))}
                  style={{ ...styles.proSlider, background: 'linear-gradient(to right, #4682f0, #e8e8e8, #ff8c00)' }} />
                <div style={styles.proRange}>
                  <span>❄️ Cool</span><span>0</span><span>🔥 Warm</span>
                </div>
              </div>

              {/* Reset All Button */}
              <button onClick={resetSoftFilters} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px', borderRadius: 12, cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, fontFamily: 'system-ui, sans-serif', marginTop: 4 }}>
                ↺ Reset All Software Filters
              </button>
            </div>
        </div>
      )}

      {/* External Camera Setup Guide */}
      {showSetupGuide && (
        <div style={styles.settingsOverlay} onClick={() => setShowSetupGuide(false)}>
          <div style={{ ...styles.settingsModal, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <div style={styles.settingsHeader}>
              <button style={styles.backBtn} onClick={() => setShowSetupGuide(false)}>❮</button>
              <h3 style={styles.settingsTitle}>External Camera Setup</h3>
              <div style={{width: 32}}></div>
            </div>

            <div style={styles.settingsBody}>
              {/* DJI Pocket 3 */}
              <div style={styles.settingGroup}>
                <div style={{ ...styles.settingLabel, color: '#00c3ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🎬 DJI Pocket 3 (USB Webcam)
                </div>
                <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Steps:</span>
                  <span style={{ fontSize: '.9rem', color: '#aaa', lineHeight: 1.6 }}>
                    1. Connect DJI Pocket 3 to laptop via <b>USB-C</b> cable{'\n'}
                    2. Power ON the camera{'\n'}
                    3. On camera screen, select <b>"Webcam"</b> mode{'\n'}
                    4. Open this Camera page on your <b>laptop browser</b>{'\n'}
                    5. Go to Settings → Camera Lens → Select <b>"UVC Camera"</b>{'\n'}
                    6. Stream starts automatically!
                  </span>
                  <span style={{ fontSize: '.75rem', color: '#666', marginTop: 4 }}>
                    ✅ Face tracking works in webcam mode • Max 1080p
                  </span>
                </div>
              </div>

              {/* GoPro */}
              <div style={styles.settingGroup}>
                <div style={{ ...styles.settingLabel, color: '#00bceb', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📹 GoPro Hero (USB Webcam)
                </div>
                <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Steps:</span>
                  <span style={{ fontSize: '.9rem', color: '#aaa', lineHeight: 1.6 }}>
                    1. Install <b>GoPro Webcam Utility</b> on your laptop{'\n'}
                    2. Connect GoPro to laptop via <b>USB-C</b> cable{'\n'}
                    3. Power ON the camera — it enters webcam mode automatically{'\n'}
                    4. Check system tray for GoPro icon (confirms detection){'\n'}
                    5. Open this Camera page on your <b>laptop browser</b>{'\n'}
                    6. Go to Settings → Camera Lens → Select <b>"GoPro"</b>
                  </span>
                  <span style={{ fontSize: '.75rem', color: '#666', marginTop: 4 }}>
                    ⚠️ Requires GoPro Webcam Desktop Utility • HERO8 Black and newer
                  </span>
                </div>
              </div>

              {/* HDMI Capture Card */}
              <div style={styles.settingGroup}>
                <div style={{ ...styles.settingLabel, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔌 Any Camera via Capture Card
                </div>
                <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Steps:</span>
                  <span style={{ fontSize: '.9rem', color: '#aaa', lineHeight: 1.6 }}>
                    1. Connect camera's <b>HDMI output</b> to a capture card{'\n'}
                    2. Plug capture card (Elgato/AVerMedia) into <b>laptop USB</b>{'\n'}
                    3. Open this Camera page on your <b>laptop browser</b>{'\n'}
                    4. Go to Settings → Camera Lens → Select the capture device{'\n'}
                    5. Works with ANY camera that has HDMI output!
                  </span>
                  <span style={{ fontSize: '.75rem', color: '#666', marginTop: 4 }}>
                    ✅ Best quality • No special software needed • Works with DSLRs, mirrorless, etc.
                  </span>
                </div>
              </div>

              {/* RTMP Wireless (Event Mode) */}
              <div style={styles.settingGroup}>
                <div style={{ ...styles.settingLabel, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📡 Wireless RTMP (Event Mode — No Cables!)
                </div>
                <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>For DJI Pocket 3:</span>
                  <span style={{ fontSize: '.9rem', color: '#aaa', lineHeight: 1.6 }}>
                    1. Connect DJI Pocket 3 to the <b>event Wi-Fi</b> via DJI Mimo app{'\n'}
                    2. Open Mimo → Live Streaming → Select <b>RTMP</b>{'\n'}
                    3. Enter RTMP URL: <b>rtmp://&lt;server-ip&gt;:1935/live/dji1</b>{'\n'}
                    4. Tap Start — feed appears in Production dashboard!
                  </span>
                  <span style={{ fontWeight: 600, marginTop: 8 }}>For GoPro:</span>
                  <span style={{ fontSize: '.9rem', color: '#aaa', lineHeight: 1.6 }}>
                    1. Open GoPro Quik app → Go Live → Select <b>RTMP</b>{'\n'}
                    2. Connect GoPro to event Wi-Fi or phone hotspot{'\n'}
                    3. Enter RTMP URL: <b>rtmp://&lt;server-ip&gt;:1935/live/gopro1</b>{'\n'}
                    4. Tap Go Live — feed appears in Production dashboard!
                  </span>
                  <span style={{ fontSize: '.75rem', color: '#666', marginTop: 4 }}>
                    ⚡ Requires running the server locally with ENABLE_RTMP=true during events
                  </span>
                </div>
              </div>

              {/* General tip */}
              <div style={{ padding: '12px 16px', background: '#1a2332', borderRadius: 12, borderLeft: '3px solid #3b82f6' }}>
                <span style={{ fontSize: '.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                  <b style={{ color: '#3b82f6' }}>💡 Event Setup:</b> Run the server locally on the production laptop (<code>ENABLE_RTMP=true npm start</code>). Connect all cameras to the same Wi-Fi. DJI/GoPro push RTMP wirelessly → Production dashboard shows all feeds in real-time. No cables needed!
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' },
  video: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
  topHud: { position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(180deg, rgba(0,0,0,.7), transparent)', zIndex: 10, flexWrap: 'wrap' },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.6)', padding: '4px 12px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'system-ui, sans-serif', border: '1px solid rgba(255,255,255,.1)' },
  deviceLabel: { color: '#f8fafc', fontSize: '.85rem', fontWeight: 600, fontFamily: 'system-ui, sans-serif' },
  timer: { color: '#ef4444', fontSize: '.85rem', fontWeight: 700, fontFamily: 'Consolas, monospace', background: 'rgba(0,0,0,.6)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(239,68,68,.3)' },
  fsBtn: { background: 'rgba(0,0,0,.6)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: '1rem' },
  statsBar: { position: 'absolute', top: 52, left: 0, right: 0, padding: '4px 16px', display: 'flex', gap: 16, fontSize: '.7rem', color: '#94a3b8', fontFamily: 'system-ui, sans-serif', zIndex: 10 },
  
  controlsArea: { position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(0deg, rgba(0,0,0,.8), transparent)', zIndex: 10, paddingBottom: 16 },
  
  verticalZoomContainer: { position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.5)', padding: '20px 10px', borderRadius: 30, zIndex: 20, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' },
  verticalZoomLabel: { color: '#fff', fontSize: '.75rem', fontWeight: 700, fontFamily: 'system-ui, sans-serif', textShadow: '0 1px 2px rgba(0,0,0,0.8)' },
  verticalZoomSlider: { WebkitAppearance: 'slider-vertical', height: 160, width: 8, accentColor: '#3b82f6', cursor: 'pointer' },
  
  controls: { display: 'flex', alignItems: 'center', width: '100%', padding: '0 12px', boxSizing: 'border-box', marginTop: 8, overflowX: 'auto', gap: 8, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' },
  controlBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 14, padding: '10px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', backdropFilter: 'blur(8px)', minWidth: 56, flexShrink: 0 },
  controlLabel: { fontSize: '.6rem', color: '#cbd5e1', fontWeight: 600, fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' },

  errorPage: { position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: 'system-ui, sans-serif' },
  errorIcon: { fontSize: '4rem', marginBottom: 16 },
  errorTitle: { color: '#f8fafc', fontSize: '1.5rem', margin: '0 0 8px', textAlign: 'center' },
  errorText: { color: '#94a3b8', fontSize: '.9rem', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 },
  
  // Settings UI
  settingsOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' },
  settingsModal: { background: '#111', width: '100%', maxHeight: '100vh', height: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' },
  settingsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #222', flexShrink: 0, position: 'sticky', top: 0, background: '#111', zIndex: 2 },
  backBtn: { background: '#333', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2rem', flexShrink: 0 },
  settingsTitle: { margin: 0, fontSize: '1.1rem', fontWeight: 600 },
  settingsBody: { padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 },
  settingGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  settingLabel: { fontSize: '.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 8, fontWeight: 600 },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#1c1c1e', borderRadius: 12, cursor: 'pointer', fontSize: '1rem' },
  checkIcon: { color: '#3b82f6', fontWeight: 'bold', fontSize: '1.2rem' },

  // Pro Controls
  proOverlay: { position: 'absolute', left: 0, right: 0, bottom: 110, maxHeight: '55vh', zIndex: 30, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', border: '1px solid rgba(168,85,247,0.2)', borderBottom: 'none' },
  proHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  proTitle: { color: '#c084fc', fontSize: '.9rem', fontWeight: 700, fontFamily: 'system-ui, sans-serif', letterSpacing: 0.5 },
  proCloseBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 14, cursor: 'pointer', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  proSetupBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '4px 10px', borderRadius: 12, cursor: 'pointer', fontSize: '.7rem', fontWeight: 600, fontFamily: 'system-ui, sans-serif' },
  proBody: { padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 },
  proEmpty: { padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: 'system-ui, sans-serif' },
  proGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  proGroupHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  proLabel: { fontSize: '.75rem', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'system-ui, sans-serif' },
  proValue: { fontSize: '.8rem', color: '#e2e8f0', fontWeight: 600, fontFamily: 'Consolas, monospace', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 8 },
  proSlider: { width: '100%', height: 6, accentColor: '#a855f7', cursor: 'pointer', borderRadius: 3 },
  proRange: { display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: '#64748b', fontFamily: 'system-ui, sans-serif' },
  proAutoBtn: { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', padding: '2px 8px', borderRadius: 8, cursor: 'pointer', fontSize: '.65rem', fontWeight: 700, fontFamily: 'system-ui, sans-serif' },
  hwBadge: { display: 'inline-block', fontSize: '.55rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 800, letterSpacing: 0.5, marginLeft: 6, verticalAlign: 'middle' },
  swBadge: { display: 'inline-block', fontSize: '.55rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 800, letterSpacing: 0.5, marginLeft: 6, verticalAlign: 'middle' },
};
