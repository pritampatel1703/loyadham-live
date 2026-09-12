import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import mpegts from 'mpegts.js';
import { signalingSocket, productionSocket } from '../socket';
import { getIceConfig } from '../webrtc';
import { devicesApi, rtmpApi } from '../api/client';

export default function ProgramOutput() {
  const [searchParams] = useSearchParams();
  const urlPgm = searchParams.get('pgm');
  const storedPgm = (() => {
    try { return localStorage.getItem('pixel_current_pgm'); } catch (_) { return null; }
  })();

  const [pgmId, setPgmId] = useState(() => (urlPgm && urlPgm !== 'null' && urlPgm !== 'undefined') ? urlPgm : (storedPgm && storedPgm !== 'null' && storedPgm !== 'undefined' ? storedPgm : null));
  const [devices, setDevices] = useState([]);
  const [rtmpStreams, setRtmpStreams] = useState([]);
  const [overlayData, setOverlayData] = useState({ active: false, title: '', subtitle: '' });
  const [feedUpdate, setFeedUpdate] = useState(0);
  const [activeFeeds, setActiveFeeds] = useState({}); // streamId -> boolean (is producing frames)
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pgmEverActive, setPgmEverActive] = useState(false); // latches true once PGM stream received — never goes back to false
  const [clock, setClock] = useState('');

  // Video element refs
  const videoRefs = useRef({});       // streamId -> HTMLVideoElement (for WebRTC cameras & pgm-master)
  const rtmpVideoRefs = useRef({});   // streamKey -> HTMLVideoElement
  const rtmpPlayers = useRef({});     // streamKey -> mpegts.Player

  // WebRTC internals
  const peerConns = useRef({});       // streamId -> RTCPeerConnection
  const remoteStreams = useRef({});   // streamId -> MediaStream
  const iceQueues = useRef({});       // streamId -> RTCIceCandidateInit[]
  const cameraSockets = useRef({});   // streamId -> socket.id

  const pgmIdRef = useRef(pgmId);
  pgmIdRef.current = pgmId;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // 1. Clock timer for broadcast standby display
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Safely attach stream to video element without triggering AbortError
  const safeAttachStream = useCallback((el, stream, streamId) => {
    if (!el || !stream) return;
    if (el.srcObject === stream) {
      if (el.paused) {
        el.play().catch(() => {});
      }
      return;
    }
    console.log('[ProgramOutput] Attaching stream to video element:', streamId);
    el.srcObject = stream;
    el.muted = true; // start muted for 100% browser autoplay policy compliance
    const p = el.play();
    if (p !== undefined) {
      p.then(() => {
        // Autoplay succeeded — unmute if this is the active PGM feed
        const isCurrentPgm = (streamId === 'pgm-master') || (streamId === pgmIdRef.current);
        if (isCurrentPgm) {
          el.muted = false;
        }
      }).catch(err => {
        console.warn('[ProgramOutput] Autoplay muted fallback for:', streamId, err.message);
        el.muted = true;
        el.play().catch(() => {});
      });
    }
  }, []);

  // 3. Connect to a specific camera or relay via WebRTC
  const connectToCamera = useCallback(async (streamId) => {
    if (!streamId) return;

    // If we already have a healthy connection, reuse it — don't re-emit signaling
    const existing = peerConns.current[streamId];
    if (existing && typeof existing === 'object' && existing.signalingState !== 'closed') {
      return existing;
    }

    // No healthy connection — join room and request an offer
    if (signalingSocket.connected) {
      const room = streamId === 'pgm-master' ? 'pgm-master' : `camera-${streamId}`;
      signalingSocket.emit('join-room', { roomId: room });
      signalingSocket.emit('request-offer', { roomId: room });
    }

    console.log('[ProgramOutput] Connecting WebRTC to stream:', streamId);
    peerConns.current[streamId] = 'pending';

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      console.log('[ProgramOutput] ontrack received for stream:', streamId);
      const stream = e.streams[0];
      remoteStreams.current[streamId] = stream;

      const videoEl = videoRefs.current[streamId];
      if (videoEl) {
        safeAttachStream(videoEl, stream, streamId);
      }

      setActiveFeeds(prev => ({ ...prev, [streamId]: true }));
      setFeedUpdate(n => n + 1);
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
      console.log(`[ProgramOutput] Connection state for ${streamId}:`, pc.connectionState);
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

  // 4. Handle incoming WebRTC offers
  // IMPORTANT: Do NOT call connectToCamera here — it emits join-room/request-offer
  // which would create an infinite signaling loop. Create the PC inline instead.
  const handleOffer = useCallback(async ({ fromId, sdp, streamId, deviceId }) => {
    const key = streamId || deviceId || (streamId === 'pgm-master' ? 'pgm-master' : pgmIdRef.current);
    if (!key) return;

    console.log('[ProgramOutput] WebRTC offer received from:', fromId, 'for stream:', key);
    cameraSockets.current[key] = fromId;
    let pc = peerConns.current[key];

    // Only create a new PC if we don't have one or it's dead
    if (!pc || pc === 'pending' || (typeof pc === 'object' && pc.signalingState === 'closed')) {
      console.log('[ProgramOutput] Creating new PC for stream:', key);
      const iceConfig = await getIceConfig();
      pc = new RTCPeerConnection(iceConfig);
      peerConns.current[key] = pc;

      pc.ontrack = (e) => {
        console.log('[ProgramOutput] ontrack received for stream:', key);
        const stream = e.streams[0];
        remoteStreams.current[key] = stream;
        const videoEl = videoRefs.current[key];
        if (videoEl) safeAttachStream(videoEl, stream, key);
        setActiveFeeds(prev => ({ ...prev, [key]: true }));
        setFeedUpdate(n => n + 1);
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
        console.log(`[ProgramOutput] Connection state for ${key}:`, pc.connectionState);
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          try { pc.close(); } catch (_) {}
          delete peerConns.current[key];
          delete remoteStreams.current[key];
          setActiveFeeds(prev => ({ ...prev, [key]: false }));
          // Reconnect after delay
          setTimeout(() => connectToCamera(key), 3000);
        }
      };
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
      console.log('[ProgramOutput] Answer sent to:', fromId);

      if (iceQueues.current[key]) {
        iceQueues.current[key].forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        delete iceQueues.current[key];
      }
    } catch (err) {
      console.error('[ProgramOutput] Offer error for stream:', key, err);
    }
  }, [connectToCamera, safeAttachStream]);

  // 5. RTMP player initialization
  const startRtmp = useCallback((streamKey) => {
    if (!streamKey || !mpegts.isSupported()) return;
    if (rtmpPlayers.current[streamKey]) return; // already active

    const videoEl = rtmpVideoRefs.current[streamKey];
    if (!videoEl) return;

    const flvUrl = `${window.location.protocol}//${window.location.host}/rtmp-flv/live/${streamKey}.flv`;
    console.log('[ProgramOutput] Starting RTMP stream player:', flvUrl);

    const player = mpegts.createPlayer({
      type: 'flv',
      isLive: true,
      url: flvUrl,
    }, {
      enableWorker: true,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 2.5,
      liveBufferLatencyMinRemain: 0.3,
      autoCleanupSourceBuffer: true,
    });

    player.attachMediaElement(videoEl);
    player.load();
    videoEl.muted = true;
    player.play().catch(() => {});

    player.on(mpegts.Events.ERROR, (type, detail) => {
      console.warn('[ProgramOutput] RTMP error:', type, detail);
    });

    rtmpPlayers.current[streamKey] = player;
  }, []);

  const stopRtmp = useCallback((streamKey) => {
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

  // 6. Fetch devices and RTMP streams
  const loadSources = useCallback(async () => {
    try {
      const [devRes, rtmpRes] = await Promise.all([
        devicesApi.list().catch(() => ({ devices: [] })),
        rtmpApi.streams().catch(() => ({ streams: [] })),
      ]);

      const fetchedDevs = devRes.devices || [];
      setDevices(fetchedDevs);
      devicesRef.current = fetchedDevs;

      const activeRtmp = rtmpRes.streams || [];
      setRtmpStreams(activeRtmp);

      // Only connect to pgm-master relay — NEVER directly to cameras
      // (Production.jsx relays the PGM stream; direct camera connections
      //  would force the phone to encode duplicate WebRTC streams and freeze)
      // connectToCamera already skips if a healthy connection exists
      connectToCamera('pgm-master');

      // Resolve initial PGM or sanitize stale stored ID
      const isCurrentPgmValid = pgmIdRef.current && (
        String(pgmIdRef.current).startsWith('rtmp-') ||
        fetchedDevs.some(d => d.id === pgmIdRef.current)
      );

      if (!pgmIdRef.current || !isCurrentPgmValid) {
        const stored = (() => {
          try { return localStorage.getItem('pixel_current_pgm'); } catch (_) { return null; }
        })();
        const isStoredValid = stored && stored !== 'null' && stored !== 'undefined' && (
          String(stored).startsWith('rtmp-') ||
          fetchedDevs.some(d => d.id === stored)
        );

        const initialPgm = (isStoredValid ? stored : null) ||
          fetchedDevs.find(d => d.is_online && d.tally_state === 'program')?.id ||
          fetchedDevs.find(d => d.is_online)?.id ||
          fetchedDevs.find(d => d.tally_state === 'program')?.id ||
          fetchedDevs[0]?.id ||
          (activeRtmp[0] ? `rtmp-${activeRtmp[0].streamKey}` : null);

        if (initialPgm) {
          console.log('[ProgramOutput] Validated PGM target:', initialPgm);
          setPgmId(initialPgm);
          try { localStorage.setItem('pixel_current_pgm', initialPgm); } catch (_) {}
        }
      }
    } catch (e) {
      console.error('[ProgramOutput] Error loading sources:', e);
    }
  }, [connectToCamera]);

  // 7. Sockets and Lifecycle
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
      localStorage.setItem('ag_token', urlToken);
    }

    // Signaling Socket
    signalingSocket.connect();
    signalingSocket.on('offer', handleOffer);

    signalingSocket.on('peer-joined', ({ peerId, roomId }) => {
      // Only request an offer if we DON'T already have a healthy connection
      const pc = peerConns.current['pgm-master'];
      const hasHealthyPc = pc && typeof pc === 'object' &&
        pc.signalingState !== 'closed' &&
        pc.connectionState !== 'failed' &&
        pc.connectionState !== 'closed';
      if (!hasHealthyPc) {
        console.log('[ProgramOutput] Peer joined room:', roomId, peerId, '— requesting offer');
        signalingSocket.emit('request-offer', { targetId: peerId, roomId });
      }
    });

    signalingSocket.on('room-peers', ({ peers, roomId }) => {
      // Only request offers if we don't already have a healthy connection
      const pc = peerConns.current['pgm-master'];
      const hasHealthyPc = pc && typeof pc === 'object' &&
        pc.signalingState !== 'closed' &&
        pc.connectionState !== 'failed' &&
        pc.connectionState !== 'closed';
      if (!hasHealthyPc && Array.isArray(peers) && peers.length > 0) {
        console.log('[ProgramOutput] Room peers found — requesting offers');
        peers.forEach(peerId => {
          signalingSocket.emit('request-offer', { targetId: peerId, roomId });
        });
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
      console.log('[ProgramOutput] Signaling connected as:', signalingSocket.id);
      // On fresh connect / reconnect, old PCs are stale — clean up
      Object.entries(peerConns.current).forEach(([k, v]) => {
        if (v && typeof v === 'object') { try { v.close(); } catch(_) {} }
        delete peerConns.current[k];
      });
      // Join pgm-master relay room — the server will emit room-peers
      // which will trigger request-offer only if we need it
      signalingSocket.emit('join-room', { roomId: 'pgm-master' });
    };
    signalingSocket.on('connect', onSigConnect);
    if (signalingSocket.connected) onSigConnect();

    // Production Socket
    productionSocket.connect();
    productionSocket.emit('get-tally');

    productionSocket.on('tally-update', ({ pgmId: newPgmId }) => {
      if (newPgmId && newPgmId !== 'null') {
        console.log('[ProgramOutput] Tally PGM:', newPgmId);
        setPgmId(newPgmId);
        try { localStorage.setItem('pixel_current_pgm', newPgmId); } catch (_) {}
      }
    });

    productionSocket.on('device:tally', ({ deviceId, state }) => {
      if (state === 'program' && deviceId) {
        console.log('[ProgramOutput] Device tally PGM:', deviceId);
        setPgmId(deviceId);
        try { localStorage.setItem('pixel_current_pgm', deviceId); } catch (_) {}
      }
    });

    productionSocket.on('devices:state', ({ devices: devList }) => {
      if (devList && devList.length > 0) {
        setDevices(devList);
        devicesRef.current = devList;
      }
    });

    productionSocket.on('rtmp:stream-start', (stream) => {
      setRtmpStreams(prev => {
        if (prev.some(s => s.streamKey === stream.streamKey)) return prev;
        return [...prev, stream];
      });
    });

    productionSocket.on('rtmp:stream-end', ({ streamKey }) => {
      stopRtmp(streamKey);
      setRtmpStreams(prev => prev.filter(s => s.streamKey !== streamKey));
    });

    productionSocket.on('device:online', loadSources);
    productionSocket.on('device:offline', loadSources);
    productionSocket.on('overlay-update', setOverlayData);

    // BroadcastChannel cross-window sync
    let bc;
    try {
      bc = new BroadcastChannel('pixel_perfect_pgm');
      bc.onmessage = (e) => {
        if (e.data?.pgmId) {
          console.log('[ProgramOutput] BroadcastChannel PGM:', e.data.pgmId);
          setPgmId(e.data.pgmId);
        }
      };
      bc.postMessage({ type: 'request_pgm' });
    } catch (_) {}

    const onStorage = (e) => {
      if (e.key === 'pixel_current_pgm' && e.newValue && e.newValue !== 'null') {
        setPgmId(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);

    loadSources();
    // Poll device list less frequently — this is just for UI info, not WebRTC
    const pollId = setInterval(loadSources, 15000);

    // Liveness check: only re-request if the connection dropped
    const heartbeatId = setInterval(() => {
      if (!signalingSocket.connected) return;

      const pc = peerConns.current['pgm-master'];
      const isHealthy = pc && typeof pc === 'object' &&
        pc.connectionState !== 'closed' &&
        pc.connectionState !== 'failed' &&
        pc.connectionState !== 'disconnected';

      if (!isHealthy) {
        console.log('[ProgramOutput] PGM connection unhealthy, reconnecting...');
        delete peerConns.current['pgm-master'];
        delete remoteStreams.current['pgm-master'];
        // Use connectToCamera which handles join + request-offer
        connectToCamera('pgm-master');
      }
    }, 10000);

    return () => {
      clearInterval(pollId);
      clearInterval(heartbeatId);
      if (bc) bc.close();
      window.removeEventListener('storage', onStorage);
      signalingSocket.off('connect', onSigConnect);
      signalingSocket.off('offer');
      signalingSocket.off('peer-joined');
      signalingSocket.off('room-peers');
      signalingSocket.off('ice-candidate');
      productionSocket.off('tally-update');
      productionSocket.off('device:tally');
      productionSocket.off('devices:state');
      productionSocket.off('rtmp:stream-start');
      productionSocket.off('rtmp:stream-end');
      productionSocket.off('device:online');
      productionSocket.off('device:offline');
      productionSocket.off('overlay-update');
      Object.values(peerConns.current).forEach(pc => {
        if (pc && typeof pc === 'object' && pc.close) pc.close();
      });
      peerConns.current = {};
      Object.keys(rtmpPlayers.current).forEach(stopRtmp);
    };
  }, [handleOffer, loadSources, connectToCamera, stopRtmp]);

  // 8. RTMP playback trigger
  const isRtmpPgm = Boolean(pgmId && String(pgmId).startsWith('rtmp-'));
  const currentRtmpKey = isRtmpPgm ? String(pgmId).replace(/^rtmp-/, '') : null;

  useEffect(() => {
    if (isRtmpPgm && currentRtmpKey) {
      startRtmp(currentRtmpKey);
    }
  }, [isRtmpPgm, currentRtmpKey, startRtmp]);

  // 9. Re-attach pgm-master stream when video element mounts or updates
  useEffect(() => {
    if (remoteStreams.current['pgm-master'] && videoRefs.current['pgm-master']) {
      safeAttachStream(videoRefs.current['pgm-master'], remoteStreams.current['pgm-master'], 'pgm-master');
    }
  }, [feedUpdate, safeAttachStream]);

  // 10. Audio routing: unmute only the active feed
  useEffect(() => {
    const hasPgmMaster = Boolean(remoteStreams.current['pgm-master'] && activeFeeds['pgm-master']);

    if (hasPgmMaster) {
      if (videoRefs.current['pgm-master']) videoRefs.current['pgm-master'].muted = false;
      if (currentRtmpKey && rtmpVideoRefs.current[currentRtmpKey]) {
        rtmpVideoRefs.current[currentRtmpKey].muted = true;
      }
    } else if (isRtmpPgm) {
      if (currentRtmpKey && rtmpVideoRefs.current[currentRtmpKey]) {
        rtmpVideoRefs.current[currentRtmpKey].muted = false;
      }
      if (videoRefs.current['pgm-master']) videoRefs.current['pgm-master'].muted = true;
    }
  }, [pgmId, isRtmpPgm, currentRtmpKey, activeFeeds]);

  // 11. User interaction listener to unlock audio policy if blocked by Chrome
  const unlockAudioGesture = useCallback(() => {
    setAudioUnlocked(true);
    Object.values(videoRefs.current).forEach(el => {
      if (el && !el.muted) el.play().catch(() => {});
    });
    Object.values(rtmpVideoRefs.current).forEach(el => {
      if (el && !el.muted) el.play().catch(() => {});
    });
  }, []);

  // Determine which feed is active
  const hasPgmMasterStream = Boolean(remoteStreams.current['pgm-master'] && activeFeeds['pgm-master']);
  const hasRtmpPgmStream = Boolean(isRtmpPgm && currentRtmpKey);

  // Use pgmEverActive for visibility — once active, the video stays visible
  // (prevents black flashes during brief state transitions / reconnections)
  const isAnyFeedActive = pgmEverActive || hasPgmMasterStream || hasRtmpPgmStream;


  // Active PGM Label for display
  const activeDevice = devices.find(d => d.id === pgmId);
  const activePgmName = isRtmpPgm ? `RTMP • ${currentRtmpKey}` : (activeDevice?.name || (pgmId ? `CAM • ${String(pgmId).slice(0, 8)}` : 'AUTO PGM'));

  return (
    <div
      onClick={unlockAudioGesture}
      onKeyDown={unlockAudioGesture}
      tabIndex={0}
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        background: '#000',
        overflow: 'hidden',
        position: 'relative',
        cursor: isAnyFeedActive ? 'none' : 'default',
        userSelect: 'none',
        outline: 'none',
      }}
    >
      {/* ── 1. PGM MASTER RELAY VIDEO ELEMENT (Priority 1) ── */}
      <video
        ref={el => { if (el) videoRefs.current['pgm-master'] = el; }}
        autoPlay
        muted
        playsInline
        onPlaying={() => {
          setActiveFeeds(prev => ({ ...prev, 'pgm-master': true }));
          setPgmEverActive(true); // latch — never goes back to false
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      />

      {/* Direct camera video elements removed — ProgramOutput only uses pgm-master relay */}


      {/* ── 3. RTMP STREAM VIDEO ELEMENTS (Priority 3) ── */}
      {rtmpStreams.map(s => {
        const isCurrentPgm = !hasPgmMasterStream && isRtmpPgm && currentRtmpKey === s.streamKey;
        return (
          <video
            key={s.streamKey}
            ref={el => { if (el) rtmpVideoRefs.current[s.streamKey] = el; }}
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#000',
              opacity: isCurrentPgm ? 1 : 0,
              zIndex: isCurrentPgm ? 5 : 1,
              pointerEvents: 'none',
              transition: 'opacity 0.25s ease',
            }}
          />
        );
      })}

      {/* ── 4. BROADCAST STANDBY CARD (Displays when no video is active) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
          color: '#f8fafc',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          opacity: isAnyFeedActive ? 0 : 1,
          pointerEvents: isAnyFeedActive ? 'none' : 'auto',
          transition: 'opacity 0.6s ease',
          zIndex: 5,
        }}
      >
        {/* Animated Broadcast Live Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 999,
          padding: '8px 20px',
          marginBottom: 24,
        }}>
          <span style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 12px #ef4444',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.15em', color: '#fca5a5', textTransform: 'uppercase' }}>
            Program Output • Standby
          </span>
        </div>

        {/* Title */}
        <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center' }}>
          Pixel Perfect Broadcast Feed
        </h1>

        <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: 10, marginBottom: 32, textAlign: 'center', maxWidth: 600 }}>
          Awaiting live camera feed or director switch. Stream will automatically appear once a camera is connected or selected.
        </p>

        {/* Info Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: 16,
          padding: '16px 28px',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>PGM Target</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>{activePgmName}</div>
          </div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(51, 65, 85, 0.6)', borderRight: '1px solid rgba(51, 65, 85, 0.6)', padding: '0 20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Devices Online</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4ade80', marginTop: 4 }}>
              {devices.filter(d => d.is_online).length} / {devices.length}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Studio Clock</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', marginTop: 4, fontFamily: 'monospace' }}>
              {clock || '--:--:--'}
            </div>
          </div>
        </div>

        {/* Audio unlock helper badge */}
        {!audioUnlocked && (
          <div style={{
            marginTop: 24,
            fontSize: '0.8rem',
            color: '#cbd5e1',
            background: 'rgba(30, 41, 59, 0.8)',
            padding: '6px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            border: '1px solid rgba(71, 85, 105, 0.5)',
          }} onClick={unlockAudioGesture}>
            🔊 Click anywhere to pre-unlock browser audio for live production
          </div>
        )}
      </div>

      {/* ── 5. LOWER THIRD OVERLAY GRAPHICS ── */}
      {overlayData.active && (
        <div style={{
          position: 'absolute',
          bottom: '8%',
          left: '5%',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 50,
          pointerEvents: 'none',
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
            {overlayData.title}
          </div>
          {overlayData.subtitle && (
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
              {overlayData.subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
