import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import mpegts from 'mpegts.js';
import { signalingSocket, productionSocket } from '../socket';
import { getIceConfig } from '../webrtc';
import { devicesApi, rtmpApi } from '../api/client';
import BroadcastGraphicItem from '../components/BroadcastGraphicsOverlay';

/* ═══════════════════════════════════════════════════════════
   PROGRAM OUTPUT (PGM) — Clean Live Broadcast Feed
   ═══════════════════════════════════════════════════════════
   Pure clean feed for live output. Only renders:
   - Camera video (WebRTC / RTMP)
   - Broadcast graphics overlays
   - Media playout (video/image/audio)
   - Fade to Black
   NO HUD, NO borders, NO text, NO background — just the feed.
   ═══════════════════════════════════════════════════════════ */

export default function ProgramOutput() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const urlPgm = searchParams.get('pgm');
  const storedPgm = (() => {
    try { return localStorage.getItem('pixel_current_pgm'); } catch (_) { return null; }
  })();

  const initialPgm = (routeId && routeId !== 'pgm') ? routeId : ((urlPgm && urlPgm !== 'null' && urlPgm !== 'undefined') ? urlPgm : (storedPgm && storedPgm !== 'null' && storedPgm !== 'undefined' ? storedPgm : '1'));
  const [pgmId, setPgmId] = useState(initialPgm);
  const [previousPgmId, setPreviousPgmId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [rtmpStreams, setRtmpStreams] = useState([]);
  const [activeFeeds, setActiveFeeds] = useState({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [fadeToBlack, setFadeToBlack] = useState(false);

  // Live Media Playout with CUT / FADE Transitions
  const [liveMedia, setLiveMedia] = useState(null);
  const [mediaError, setMediaError] = useState(false);
  const [mediaOpacity, setMediaOpacity] = useState(1);
  const [mediaTransitionDuration, setMediaTransitionDuration] = useState(600);
  const mediaFadeTimeout = useRef(null);

  useEffect(() => {
    setMediaError(false);
  }, [liveMedia]);

  // Live Broadcast Graphics Overlays
  const [liveGraphics, setLiveGraphics] = useState({});
  const [logoBug, setLogoBug] = useState(null);
  const [legacyOverlay, setLegacyOverlay] = useState({ active: false, title: '', subtitle: '' });

  // Video element refs
  const videoRefs = useRef({});
  const rtmpVideoRefs = useRef({});
  const rtmpPlayers = useRef({});
  const rtmpChasers = useRef({});
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

  // Track whether any video element has actual playing frames
  const [hasLiveFrames, setHasLiveFrames] = useState(false);

  // ── Safe attach stream to video element ──
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
      }).catch(() => {
        el.muted = true;
        el.play().catch(() => {});
      });
    }
  }, []);

  // ── Force high quality on receiver side ──
  const applyReceiverQuality = useCallback((pc) => {
    try {
      pc.getReceivers().forEach(receiver => {
        if (receiver.track?.kind === 'video') {
          const params = receiver.getParameters?.();
          if (params) {
            // Request max quality from sender
            receiver.playoutDelayHint = 0;
          }
        }
      });
    } catch (_) {}
  }, []);

  // ── Embed bandwidth hint in SDP for high quality ──
  const forceHighBitrateReceiveSDP = useCallback((sdp) => {
    // Remove any existing bandwidth limits
    let cleaned = sdp.replace(/b=AS:.*\r\n/g, '');
    // Add high bitrate allowance after m=video line
    const lines = cleaned.split('\r\n');
    const idx = lines.findIndex(l => l.startsWith('m=video'));
    if (idx > -1) lines.splice(idx + 1, 0, 'b=AS:15000');
    return lines.join('\r\n');
  }, []);

  // ── Connect to camera or relay ──
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
          if (streamId === pgmIdRef.current || streamId === 'pgm-master') {
            setHasLiveFrames(true);
          }
        };
      } else if (videoEl) {
        safeAttachStream(videoEl, stream, streamId);
      }
      setActiveFeeds(prev => ({ ...prev, [streamId]: true }));
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
      if (pc.connectionState === 'connected') {
        applyReceiverQuality(pc);
      }
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        try { pc.close(); } catch (_) {}
        delete peerConns.current[streamId];
        delete remoteStreams.current[streamId];
        setActiveFeeds(prev => ({ ...prev, [streamId]: false }));
        setTimeout(() => connectToCamera(streamId), 3000);
      }
    };

    return pc;
  }, [safeAttachStream, applyReceiverQuality]);

  // ── Handle incoming WebRTC offers ──
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
            if (key === pgmIdRef.current || key === 'pgm-master') {
              setHasLiveFrames(true);
            }
          };
        } else if (videoEl) {
          safeAttachStream(videoEl, stream, key);
        }
        setActiveFeeds(prev => ({ ...prev, [key]: true }));
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
        if (pc.connectionState === 'connected') {
          applyReceiverQuality(pc);
        }
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
      // Force high bitrate in the incoming SDP
      const highQualitySdp = { ...sdp, sdp: forceHighBitrateReceiveSDP(sdp.sdp || sdp) };
      const desc = new RTCSessionDescription(typeof highQualitySdp.sdp === 'string' ? highQualitySdp : sdp);
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });

      if (iceQueues.current[key]) {
        iceQueues.current[key].forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        delete iceQueues.current[key];
      }
    } catch (err) {
      console.error('[PGM] Offer error:', key, err);
    }
  }, [connectToCamera, safeAttachStream, forceHighBitrateReceiveSDP, applyReceiverQuality]);

  // ── RTMP Ultra-Low Latency Player ──
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

  // ── Fetch devices and sources ──
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

      const currentPgm = pgmIdRef.current;
      if (currentPgm && currentPgm !== 'pgm-master' && !currentPgm.startsWith('rtmp-')) {
        connectToCamera(currentPgm);
      }
    } catch (e) {
      console.error('[PGM] Sources error:', e);
    }
  }, [connectToCamera]);

  // ── Centralized Program Switching handler ──
  const handlePgmSwitch = useCallback((newId, transitionType = 'cut') => {
    if (!newId || newId === 'null') return;
    const cleanId = String(newId);
    if (cleanId === pgmIdRef.current) return;

    setPreviousPgmId(pgmIdRef.current);
    setPgmId(cleanId);
    pgmIdRef.current = cleanId;
    try { localStorage.setItem('pixel_current_pgm', cleanId); } catch (_) {}

    // Check if the new video element already has frames
    const isRtmp = cleanId.startsWith('rtmp-');
    const newVideo = isRtmp ? rtmpVideoRefs.current[cleanId.replace('rtmp-', '')] : videoRefs.current[cleanId];
    if (newVideo && !newVideo.paused && newVideo.readyState >= 3) {
      setHasLiveFrames(true);
    } else {
      setHasLiveFrames(false);
    }

    // Connect to camera WebRTC if not RTMP
    if (!isRtmp && cleanId !== 'pgm-master') {
      connectToCamera(cleanId);
    }
  }, [connectToCamera]);

  // ── Master Socket & Cross-Tab Broadcast Listeners ──
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
      } else if (data?.action === 'auto') {
        if (data?.pgmInput) handlePgmSwitch(data.pgmInput, 'auto');
      } else if (data?.action === 'fadeToBlack') {
        setFadeToBlack(prev => !prev);
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

    // Media Playout Handlers with CUT and FADE transitions
    const handleMediaPlay = (file) => {
      if (!file) return;
      if (mediaFadeTimeout.current) {
        clearTimeout(mediaFadeTimeout.current);
        mediaFadeTimeout.current = null;
      }
      const isFade = file.transition === 'fade';
      const dur = typeof file.transitionDuration === 'number' ? file.transitionDuration : 600;
      setMediaTransitionDuration(isFade ? dur : 0);

      if (isFade) {
        setMediaOpacity(0);
        setLiveMedia(file);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setMediaOpacity(1);
          });
        });
      } else {
        setMediaOpacity(1);
        setLiveMedia(file);
      }
    };

    const handleMediaStop = (data) => {
      const isFade = data?.transition === 'fade';
      const dur = typeof data?.transitionDuration === 'number' ? data.transitionDuration : 600;
      if (mediaFadeTimeout.current) {
        clearTimeout(mediaFadeTimeout.current);
        mediaFadeTimeout.current = null;
      }

      if (isFade) {
        setMediaTransitionDuration(dur);
        setMediaOpacity(0);
        mediaFadeTimeout.current = setTimeout(() => {
          setLiveMedia(null);
          setMediaOpacity(1);
        }, dur);
      } else {
        setMediaTransitionDuration(0);
        setMediaOpacity(0);
        setLiveMedia(null);
        setMediaOpacity(1);
      }
    };

    productionSocket.on('media:play', handleMediaPlay);
    productionSocket.on('media:stop', handleMediaStop);

    // BroadcastChannel cross-window sync
    let pgmBc, gfxBc, mediaBc;
    try {
      pgmBc = new BroadcastChannel('pixel_perfect_pgm');
      pgmBc.onmessage = (e) => {
        const d = e.data;
        if (!d) return;
        if (d.pgmId) handlePgmSwitch(d.pgmId, d.action || 'cut');
        if (d.action === 'ftb' || d.action === 'fadeToBlack') setFadeToBlack(Boolean(d.fadeToBlack));
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
        if (e.data?.type === 'play' && e.data.file) handleMediaPlay(e.data.file);
        if (e.data?.type === 'stop') handleMediaStop(e.data);
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

    // Initial state synchronization for graphics & media playout
    fetch('/api/graphics/live').then(r => r.json()).then(d => {
      if (d?.graphics && Array.isArray(d.graphics)) {
        const map = {};
        d.graphics.forEach(g => { if (g?.id) map[g.id] = g; });
        setLiveGraphics(prev => ({ ...map, ...prev }));
      }
    }).catch(() => {});

    fetch('/api/graphics/logo').then(r => r.json()).then(d => {
      if (d?.logo) setLogoBug(d.logo);
    }).catch(() => {});

    fetch('/api/media/playout/current').then(r => r.json()).then(d => {
      if (d?.media) {
        setLiveMedia(d.media);
        setMediaOpacity(1);
      }
    }).catch(() => {});

    return () => {
      if (mediaFadeTimeout.current) clearTimeout(mediaFadeTimeout.current);
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
  }, [handleOffer, loadSources, handlePgmSwitch, stopRtmp]);

  // ── RTMP playback trigger ──
  const isRtmpPgm = Boolean(pgmId && String(pgmId).startsWith('rtmp-'));
  const currentRtmpKey = isRtmpPgm ? String(pgmId).replace(/^rtmp-/, '') : null;

  useEffect(() => {
    if (isRtmpPgm && currentRtmpKey) {
      startRtmp(currentRtmpKey);
    }
  }, [isRtmpPgm, currentRtmpKey, startRtmp]);

  // ── Audio unlocking gesture ──
  const unlockAudioGesture = useCallback(() => {
    setAudioUnlocked(true);
    Object.values(videoRefs.current).forEach(el => {
      if (el) { el.muted = false; el.play().catch(() => {}); }
    });
    if (mediaVideoRef.current) { mediaVideoRef.current.muted = false; mediaVideoRef.current.play().catch(() => {}); }
  }, []);

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
      }}
    >
      {/* ── 1. WEBRTC PGM-MASTER VIDEO ── */}
      <video
        ref={el => { if (el) videoRefs.current['pgm-master'] = el; }}
        autoPlay
        playsInline
        onPlaying={(e) => {
          if (e.target.videoWidth > 0 && pgmId === 'pgm-master') {
            setHasLiveFrames(true);
            setActiveFeeds(prev => ({ ...prev, 'pgm-master': true }));
          }
        }}
        onWaiting={() => { if (pgmId === 'pgm-master') setHasLiveFrames(false); }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: 'transparent',
          zIndex: 20,
          opacity: (pgmId === 'pgm-master' && hasLiveFrames) ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.15s ease',
        }}
      />

      {/* ── 2. WEBRTC DEVICE STREAMS ── */}
      {devices.map(d => {
        const isCurrent = String(d.id) === String(pgmId);
        return (
          <video
            key={`cam-${d.id}`}
            ref={el => { if (el) videoRefs.current[d.id] = el; }}
            autoPlay
            playsInline
            onPlaying={(e) => {
              if (e.target.videoWidth > 0 && isCurrent) setHasLiveFrames(true);
            }}
            onWaiting={() => { if (isCurrent) setHasLiveFrames(false); }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: 'transparent',
              opacity: (isCurrent && hasLiveFrames) ? 1 : 0,
              zIndex: 19,
              pointerEvents: 'none',
              transition: 'opacity 0.15s ease',
            }}
          />
        );
      })}

      {/* ── 3. RTMP STREAMS ── */}
      {rtmpStreams.map(s => {
        const isCurrent = isRtmpPgm && currentRtmpKey === s.streamKey;
        return (
          <video
            key={s.streamKey}
            ref={el => { if (el) rtmpVideoRefs.current[s.streamKey] = el; }}
            autoPlay
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
              transition: 'opacity 0.15s ease',
            }}
          />
        );
      })}

      {/* ── 4. MEDIA PLAYOUT (Videos / Images / Audio) ── */}
      {liveMedia && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 35,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: mediaOpacity,
          transition: mediaTransitionDuration > 0 ? `opacity ${mediaTransitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none',
        }}>
          {liveMedia.type === 'video' ? (
            <>
              <video
                ref={mediaVideoRef}
                src={liveMedia.url || `/api/media/file/${liveMedia.id}`}
                autoPlay
                controls={false}
                playsInline
                loop
                onError={() => setMediaError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: mediaError ? 'none' : 'block'
                }}
              />
              {mediaError && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #020617 80%)',
                  color: '#fff',
                  textAlign: 'center',
                  padding: 40,
                }}>
                  <div style={{ fontSize: '4.5rem', marginBottom: 16 }}>🎬</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: '#f8fafc' }}>
                    {liveMedia.name || 'VIDEO PLAYOUT'}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 18,
                    padding: '8px 24px',
                    borderRadius: 30,
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    color: '#60a5fa',
                    fontSize: '1rem',
                    fontWeight: 700,
                    letterSpacing: 1.5,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
                    LIVE MEDIA PLAYOUT • {liveMedia.duration ? `${liveMedia.duration}s` : 'ON AIR'}
                  </div>
                </div>
              )}
            </>
          ) : liveMedia.type === 'image' ? (
            <img
              src={liveMedia.url || `/api/media/file/${liveMedia.id}`}
              alt={liveMedia.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : liveMedia.type === 'audio' ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'radial-gradient(ellipse at center, #1e293b 0%, #020617 80%)',
              color: '#fff',
              textAlign: 'center',
            }}>
              <audio
                autoPlay
                loop
                src={liveMedia.url || `/api/media/file/${liveMedia.id}`}
              />
              <div style={{ fontSize: '4.5rem', marginBottom: 16 }}>🎵</div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: 2 }}>{liveMedia.name}</div>
              <div style={{ color: '#f59e0b', marginTop: 12, fontWeight: 700, letterSpacing: 1.5 }}>
                AUDIO PLAYOUT ACTIVE
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── 5. FADE TO BLACK ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: fadeToBlack ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.5s ease',
          zIndex: 80,
        }}
      />

      {/* ── 6. BROADCAST GRAPHICS LAYER ── */}
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
            <img src={logoBug.url} alt="" style={{ height: logoBug.size || 70, objectFit: 'contain' }} />
          </div>
        )}

        {/* Active Graphics from Graphics Engine (After Effects Broadcast Motion VFX Suite) */}
        {Object.values(liveGraphics).map(gfx => (
          <BroadcastGraphicItem key={gfx.id} gfx={gfx} scale={1} isPreview={false} />
        ))}


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
    </div>
  );
}
