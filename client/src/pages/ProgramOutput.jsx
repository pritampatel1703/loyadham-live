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

  const [pgmId, setPgmId] = useState(() => (urlPgm && urlPgm !== 'null' && urlPgm !== 'undefined') ? urlPgm : storedPgm);
  const [devices, setDevices] = useState([]);
  const [rtmpStreams, setRtmpStreams] = useState([]);
  const [overlayData, setOverlayData] = useState({ active: false, title: '', subtitle: '' });
  const [streamTrigger, setStreamTrigger] = useState(0);

  const pgmVideoRef = useRef(null);
  const rtmpVideoRef = useRef(null);
  const rtmpPlayerRef = useRef(null);
  const receiverVideoRefs = useRef({});

  const peerConns = useRef({});       // streamId -> RTCPeerConnection
  const remoteStreams = useRef({});   // streamId -> MediaStream
  const iceQueues = useRef({});       // streamId -> RTCIceCandidateInit[]
  const cameraSockets = useRef({});   // streamId -> socket.id
  const pgmIdRef = useRef(pgmId);
  pgmIdRef.current = pgmId;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // 1. Play active RTMP stream (clean, unmuted for stream encoders)
  const playRtmp = useCallback((streamKey) => {
    const videoEl = rtmpVideoRef.current;
    if (!videoEl || !mpegts.isSupported()) return;

    if (rtmpPlayerRef.current) {
      try { rtmpPlayerRef.current.destroy(); } catch (_) {}
      rtmpPlayerRef.current = null;
    }

    const flvUrl = `${window.location.protocol}//${window.location.host}/rtmp-flv/live/${streamKey}.flv`;
    console.log('[ProgramOutput] Playing RTMP clean feed:', flvUrl);

    const player = mpegts.createPlayer({
      type: 'flv',
      isLive: true,
      url: flvUrl,
    }, {
      enableWorker: true,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 3.0,
      liveBufferLatencyMinRemain: 0.3,
      autoCleanupSourceBuffer: true,
    });

    player.attachMediaElement(videoEl);
    player.load();
    videoEl.muted = false;
    const p = player.play();
    if (p !== undefined) {
      p.catch(err => {
        console.warn('[ProgramOutput] Autoplay restricted in standard browser, muting until gesture:', err);
        videoEl.muted = true;
        player.play().catch(console.error);
        const unlockAudio = () => {
          videoEl.muted = false;
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
      });
    }

    rtmpPlayerRef.current = player;
  }, []);

  // 2. Attach WebRTC stream to Program monitor
  const attachStreamToPgm = useCallback((stream) => {
    if (!pgmVideoRef.current || !stream) return;
    const video = pgmVideoRef.current;
    if (video.srcObject !== stream) {
      console.log('[ProgramOutput] Attaching stream to PGM video element');
      video.srcObject = stream;
    }
    video.muted = false;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[ProgramOutput] Autoplay restricted, playing muted first:', err);
        video.muted = true;
        video.play().catch(console.error);
        const unlockAudio = () => {
          if (video) video.muted = false;
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
      });
    }
  }, []);

  // 3. Connect to a specific camera stream via WebRTC
  const connectToCamera = useCallback(async (streamId) => {
    if (!streamId) return;

    // Always ensure we are in the signaling room
    if (signalingSocket.connected) {
      signalingSocket.emit('join-room', { roomId: `camera-${streamId}` });
      signalingSocket.emit('request-offer', { roomId: `camera-${streamId}` });
    }

    const existing = peerConns.current[streamId];
    if (existing && typeof existing === 'object' && existing.signalingState !== 'closed') {
      return existing;
    }

    console.log('[ProgramOutput] Connecting to camera:', streamId);
    peerConns.current[streamId] = 'pending';

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      console.log('[ProgramOutput] ontrack received for camera:', streamId);
      const stream = e.streams[0];
      remoteStreams.current[streamId] = stream;

      // Attach to hidden background element
      const recvEl = receiverVideoRefs.current[streamId];
      if (recvEl) {
        recvEl.srcObject = stream;
        recvEl.play().catch(() => {});
      }

      // If this stream is PGM, or if no active PGM stream exists yet, display it immediately!
      if (!pgmIdRef.current || pgmIdRef.current === streamId || !remoteStreams.current[pgmIdRef.current]) {
        console.log('[ProgramOutput] Setting PGM to incoming stream:', streamId);
        setPgmId(streamId);
        attachStreamToPgm(stream);
      }

      setStreamTrigger(t => t + 1);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const target = cameraSockets.current[streamId] || `camera-${streamId}`;
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
        setTimeout(() => connectToCamera(streamId), 2000);
      }
    };

    if (signalingSocket.connected) {
      signalingSocket.emit('join-room', { roomId: `camera-${streamId}` });
      signalingSocket.emit('request-offer', { roomId: `camera-${streamId}` });
    }

    return pc;
  }, [attachStreamToPgm]);

  // 4. Handle incoming WebRTC offers from cameras
  const handleOffer = useCallback(async ({ fromId, sdp, streamId, deviceId }) => {
    const key = streamId || deviceId || pgmIdRef.current || Object.keys(peerConns.current)[0];
    if (!key) return;

    console.log('[ProgramOutput] Offer received from:', fromId, 'for stream:', key);
    cameraSockets.current[key] = fromId;
    let pc = peerConns.current[key];
    if (!pc || pc === 'pending' || pc.signalingState === 'closed') {
      pc = await connectToCamera(key);
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
      console.error('[ProgramOutput] Offer handling error:', err);
    }
  }, [connectToCamera]);

  // 5. Fetch available devices and RTMP streams
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

      // Connect WebRTC to online devices
      fetchedDevs.forEach(d => {
        connectToCamera(d.id);
      });

      // Resolve initial PGM if not set yet
      if (!pgmIdRef.current) {
        const stored = (() => {
          try { return localStorage.getItem('pixel_current_pgm'); } catch (_) { return null; }
        })();
        const initialPgm = stored || fetchedDevs.find(d => d.tally_state === 'program')?.id || fetchedDevs.find(d => d.is_online)?.id || fetchedDevs[0]?.id || (activeRtmp[0] ? `rtmp-${activeRtmp[0].streamKey}` : null);
        if (initialPgm) {
          console.log('[ProgramOutput] Initial PGM resolved to:', initialPgm);
          setPgmId(initialPgm);
        }
      }
    } catch (e) {
      console.error('[ProgramOutput] Error loading sources:', e);
    }
  }, [connectToCamera]);

  // 6. Lifecycle, Sockets, and Cross-Window Synchronization
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
      localStorage.setItem('ag_token', urlToken);
    }

    // Signaling Socket
    signalingSocket.connect();
    signalingSocket.on('offer', handleOffer);

    signalingSocket.on('peer-joined', ({ peerId, roomId }) => {
      console.log('[ProgramOutput] Peer joined room:', roomId, peerId);
      signalingSocket.emit('request-offer', { targetId: peerId, roomId });
    });

    signalingSocket.on('room-peers', ({ peers, roomId }) => {
      console.log('[ProgramOutput] room-peers in room:', roomId, peers);
      if (Array.isArray(peers) && peers.length > 0) {
        peers.forEach(peerId => {
          signalingSocket.emit('request-offer', { targetId: peerId, roomId });
        });
      }
    });

    signalingSocket.on('ice-candidate', async ({ fromId, candidate, streamId, deviceId }) => {
      const key = streamId || deviceId || Object.keys(peerConns.current).find(k => typeof peerConns.current[k] === 'object');
      if (key && peerConns.current[key]) {
        const pc = peerConns.current[key];
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
        } else if (key) {
          if (!iceQueues.current[key]) iceQueues.current[key] = [];
          iceQueues.current[key].push(candidate);
        }
      }
    });

    const onSigConnect = () => {
      console.log('[ProgramOutput] Signaling connected as:', signalingSocket.id);
      signalingSocket.emit('join-room', { roomId: 'pgm-master' });
      signalingSocket.emit('request-offer', { roomId: 'pgm-master' });
      devicesRef.current.forEach(d => {
        signalingSocket.emit('join-room', { roomId: `camera-${d.id}` });
        signalingSocket.emit('request-offer', { roomId: `camera-${d.id}` });
      });
      if (pgmIdRef.current) {
        signalingSocket.emit('join-room', { roomId: `camera-${pgmIdRef.current}` });
        signalingSocket.emit('request-offer', { roomId: `camera-${pgmIdRef.current}` });
      }
    };
    signalingSocket.on('connect', onSigConnect);
    if (signalingSocket.connected) onSigConnect();

    // Production Socket (Tally & State updates)
    productionSocket.connect();
    productionSocket.emit('get-tally');

    productionSocket.on('tally-update', ({ pgmId: newPgmId }) => {
      if (newPgmId) {
        console.log('[ProgramOutput] Tally update PGM:', newPgmId);
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
        devList.forEach(d => connectToCamera(d.id));
      }
    });

    productionSocket.on('rtmp:stream-start', (stream) => {
      setRtmpStreams(prev => {
        if (prev.some(s => s.streamKey === stream.streamKey)) return prev;
        return [...prev, stream];
      });
    });

    productionSocket.on('rtmp:stream-end', ({ streamKey }) => {
      setRtmpStreams(prev => prev.filter(s => s.streamKey !== streamKey));
    });

    productionSocket.on('device:online', loadSources);
    productionSocket.on('device:offline', loadSources);
    productionSocket.on('overlay-update', setOverlayData);

    // Cross-tab / Cross-window instant sync via BroadcastChannel & Storage
    let bc;
    try {
      bc = new BroadcastChannel('pixel_perfect_pgm');
      bc.onmessage = (e) => {
        if (e.data?.pgmId) {
          console.log('[ProgramOutput] BroadcastChannel received PGM:', e.data.pgmId);
          setPgmId(e.data.pgmId);
        }
      };
      // Request active PGM from any open Production tab
      bc.postMessage({ type: 'request_pgm' });
    } catch (_) {}

    const onStorage = (e) => {
      if (e.key === 'pixel_current_pgm' && e.newValue) {
        setPgmId(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);

    loadSources();
    const pollId = setInterval(loadSources, 4000);

    // Periodic room presence & offer request heartbeat every 3s
    const heartbeatId = setInterval(() => {
      if (signalingSocket.connected) {
        if (!remoteStreams.current[pgmIdRef.current]) {
          signalingSocket.emit('join-room', { roomId: 'pgm-master' });
          signalingSocket.emit('request-offer', { roomId: 'pgm-master' });
        }
        if (pgmIdRef.current && !remoteStreams.current[pgmIdRef.current] && !String(pgmIdRef.current).startsWith('rtmp-')) {
          signalingSocket.emit('join-room', { roomId: `camera-${pgmIdRef.current}` });
          signalingSocket.emit('request-offer', { roomId: `camera-${pgmIdRef.current}` });
        }
      }
    }, 3000);

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
      if (rtmpPlayerRef.current) {
        try { rtmpPlayerRef.current.destroy(); } catch (_) {}
        rtmpPlayerRef.current = null;
      }
    };
  }, [handleOffer, loadSources, connectToCamera]);

  // 7. Dynamic Clean Video Switcher
  const isRtmpPgm = Boolean(pgmId && String(pgmId).startsWith('rtmp-'));

  useEffect(() => {
    // If no pgmId set, or current pgmId has no stream, check if ANY stream is active
    if (!pgmId || !remoteStreams.current[pgmId]) {
      const activeStreamId = Object.keys(remoteStreams.current).find(k => remoteStreams.current[k]);
      if (activeStreamId && activeStreamId !== pgmId) {
        console.log('[ProgramOutput] Auto-switching to active stream:', activeStreamId);
        setPgmId(activeStreamId);
        return;
      }
    }

    if (isRtmpPgm) {
      const streamKey = String(pgmId).replace(/^rtmp-/, '');
      playRtmp(streamKey);
      return;
    }

    // Stop RTMP if we switched to a WebRTC camera
    if (rtmpPlayerRef.current) {
      try { rtmpPlayerRef.current.destroy(); } catch (_) {}
      rtmpPlayerRef.current = null;
    }

    if (pgmId) {
      const stream = remoteStreams.current[pgmId];
      if (stream && pgmVideoRef.current) {
        attachStreamToPgm(stream);
      } else if (signalingSocket.connected) {
        signalingSocket.emit('join-room', { roomId: `camera-${pgmId}` });
        signalingSocket.emit('request-offer', { roomId: `camera-${pgmId}` });
      }
    }
  }, [pgmId, streamTrigger, isRtmpPgm, playRtmp, attachStreamToPgm]);

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        width: '100vw',
        height: '100vh',
        background: '#000',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'none', // Hide mouse cursor for clean live stream capture
        userSelect: 'none',
      }}
    >
      {/* Hidden Receiver Video Elements to keep background WebRTC tracks decoding */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {devices.map(d => (
          <video
            key={d.id}
            ref={el => { if (el) receiverVideoRefs.current[d.id] = el; }}
            autoPlay
            playsInline
            muted
          />
        ))}
      </div>

      {/* Main Program WebRTC Video Element (100% Clean Feed) */}
      <video
        ref={pgmVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
          display: !isRtmpPgm ? 'block' : 'none',
          zIndex: 1,
        }}
      />

      {/* RTMP Video Element (100% Clean Feed) */}
      <video
        ref={rtmpVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
          display: isRtmpPgm ? 'block' : 'none',
          zIndex: 2,
        }}
      />

      {/* Lower Third Broadcast Graphics (Only displayed when actively enabled by director) */}
      {overlayData.active && (
        <div style={{ position: 'absolute', bottom: '8%', left: '5%', transition: 'all 0.4s ease', zIndex: 50, pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(220, 38, 38, 0.95)', padding: '10px 32px', color: '#fff', fontSize: '2.2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, borderLeft: '10px solid #fff', boxShadow: '0 10px 25px rgba(0,0,0,0.6)' }}>
            {overlayData.title}
          </div>
          {overlayData.subtitle && (
            <div style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '8px 32px', color: '#94a3b8', fontSize: '1.3rem', fontWeight: 600, display: 'inline-block', borderBottomRightRadius: 8, boxShadow: '0 5px 15px rgba(0,0,0,0.6)' }}>
            {overlayData.subtitle}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
