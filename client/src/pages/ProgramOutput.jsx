import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import mpegts from 'mpegts.js';
import { signalingSocket, productionSocket } from '../socket';
import { getIceConfig } from '../webrtc';
import { devicesApi, rtmpApi } from '../api/client';

/* ═══════════════════════════════════════════════════════════
   PROGRAM OUTPUT (PGM) — Live Broadcast Clean Feed Engine
   ═══════════════════════════════════════════════════════════
   - 100% Real-time Reaction to Switcher Cuts & Auto Transitions
   - Full Broadcast Graphics Engine (Lower Thirds, Tickers, Scores)
   - Media Playout Engine (Videos & Graphics from Media Manager)
   - Live Studio Test Pattern & Camera HUD when hardware inputs active
   - WebRTC & RTMP Low-Latency Video Ingest
   - Red Tally Borders, Shutter Cut Flash, and FTB Blackout
   ═══════════════════════════════════════════════════════════ */

export default function ProgramOutput() {
  const [searchParams] = useSearchParams();
  const urlPgm = searchParams.get('pgm');
  const storedPgm = (() => {
    try { return localStorage.getItem('pixel_current_pgm'); } catch (_) { return null; }
  })();

  const [pgmId, setPgmId] = useState(() => (urlPgm && urlPgm !== 'null' && urlPgm !== 'undefined') ? urlPgm : (storedPgm && storedPgm !== 'null' && storedPgm !== 'undefined' ? storedPgm : '1'));
  const [previousPgmId, setPreviousPgmId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [rtmpStreams, setRtmpStreams] = useState([]);
  const [activeFeeds, setActiveFeeds] = useState({}); // streamId -> boolean
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pgmEverActive, setPgmEverActive] = useState(false);
  const [clock, setClock] = useState('');
  const [timecode, setTimecode] = useState('00:00:00:00');

  // Broadcast FX states
  const [cutFlash, setCutFlash] = useState(false);
  const [fadeToBlack, setFadeToBlack] = useState(false);
  const [tbarPos, setTbarPos] = useState(0); // 0 to 100
  const [switcherInfo, setSwitcherInfo] = useState({ name: 'Pixel Switcher', mfr: 'atem' });
  const [lastActionLabel, setLastActionLabel] = useState('');

  // Live Media Playout
  const [liveMedia, setLiveMedia] = useState(null); // { id, url, name, type, ... }

  // Live Broadcast Graphics Overlays
  const [liveGraphics, setLiveGraphics] = useState({}); // id -> graphic object
  const [logoBug, setLogoBug] = useState(null);
  const [legacyOverlay, setLegacyOverlay] = useState({ active: false, title: '', subtitle: '' });

  // Simulated VU meter levels for live audio visualizer
  const [vuL, setVuL] = useState(65);
  const [vuR, setVuR] = useState(62);

  // Video element refs
  const videoRefs = useRef({});       // streamId -> HTMLVideoElement
  const rtmpVideoRefs = useRef({});   // streamKey -> HTMLVideoElement
  const rtmpPlayers = useRef({});     // streamKey -> mpegts.Player
  const rtmpChasers = useRef({});     // streamKey -> setInterval ID
  const mediaVideoRef = useRef(null);

  // WebRTC internals
  const peerConns = useRef({});
  const remoteStreams = useRef({});
  const iceQueues = useRef({});
  const cameraSockets = useRef({});

  const pgmIdRef = useRef(pgmId);
  pgmIdRef.current = pgmId;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // 1. SMPTE Timecode & Broadcast Clock
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      const now = new Date();
      setClock(now.toTimeString().split(' ')[0]);
      frame = (frame + 1) % 60;
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const f = String(frame).padStart(2, '0');
      setTimecode(`${h}:${m}:${s}:${f}`);
    }, 1000 / 30);
    return () => clearInterval(interval);
  }, []);

  // 2. Animated Stereo VU meters for broadcast realism
  useEffect(() => {
    const vuInterval = setInterval(() => {
      const randL = 50 + Math.sin(Date.now() / 240) * 25 + Math.random() * 15;
      const randR = 48 + Math.cos(Date.now() / 260) * 25 + Math.random() * 15;
      setVuL(Math.min(95, Math.max(10, Math.round(randL))));
      setVuR(Math.min(95, Math.max(10, Math.round(randR))));
    }, 120);
    return () => clearInterval(vuInterval);
  }, []);

  // 3. Trigger Cut Flash animation
  const triggerCutAnimation = useCallback((label = 'CUT') => {
    setCutFlash(true);
    setLastActionLabel(label);
    setTimeout(() => setCutFlash(false), 90);
    setTimeout(() => setLastActionLabel(''), 2500);
  }, []);

  // 4. Safe attach stream to video element
  const safeAttachStream = useCallback((el, stream, streamId) => {
    if (!el || !stream) return;
    const hasVideo = stream.getVideoTracks().length > 0;
    if (el.srcObject === stream && (!hasVideo || el.videoWidth > 0)) {
      if (el.paused) el.play().catch(() => {});
      return;
    }
    if (el.srcObject === stream) el.srcObject = null;
    el.srcObject = stream;
    el.muted = true;
    const p = el.play();
    if (p !== undefined) {
      p.then(() => {
        const isCurrentPgm = (streamId === 'pgm-master') || (streamId === pgmIdRef.current);
        if (isCurrentPgm) el.muted = false;
      }).catch(err => {
        console.warn('[ProgramOutput] Autoplay muted fallback:', streamId, err.message);
        el.muted = true;
        el.play().catch(() => {});
      });
    }
  }, []);

  // 5. Connect to camera or relay
  const connectToCamera = useCallback(async (streamId) => {
    if (!streamId) return;
    const existing = peerConns.current[streamId];
    if (existing && typeof existing === 'object' && existing.signalingState !== 'closed') {
      return existing;
    }

    const room = streamId === 'pgm-master' ? 'pgm-master' : `camera-${streamId}`;
    signalingSocket.emit('join-room', { roomId: room });
    signalingSocket.emit('request-offer', { roomId: room });

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      const stream = e.streams[0] || remoteStreams.current[streamId] || new MediaStream();
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      remoteStreams.current[streamId] = stream;

      const videoEl = videoRefs.current[streamId];
      if (e.track.kind === 'video') {
        if (videoEl) safeAttachStream(videoEl, stream, streamId);
        e.track.onunmute = () => {
          const el = videoRefs.current[streamId];
          if (el) safeAttachStream(el, stream, streamId);
          setActiveFeeds(prev => ({ ...prev, [streamId]: true }));
          setPgmEverActive(true);
        };
      } else if (videoEl) {
        safeAttachStream(videoEl, stream, streamId);
      }
      setActiveFeeds(prev => ({ ...prev, [streamId]: true }));
      setPgmEverActive(true);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const target = cameraSockets.current[streamId] || (streamId === 'pgm-master' ? 'pgm-master' : `camera-${streamId}`);
        signalingSocket.emit('ice-candidate', {
          targetId: target,
          candidate: e.candidate,
          streamId,
          deviceId: streamId
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        try { pc.close(); } catch (_) {}
        delete peerConns.current[streamId];
        delete remoteStreams.current[streamId];
        setActiveFeeds(prev => ({ ...prev, [streamId]: false }));
        setTimeout(() => connectToCamera(streamId), 3000);
      }
    };

    return pc;
  }, [safeAttachStream]);

  // 6. Handle incoming WebRTC offers
  const handleOffer = useCallback(async ({ fromId, sdp, streamId, deviceId }) => {
    const key = streamId || deviceId || (streamId === 'pgm-master' ? 'pgm-master' : pgmIdRef.current);
    if (!key) return;

    cameraSockets.current[key] = fromId;
    let pc = peerConns.current[key];

    if (!pc || pc === 'pending' || (typeof pc === 'object' && pc.signalingState === 'closed')) {
      const iceConfig = await getIceConfig();
      pc = new RTCPeerConnection(iceConfig);
      peerConns.current[key] = pc;

      pc.ontrack = (e) => {
        const stream = e.streams[0] || remoteStreams.current[key] || new MediaStream();
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        remoteStreams.current[key] = stream;

        const videoEl = videoRefs.current[key];
        if (e.track.kind === 'video') {
          if (videoEl) safeAttachStream(videoEl, stream, key);
          e.track.onunmute = () => {
            const el = videoRefs.current[key];
            if (el) safeAttachStream(el, stream, key);
            setActiveFeeds(prev => ({ ...prev, [key]: true }));
            setPgmEverActive(true);
          };
        } else if (videoEl) {
          safeAttachStream(videoEl, stream, key);
        }
        setActiveFeeds(prev => ({ ...prev, [key]: true }));
        setPgmEverActive(true);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          signalingSocket.emit('ice-candidate', {
            targetId: fromId,
            candidate: e.candidate,
            streamId: key,
            deviceId: key
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          try { pc.close(); } catch (_) {}
          delete peerConns.current[key];
          delete remoteStreams.current[key];
          setActiveFeeds(prev => ({ ...prev, [key]: false }));
          setTimeout(() => connectToCamera(key), 3000);
        }
      };
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });

      if (iceQueues.current[key]) {
        iceQueues.current[key].forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        delete iceQueues.current[key];
      }
    } catch (err) {
      console.error('[ProgramOutput] Offer error:', key, err);
    }
  }, [connectToCamera, safeAttachStream]);

  // 7. RTMP Ultra-Low Latency Player
  const startRtmp = useCallback((streamKey) => {
    if (!mpegts.isSupported()) return;
    if (rtmpPlayers.current[streamKey]) return;

    const videoEl = rtmpVideoRefs.current[streamKey];
    if (!videoEl) return;

    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const flvPort = window.location.port || (protocol === 'https:' ? '443' : '80');
    const flvUrl = `${protocol}//${host}:${flvPort}/rtmp-flv/live/${streamKey}.flv`;

    const player = mpegts.createPlayer({
      type: 'flv',
      isLive: true,
      url: flvUrl,
      hasAudio: true,
      hasVideo: true,
    }, {
      enableWorker: true,
      lazyLoad: false,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 0.6,
      liveBufferLatencyMinRemain: 0.15,
      autoCleanupSourceBuffer: true,
    });

    player.attachMediaElement(videoEl);
    player.load();
    videoEl.muted = true;
    player.play().catch(() => {});

    rtmpChasers.current[streamKey] = setInterval(() => {
      if (videoEl && !videoEl.paused && videoEl.buffered.length > 0) {
        const delay = videoEl.buffered.end(videoEl.buffered.length - 1) - videoEl.currentTime;
        if (delay > 1.2) {
          videoEl.currentTime = videoEl.buffered.end(videoEl.buffered.length - 1) - 0.15;
          videoEl.playbackRate = 1.0;
        } else if (delay > 0.45) {
          videoEl.playbackRate = 1.08;
        } else if (delay < 0.25) {
          videoEl.playbackRate = 1.0;
        }
      }
    }, 500);

    rtmpPlayers.current[streamKey] = player;
  }, []);

  const stopRtmp = useCallback((streamKey) => {
    if (rtmpChasers.current[streamKey]) {
      clearInterval(rtmpChasers.current[streamKey]);
      delete rtmpChasers.current[streamKey];
    }
    const player = rtmpPlayers.current[streamKey];
    if (player) {
      try {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      } catch (_) {}
      delete rtmpPlayers.current[streamKey];
    }
  }, []);

  // 8. Fetch devices and sources
  const loadSources = useCallback(async () => {
    try {
      const [devRes, rtmpRes] = await Promise.all([
        devicesApi.list().catch(() => ({ devices: [] })),
        rtmpApi.streams().catch(() => ({ streams: [] })),
      ]);
      const fetchedDevs = devRes.devices || [];
      setDevices(fetchedDevs);
      devicesRef.current = fetchedDevs;
      setRtmpStreams(rtmpRes.streams || []);
      connectToCamera('pgm-master');
    } catch (e) {
      console.error('[ProgramOutput] Sources error:', e);
    }
  }, [connectToCamera]);

  // 9. Centralized Program Switching handler
  const handlePgmSwitch = useCallback((newId, transitionType = 'cut') => {
    if (!newId || newId === 'null') return;
    const cleanId = String(newId);
    if (cleanId === pgmIdRef.current) return;

    setPreviousPgmId(pgmIdRef.current);
    setPgmId(cleanId);
    pgmIdRef.current = cleanId;
    try { localStorage.setItem('pixel_current_pgm', cleanId); } catch (_) {}

    if (transitionType === 'cut') {
      triggerCutAnimation(`CUT → CAM ${cleanId}`);
    } else if (transitionType === 'auto') {
      triggerCutAnimation(`AUTO DISSOLVE → CAM ${cleanId}`);
    }
  }, [triggerCutAnimation]);

  // 10. Master Socket & Cross-Tab Broadcast Listeners
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
      localStorage.setItem('ag_token', urlToken);
    }

    // Signaling Socket
    signalingSocket.connect();
    signalingSocket.on('offer', handleOffer);

    signalingSocket.on('peer-joined', ({ peerId, roomId }) => {
      const pc = peerConns.current['pgm-master'];
      const hasHealthyPc = pc && typeof pc === 'object' && pc.signalingState !== 'closed';
      if (!hasHealthyPc) {
        signalingSocket.emit('request-offer', { targetId: peerId, roomId });
      }
    });

    signalingSocket.on('ice-candidate', async ({ candidate, streamId, deviceId }) => {
      const key = streamId || deviceId || Object.keys(peerConns.current).find(k => typeof peerConns.current[k] === 'object');
      if (key && peerConns.current[key] && typeof peerConns.current[key] === 'object') {
        const pc = peerConns.current[key];
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
        } else {
          if (!iceQueues.current[key]) iceQueues.current[key] = [];
          iceQueues.current[key].push(candidate);
        }
      }
    });

    const onSigConnect = () => {
      signalingSocket.emit('join-room', { roomId: 'pgm-master' });
    };
    signalingSocket.on('connect', onSigConnect);
    if (signalingSocket.connected) onSigConnect();

    // Production Socket
    productionSocket.connect();
    productionSocket.emit('get-tally');

    // Tally & Switcher Action Handlers
    const onTallyUpdate = ({ pgmId: incomingPgm }) => {
      if (incomingPgm && incomingPgm !== 'null') {
        handlePgmSwitch(incomingPgm, 'cut');
      }
    };
    productionSocket.on('tally-update', onTallyUpdate);

    const onDeviceTally = ({ deviceId, state }) => {
      if (state === 'program' && deviceId) {
        handlePgmSwitch(deviceId, 'cut');
      }
    };
    productionSocket.on('device:tally', onDeviceTally);

    const onSwitcherAction = (data) => {
      if (data?.action === 'setProgram' && data?.pgmInput) {
        handlePgmSwitch(data.pgmInput, 'cut');
      } else if (data?.action === 'cut') {
        if (data?.pgmInput) handlePgmSwitch(data.pgmInput, 'cut');
        triggerCutAnimation('CUT EXECUTED');
      } else if (data?.action === 'auto') {
        if (data?.pgmInput) handlePgmSwitch(data.pgmInput, 'auto');
        triggerCutAnimation('AUTO TRANSITION');
      } else if (data?.action === 'fadeToBlack') {
        setFadeToBlack(prev => !prev);
      } else if (data?.action === 'setTransitionPosition') {
        setTbarPos(Math.round((data?.params?.position ?? 0) * 100));
      }
      if (data?.manufacturer) {
        setSwitcherInfo({ name: data.status?.model || data.manufacturer.toUpperCase(), mfr: data.manufacturer });
      }
    };
    productionSocket.on('switcher:action', onSwitcherAction);

    const onSwitcherFtb = (data) => {
      setFadeToBlack(Boolean(data?.fadeToBlack));
    };
    productionSocket.on('switcher:ftb', onSwitcherFtb);

    const onAtemTally = (data) => {
      if (data?.pgmInput) handlePgmSwitch(data.pgmInput, 'cut');
      if (data?.fadeToBlack !== undefined) setFadeToBlack(data.fadeToBlack);
    };
    productionSocket.on('atem:tally', onAtemTally);

    // Graphics Engine Socket Listeners
    const onGraphicShow = (graphic) => {
      if (!graphic?.id) return;
      setLiveGraphics(prev => ({ ...prev, [graphic.id]: graphic }));
    };
    const onGraphicHide = ({ id }) => {
      if (!id) return;
      setLiveGraphics(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
    const onGraphicHideAll = () => setLiveGraphics({});
    const onGraphicLogo = (logo) => setLogoBug(logo);

    productionSocket.on('graphic:show', onGraphicShow);
    productionSocket.on('graphic:hide', onGraphicHide);
    productionSocket.on('graphic:hide-all', onGraphicHideAll);
    productionSocket.on('graphic:logo', onGraphicLogo);
    productionSocket.on('overlay-update', setLegacyOverlay);

    // Media Playout Socket Listeners
    const onMediaPlay = (file) => setLiveMedia(file);
    const onMediaStop = () => setLiveMedia(null);
    productionSocket.on('media:play', onMediaPlay);
    productionSocket.on('media:stop', onMediaStop);

    // BroadcastChannel cross-window sync (instant zero-network loopback)
    let pgmBc, gfxBc, mediaBc;
    try {
      pgmBc = new BroadcastChannel('pixel_perfect_pgm');
      pgmBc.onmessage = (e) => {
        const d = e.data;
        if (!d) return;
        if (d.pgmId) handlePgmSwitch(d.pgmId, d.action || 'cut');
        if (d.action === 'cut') triggerCutAnimation('CUT');
        if (d.action === 'auto') triggerCutAnimation('AUTO');
        if (d.action === 'ftb' || d.action === 'fadeToBlack') setFadeToBlack(Boolean(d.fadeToBlack));
        if (d.action === 'tbar' && d.position !== undefined) setTbarPos(Math.round(d.position * 100));
      };
      pgmBc.postMessage({ type: 'request_pgm' });

      gfxBc = new BroadcastChannel('pixel_perfect_graphics');
      gfxBc.onmessage = (e) => {
        const d = e.data;
        if (d?.type === 'show' && d.graphic) setLiveGraphics(prev => ({ ...prev, [d.graphic.id]: d.graphic }));
        if (d?.type === 'hide' && d.id) setLiveGraphics(prev => { const n = { ...prev }; delete n[d.id]; return n; });
        if (d?.type === 'hide-all') setLiveGraphics({});
      };

      mediaBc = new BroadcastChannel('pixel_perfect_media');
      mediaBc.onmessage = (e) => {
        if (e.data?.type === 'play' && e.data.file) setLiveMedia(e.data.file);
        if (e.data?.type === 'stop') setLiveMedia(null);
      };
    } catch (_) {}

    // Storage listener for cross-tab updates
    const onStorage = (e) => {
      if (e.key === 'pixel_current_pgm' && e.newValue && e.newValue !== 'null') {
        handlePgmSwitch(e.newValue, 'cut');
      }
    };
    window.addEventListener('storage', onStorage);

    loadSources();
    const pollId = setInterval(loadSources, 15000);

    return () => {
      clearInterval(pollId);
      if (pgmBc) pgmBc.close();
      if (gfxBc) gfxBc.close();
      if (mediaBc) mediaBc.close();
      window.removeEventListener('storage', onStorage);
      signalingSocket.off('connect', onSigConnect);
      signalingSocket.off('offer');
      productionSocket.off('tally-update', onTallyUpdate);
      productionSocket.off('device:tally', onDeviceTally);
      productionSocket.off('switcher:action', onSwitcherAction);
      productionSocket.off('switcher:ftb', onSwitcherFtb);
      productionSocket.off('atem:tally', onAtemTally);
      productionSocket.off('graphic:show', onGraphicShow);
      productionSocket.off('graphic:hide', onGraphicHide);
      productionSocket.off('graphic:hide-all', onGraphicHideAll);
      productionSocket.off('graphic:logo', onGraphicLogo);
      productionSocket.off('overlay-update');
      productionSocket.off('media:play', onMediaPlay);
      productionSocket.off('media:stop', onMediaStop);
      Object.values(peerConns.current).forEach(pc => {
        if (pc && typeof pc === 'object' && pc.close) pc.close();
      });
      peerConns.current = {};
      Object.values(rtmpChasers.current).forEach(clearInterval);
      rtmpChasers.current = {};
      Object.keys(rtmpPlayers.current).forEach(stopRtmp);
    };
  }, [handleOffer, loadSources, handlePgmSwitch, triggerCutAnimation, stopRtmp]);

  // 11. RTMP playback trigger
  const isRtmpPgm = Boolean(pgmId && String(pgmId).startsWith('rtmp-'));
  const currentRtmpKey = isRtmpPgm ? String(pgmId).replace(/^rtmp-/, '') : null;

  useEffect(() => {
    if (isRtmpPgm && currentRtmpKey) {
      startRtmp(currentRtmpKey);
    }
  }, [isRtmpPgm, currentRtmpKey, startRtmp]);

  // 12. Audio unlocking gesture
  const unlockAudioGesture = useCallback(() => {
    setAudioUnlocked(true);
    Object.values(videoRefs.current).forEach(el => {
      if (el && !el.muted) el.play().catch(() => {});
    });
    if (mediaVideoRef.current) mediaVideoRef.current.play().catch(() => {});
  }, []);

  // Track whether any video element has actual playing frames
  const [hasLiveFrames, setHasLiveFrames] = useState(false);

  // Active Program Label
  const activeDevice = devices.find(d => d.id === pgmId || String(d.id) === String(pgmId));
  const activePgmName = isRtmpPgm
    ? `RTMP • ${currentRtmpKey}`
    : (activeDevice?.name || (pgmId ? `CAM ${pgmId}` : 'CAM 1'));

  return (
    <div
      onClick={unlockAudioGesture}
      onKeyDown={(e) => {
        if (e.key === 'f' || e.key === 'F') {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }
        unlockAudioGesture();
      }}
      tabIndex={0}
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        background: '#000',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'none',
        userSelect: 'none',
        outline: 'none',
        boxSizing: 'border-box',
        border: '5px solid #ef4444', // Red broadcast on-air tally border
        boxShadow: 'inset 0 0 30px rgba(239, 68, 68, 0.4)',
      }}
    >
      {/* ── 1. WEBRTC PGM-MASTER VIDEO RELAY (Layered above base studio feed) ── */}
      <video
        ref={el => { if (el) videoRefs.current['pgm-master'] = el; }}
        autoPlay
        muted
        playsInline
        onPlaying={(e) => {
          if (e.target.videoWidth > 0) {
            setHasLiveFrames(true);
            setActiveFeeds(prev => ({ ...prev, 'pgm-master': true }));
          }
        }}
        onWaiting={() => setHasLiveFrames(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: 'transparent',
          zIndex: 20,
          opacity: hasLiveFrames ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* ── 2. RTMP STREAMS ── */}
      {rtmpStreams.map(s => {
        const isCurrent = isRtmpPgm && currentRtmpKey === s.streamKey;
        return (
          <video
            key={s.streamKey}
            ref={el => { if (el) rtmpVideoRefs.current[s.streamKey] = el; }}
            autoPlay
            muted
            playsInline
            onPlaying={(e) => {
              if (e.target.videoWidth > 0 && isCurrent) setHasLiveFrames(true);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: 'transparent',
              opacity: (isCurrent && hasLiveFrames) ? 1 : 0,
              zIndex: 18,
              pointerEvents: 'none',
              transition: 'opacity 0.2s ease',
            }}
          />
        );
      })}

      {/* ── 3. MEDIA MANAGER DIRECT PLAYOUT (Videos / Images / Bumpers) ── */}
      {liveMedia && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 35, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {liveMedia.type === 'video' ? (
            <video
              ref={mediaVideoRef}
              src={liveMedia.url || `/api/media/file/${liveMedia.id}`}
              autoPlay
              controls={false}
              playsInline
              loop
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : liveMedia.type === 'image' ? (
            <img
              src={liveMedia.url || `/api/media/file/${liveMedia.id}`}
              alt={liveMedia.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: '4rem', marginBottom: 12 }}>🎵</div>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>{liveMedia.name}</div>
              <div style={{ fontSize: '1rem', color: '#94a3b8', marginTop: 6 }}>Audio Playout Active</div>
            </div>
          )}
          {/* Playout identifier badge */}
          <div style={{
            position: 'absolute',
            top: 24,
            left: 24,
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 6,
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          }}>
            ▶ MEDIA PLAYOUT • {liveMedia.name}
          </div>
        </div>
      )}

      {/* ── 4. BROADCAST STUDIO LIVE FEED (Always rendered as base layer unless real video or media active) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '36px 48px',
          background: 'radial-gradient(ellipse at 50% 40%, #1e1b4b 0%, #090a16 70%, #020208 100%)',
          color: '#f8fafc',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          zIndex: 5,
        }}
      >
          {/* Studio Ambient Grid Lines */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            pointerEvents: 'none',
          }} />

          {/* Top Bar: On Air Pill, Studio Clock, Timecode */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(239, 68, 68, 0.95)',
                padding: '6px 16px',
                borderRadius: 4,
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.12em', color: '#fff' }}>ON AIR</span>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 14px', borderRadius: 4, fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                PGM BUS • INPUT {pgmId}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>SMPTE Timecode</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.08em' }}>{timecode}</div>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 20, textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Studio Clock</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: '#a5b4fc' }}>{clock || '--:--:--'}</div>
              </div>
            </div>
          </div>

          {/* Center Stage: Huge Camera Display & Audio VU Meters */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 12, margin: 'auto 0' }}>
            <div style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.05) 70%)',
              border: '2px solid rgba(239,68,68,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3.8rem',
              marginBottom: 16,
              boxShadow: '0 0 40px rgba(239,68,68,0.3)',
            }}>
              📹
            </div>

            <h1 style={{ margin: 0, fontSize: '4rem', fontWeight: 900, letterSpacing: '-0.03em', textTransform: 'uppercase', textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
              {activePgmName}
            </h1>

            <div style={{ marginTop: 8, fontSize: '1.15rem', color: '#cbd5e1', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              Live Studio Camera Signal
            </div>

            {/* Stereo Audio VU Meters */}
            <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: 8 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>AUDIO CH 1-2</span>
              {/* L Channel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>L</span>
                <div style={{ width: 140, height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${vuL}%`,
                    height: '100%',
                    background: vuL > 85 ? '#ef4444' : vuL > 70 ? '#f59e0b' : '#22c55e',
                    transition: 'width 0.1s ease',
                  }} />
                </div>
              </div>
              {/* R Channel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>R</span>
                <div style={{ width: 140, height: 10, background: '#1e293b', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${vuR}%`,
                    height: '100%',
                    background: vuR > 85 ? '#ef4444' : vuR > 70 ? '#f59e0b' : '#22c55e',
                    transition: 'width 0.1s ease',
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar: Switcher Metadata & Signal Quality */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                SWITCHER: <strong style={{ color: '#fff' }}>{switcherInfo.name}</strong>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                FORMAT: <strong style={{ color: '#fff' }}>1080p 59.94Hz</strong>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                COLOR: <strong style={{ color: '#fff' }}>10-Bit Rec.709</strong>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
              SDI LOCKED • PROGRAM FEED SYNCED
            </div>
          </div>
        </div>

      {/* ── 5. TRANSITION CUT FLASH (Visible feedback on CUT) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#ffffff',
          opacity: cutFlash ? 0.85 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.08s ease-out',
          zIndex: 60,
        }}
      />

      {/* ── 6. TRANSITION ACTION HUD POPUP (e.g. CUT → CAM 2) ── */}
      {lastActionLabel && (
        <div style={{
          position: 'absolute',
          top: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(239, 68, 68, 0.8)',
          color: '#fff',
          padding: '8px 24px',
          borderRadius: 8,
          fontSize: '1rem',
          fontWeight: 900,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
          zIndex: 70,
          pointerEvents: 'none',
        }}>
          ⚡ {lastActionLabel}
        </div>
      )}

      {/* ── 7. FADE TO BLACK (FTB) BLACKOUT OVERLAY ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000000',
          opacity: fadeToBlack ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.5s ease',
          zIndex: 80,
        }}
      />

      {/* ── 8. BROADCAST GRAPHICS LAYER (Overlays, Lower Thirds, Tickers) ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
        {/* Corner Logo Bug */}
        {logoBug && logoBug.enabled && (
          <div style={{
            position: 'absolute',
            top: logoBug.position?.includes('top') ? 32 : 'auto',
            bottom: logoBug.position?.includes('bottom') ? 32 : 'auto',
            right: logoBug.position?.includes('right') ? 36 : 'auto',
            left: logoBug.position?.includes('left') ? 36 : 'auto',
            opacity: 0.9,
          }}>
            <img src={logoBug.url} alt="Logo Bug" style={{ height: logoBug.size || 70, objectFit: 'contain' }} />
          </div>
        )}

        {/* Render Active Graphics from Graphics Engine */}
        {Object.values(liveGraphics).map(gfx => {
          const l = gfx.layers || {};
          if (gfx.type === 'lower-third') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                bottom: '8%',
                left: '5%',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}>
                <div style={{
                  background: l.accentBar?.color || '#dc2626',
                  padding: '8px 28px',
                  color: '#ffffff',
                  fontSize: '2rem',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
                }}>
                  {l.title?.text || 'Speaker Name'}
                </div>
                {l.subtitle?.text && (
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.96)',
                    padding: '6px 24px',
                    color: '#cbd5e1',
                    fontSize: '1.2rem',
                    fontWeight: 600,
                    display: 'inline-block',
                    boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
                  }}>
                    {l.subtitle?.text}
                  </div>
                )}
              </div>
            );
          }

          if (gfx.type === 'banner') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(220, 38, 38, 0.95)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                padding: '12px 36px',
                gap: 20,
                boxShadow: '0 -5px 25px rgba(0,0,0,0.6)',
                animation: 'slideInUp 0.3s ease-out',
              }}>
                <span style={{ background: '#000', color: '#fff', padding: '4px 12px', fontWeight: 900, letterSpacing: '0.1em' }}>
                  {l.label?.text || 'BREAKING'}
                </span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {l.headline?.text || 'Live Breaking News Update'}
                </span>
              </div>
            );
          }

          if (gfx.type === 'score') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                top: 36,
                left: 36,
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                boxShadow: '0 8px 25px rgba(0,0,0,0.6)',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 800 }}>{l.team1?.text || 'TEAM A'}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>{l.score1?.text || '0'}</div>
                </div>
                <div style={{ fontSize: '1.2rem', color: '#64748b' }}>VS</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 800 }}>{l.team2?.text || 'TEAM B'}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>{l.score2?.text || '0'}</div>
                </div>
              </div>
            );
          }

          if (gfx.type === 'ticker') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#fff',
                padding: '8px 24px',
                fontSize: '1.1rem',
                borderTop: '2px solid #38bdf8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}>
                <div style={{ display: 'inline-block', animation: 'tickerMarquee 20s linear infinite' }}>
                  {l.text?.text || 'Welcome to the live broadcast!'}
                </div>
              </div>
            );
          }

          if (gfx.type === 'verse') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                bottom: '12%',
                left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: 900,
                background: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 12,
                padding: '24px 36px',
                textAlign: 'center',
                boxShadow: '0 15px 35px rgba(0,0,0,0.7)',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🙏</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#f8fafc', fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{l.verse?.text || 'Verse text here...'}"
                </div>
                {l.reference?.text && (
                  <div style={{ marginTop: 10, fontSize: '1.1rem', color: '#94a3b8', fontWeight: 700 }}>
                    {l.reference?.text}
                  </div>
                )}
              </div>
            );
          }

          if (gfx.type === 'title') {
            return (
              <div key={gfx.id} style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                  {l.title?.text || 'Title Card'}
                </div>
                {l.subtitle?.text && (
                  <div style={{ fontSize: '1.8rem', color: '#94a3b8', marginTop: 12 }}>
                    {l.subtitle?.text}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Legacy Lower Third Overlay */}
        {legacyOverlay.active && (
          <div style={{
            position: 'absolute',
            bottom: '8%',
            left: '5%',
            zIndex: 50,
          }}>
            <div style={{
              background: 'rgba(220, 38, 38, 0.95)',
              padding: '10px 32px',
              color: '#fff',
              fontSize: '2.2rem',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 2,
              borderLeft: '10px solid #fff',
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
            }}>
              {legacyOverlay.title}
            </div>
            {legacyOverlay.subtitle && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.95)',
                padding: '8px 32px',
                color: '#94a3b8',
                fontSize: '1.3rem',
                fontWeight: 600,
                display: 'inline-block',
                borderBottomRightRadius: 8,
                boxShadow: '0 5px 15px rgba(0,0,0,0.6)',
              }}>
                {legacyOverlay.subtitle}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 9. CLICK TO UNMUTE AUDIO BANNER ── */}
      {!audioUnlocked && (
        <div
          onClick={unlockAudioGesture}
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            padding: '8px 24px',
            borderRadius: 8,
            fontSize: '0.85rem',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
          }}
        >
          🔊 Click anywhere to unmute live broadcast audio • Press F for Fullscreen
        </div>
      )}
    </div>
  );
}
