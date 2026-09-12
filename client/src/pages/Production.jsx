import { useState, useEffect, useRef, useCallback } from 'react';
import { devicesApi, analyticsApi, streamsApi, vmixApi, rtmpApi, atemApi } from '../api/client';
import { productionSocket, signalingSocket } from '../socket';
import { getIceConfig } from '../webrtc';
import mpegts from 'mpegts.js';

export default function Production() {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pgm, setPgm] = useState(null);
  const pgmRef = useRef(null);
  const [pvw, setPvw] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [vmixConns, setVmixConns] = useState([]);
  const [vmixActive, setVmixActive] = useState(null);
  const [vmixStatus, setVmixStatus] = useState(null);
  const [atemStatus, setAtemStatus] = useState(null);
  const [fullscreen, setFullscreen] = useState(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', label: '', group_name: 'Default' });
  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [isFTB, setIsFTB] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOverlayMixer, setShowOverlayMixer] = useState(false);
  const [overlayData, setOverlayData] = useState({ active: false, title: 'Loyadham Live', subtitle: 'Global Broadcast' });
  const [transSpeed, setTransSpeed] = useState(1);
  const [talkbackOn, setTalkbackOn] = useState(false);
  const talkbackStreamRef = useRef(null);
  const timerRef = useRef(null);
  const recTimerRef = useRef(null);
  const containerRef = useRef(null);
  const videoRefs = useRef({});  // deviceId -> video element
  const pvwVideoRef = useRef(null);
  const pgmVideoRef = useRef(null);
  const transitionVideoRef = useRef(null);
  const pgmContainerRef = useRef(null);
  const iceQueues = useRef({});
  const peerConns = useRef({});  // deviceId -> RTCPeerConnection
  const remoteStreams = useRef({}); // deviceId -> MediaStream
  const pgmRelayPeers = useRef(new Map()); // peerId -> RTCPeerConnection for PGM feed
  const pendingPgmViewers = useRef(new Set()); // viewers waiting for PGM stream
  const sendPgmOfferRef = useRef(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [showAudioMixer, setShowAudioMixer] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [rtmpStreams, setRtmpStreams] = useState([]);   // active RTMP streams
  const [rtmpStatus, setRtmpStatus] = useState(null);   // RTMP server status
  const [qrData, setQrData] = useState(null);
  const rtmpPlayersRef = useRef({});  // streamKey -> mpegts.Player



  const load = async () => {
    try {
      const [d, l, v, a] = await Promise.all([
        devicesApi.list(),
        analyticsApi.logs('', 30),
        vmixApi.connections(),
        atemApi.connections().catch(() => ({ connections: [] }))
      ]);
      const devs = d.devices || [];
      setDevices(devs.length > 0 ? devs : []);
      setLogs(l.logs || []);
      setVmixConns(v.connections || []);
      if (!vmixActive && v.connections?.[0]) setVmixActive(v.connections[0].id);
      if (a.connections?.[0]) {
        atemApi.status(a.connections[0].id).then(st => st?.success && setAtemStatus(st.status)).catch(() => {});
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    // Grab mic for Talkback early so it's ready when cameras connect
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      stream.getAudioTracks().forEach(t => t.enabled = false); // Muted by default
      talkbackStreamRef.current = stream;
    }).catch(err => console.warn('Talkback mic access denied:', err));

    load();
    productionSocket.connect();
    productionSocket.on('device:heartbeat', (data) => {
      setDevices(prev => prev.map(d => d.id === data.device_id ? { ...d, battery_percent: data.battery, signal_quality: data.signal, stream_fps: data.fps, stream_bitrate: data.bitrate, stream_resolution: data.resolution } : d));
    });
    productionSocket.on('device:online', load);
    productionSocket.on('device:offline', load);
    productionSocket.on('device:created', load);
    productionSocket.on('device:deleted', load);
    productionSocket.on('overlay-update', setOverlayData);
    productionSocket.on('log:new', (log) => setLogs(prev => [log, ...prev].slice(0, 50)));

    // Blackmagic ATEM real-time state & hardware tally sync
    productionSocket.on('atem:state', setAtemStatus);
    productionSocket.on('atem:tally', (data) => {
      if (data.pgmInput) {
        setDevices(devList => {
          const matching = devList[data.pgmInput - 1];
          if (matching) setPgm(matching.id);
          return devList;
        });
      }
      if (data.pvwInput) {
        setDevices(devList => {
          const matching = devList[data.pvwInput - 1];
          if (matching) setPvw(matching.id);
          return devList;
        });
      }
    });

    // RTMP stream events (DJI Pocket 3, GoPro, etc.)
    productionSocket.on('rtmp:stream-start', (data) => {
      setRtmpStreams(prev => {
        if (prev.find(s => s.streamKey === data.streamKey)) return prev;
        return [...prev, { streamKey: data.streamKey, streamPath: data.streamPath, flvUrl: data.flvUrl, startTime: Date.now() }];
      });
    });
    productionSocket.on('rtmp:stream-end', (data) => {
      setRtmpStreams(prev => prev.filter(s => s.streamKey !== data.streamKey));
    });

    // Fetch RTMP server status
    rtmpApi.status().then(setRtmpStatus).catch(() => {});
    rtmpApi.streams().then(r => {
      if (r.streams?.length > 0) {
        setRtmpStreams(r.streams.map(s => ({
          streamKey: s.streamKey,
          streamPath: s.streamPath,
          flvUrl: `/rtmp-flv${s.streamPath}.flv`,
          startTime: Date.now() - (s.uptime * 1000),
        })));
      }
    }).catch(() => {});

    const id = setInterval(load, 20000);
    return () => {
      clearInterval(id);
      productionSocket.off('atem:state');
      productionSocket.off('atem:tally');
      productionSocket.disconnect();
    };
  }, []);

  // ── WebRTC: Connect to each online device's camera stream ──
  const connectToCamera = useCallback(async (deviceId) => {
    const existing = peerConns.current[deviceId];
    if (existing) return; // already connected or pending

    peerConns.current[deviceId] = 'pending';
    console.log('[Production] connectToCamera:', deviceId, 'connected:', signalingSocket.connected);

    if (signalingSocket.connected) {
      signalingSocket.emit('join-room', { roomId: `camera-${deviceId}` });
    }
  }, []);

  // Helper: attach stream to video element with retry
  const attachStream = useCallback((deviceId, stream) => {
    const el = videoRefs.current[deviceId];
    if (el) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else {
      requestAnimationFrame(() => {
        const el2 = videoRefs.current[deviceId];
        if (el2) { el2.srcObject = stream; el2.play().catch(() => {}); }
      });
    }
  }, []);

  // Handle incoming offer from camera
  const handleCameraOffer = useCallback(async ({ fromId, sdp, streamId }) => {
    console.log('[Production] Offer received. fromId:', fromId, 'streamId:', streamId);

    const old = peerConns.current[streamId];
    if (old && typeof old === 'object' && old.close) {
      try { old.close(); } catch(e) {}
    }

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      console.log('[Production] ontrack:', streamId);
      remoteStreams.current[streamId] = e.streams[0];
      attachStream(streamId, e.streams[0]);
      setUpdateTrigger(t => t + 1);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('[Production] ICE candidate:', e.candidate.type, e.candidate.protocol, e.candidate.address);
        signalingSocket.emit('ice-candidate', { targetId: fromId, candidate: e.candidate, streamId });
      }
    };

    pc.onicecandidateerror = (e) => {
      console.warn('[Production] ICE candidate error:', e.errorCode, e.errorText, e.url);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Production] ICE:', streamId, pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('[Production] Conn:', streamId, pc.connectionState);
      if (pc.connectionState === 'failed') {
        pc.close();
        delete peerConns.current[streamId];
        delete remoteStreams.current[streamId];
        setTimeout(() => {
          peerConns.current[streamId] = 'pending';
          signalingSocket.emit('join-room', { roomId: `camera-${streamId}` });
        }, 2000);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        delete peerConns.current[streamId];
        delete remoteStreams.current[streamId];
      }
    };

    try {
      if (talkbackStreamRef.current) {
        talkbackStreamRef.current.getTracks().forEach(t => pc.addTrack(t, talkbackStreamRef.current));
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
      console.log('[Production] Answer sent to:', fromId);

      const queue = iceQueues.current[streamId];
      if (queue && queue.length > 0) {
        queue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
        delete iceQueues.current[streamId];
      }
    } catch (err) {
      console.error('[Production] Offer handling error:', err);
    }
  }, [attachStream]);

  // Helper: get current PGM media stream (WebRTC, srcObject, or captureStream fallback)
  const getActivePgmStream = useCallback(() => {
    const currentId = pgmRef.current;
    if (currentId && remoteStreams.current[currentId]) {
      return remoteStreams.current[currentId];
    }
    if (pgmVideoRef.current?.srcObject) {
      return pgmVideoRef.current.srcObject;
    }
    if (pgmVideoRef.current && typeof pgmVideoRef.current.captureStream === 'function') {
      try {
        const stream = pgmVideoRef.current.captureStream();
        if (stream && stream.getVideoTracks().length > 0) return stream;
      } catch (_) {}
    }
    return null;
  }, []);

  // Setup signaling socket & PGM Master Broadcaster
  useEffect(() => {
    signalingSocket.connect();

    const sendPgmOffer = async (peerId) => {
      const activeStream = getActivePgmStream();
      if (!activeStream) {
        console.log('[Production] No PGM stream yet, queuing viewer:', peerId);
        pendingPgmViewers.current.add(peerId);
        return;
      }
      pendingPgmViewers.current.delete(peerId);
      try {
        // If we already have a healthy relay to this peer, don't tear it down
        const existingPc = pgmRelayPeers.current.get(peerId);
        if (existingPc && typeof existingPc === 'object' &&
            existingPc.connectionState !== 'closed' &&
            existingPc.connectionState !== 'failed') {
          // Connection is still healthy — just ensure tracks are up to date
          try {
            const senders = existingPc.getSenders();
            activeStream.getTracks().forEach(track => {
              const sender = senders.find(s => s.track?.kind === track.kind);
              if (sender) sender.replaceTrack(track);
            });
          } catch (_) {}
          console.log('[Production] Reused existing healthy relay for viewer:', peerId);
          return;
        }

        // Close stale/broken relay if any
        if (existingPc && typeof existingPc === 'object') {
          try { existingPc.close(); } catch (_) {}
        }

        const iceConfig = await getIceConfig();
        const pc = new RTCPeerConnection(iceConfig);
        pgmRelayPeers.current.set(peerId, pc);

        activeStream.getTracks().forEach(track => {
          pc.addTrack(track, activeStream);
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            signalingSocket.emit('ice-candidate', {
              targetId: peerId,
              candidate: e.candidate,
              streamId: 'pgm-master',
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
            try { pc.close(); } catch (_) {}
            pgmRelayPeers.current.delete(peerId);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalingSocket.emit('offer', {
          targetId: peerId,
          sdp: pc.localDescription,
          streamId: 'pgm-master',
        });
        console.log('[Production] Sent PGM master offer to viewer:', peerId);
      } catch (err) {
        console.error('[Production] Failed to create PGM relay offer:', err);
      }
    };
    sendPgmOfferRef.current = sendPgmOffer;

    const onConnect = () => {
      console.log('[Production] Socket connected:', signalingSocket.id);
      signalingSocket.emit('join-room', { roomId: 'pgm-master' });
      Object.entries(peerConns.current).forEach(([devId, val]) => {
        if (val === 'pending') signalingSocket.emit('join-room', { roomId: `camera-${devId}` });
      });
    };

    signalingSocket.on('connect', onConnect);
    if (signalingSocket.connected) onConnect();

    signalingSocket.on('offer', handleCameraOffer);

    signalingSocket.on('answer', async ({ fromId, sdp }) => {
      const pc = pgmRelayPeers.current.get(fromId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          console.log('[Production] PGM relay connected to viewer:', fromId);
        } catch (e) {
          console.error('[Production] Error setting answer from viewer:', e);
        }
      }
    });

    signalingSocket.on('peer-joined', ({ peerId, roomId }) => {
      if (!roomId || roomId === 'pgm-master') {
        sendPgmOffer(peerId);
      }
    });

    signalingSocket.on('need-offer', ({ fromId, roomId }) => {
      if (!roomId || roomId === 'pgm-master') {
        sendPgmOffer(fromId);
      }
    });

    signalingSocket.on('ice-candidate', ({ fromId, candidate, streamId }) => {
      const key = streamId || Object.keys(peerConns.current).find(k => typeof peerConns.current[k] === 'object');
      const cameraPc = key ? peerConns.current[key] : null;
      const relayPc = pgmRelayPeers.current.get(fromId);
      const targetPc = (cameraPc && typeof cameraPc === 'object') ? cameraPc : relayPc;

      if (targetPc && targetPc.remoteDescription) {
        targetPc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else if (key) {
        if (!iceQueues.current[key]) iceQueues.current[key] = [];
        iceQueues.current[key].push(candidate);
      }
    });

    return () => {
      signalingSocket.off('connect', onConnect);
      signalingSocket.off('offer');
      signalingSocket.off('answer');
      signalingSocket.off('peer-joined');
      signalingSocket.off('need-offer');
      signalingSocket.off('ice-candidate');
      signalingSocket.disconnect();
      Object.values(peerConns.current).forEach(v => { if (typeof v === 'object' && v.close) v.close(); });
      peerConns.current = {};
      pgmRelayPeers.current.forEach(pc => { try { pc.close(); } catch(_) {} });
      pgmRelayPeers.current.clear();
    };
  }, [handleCameraOffer]);

  // Seamlessly update PGM track on all connected PGM viewers when PGM changes
  // AND flush any pending viewers that were waiting for a stream
  useEffect(() => {
    const activeStream = getActivePgmStream();
    if (!activeStream) return;

    // Update tracks on existing relay peers
    pgmRelayPeers.current.forEach(pc => {
      try {
        const senders = pc.getSenders();
        activeStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) sender.replaceTrack(track);
        });
      } catch (_) {}
    });

    // Flush pending viewers — now there IS a stream to send
    if (pendingPgmViewers.current.size > 0 && sendPgmOfferRef.current) {
      console.log('[Production] Flushing', pendingPgmViewers.current.size, 'pending PGM viewers');
      const viewers = [...pendingPgmViewers.current];
      viewers.forEach(id => sendPgmOfferRef.current(id));
    }
  }, [pgm, updateTrigger]);

  // Auto-connect to online devices
  useEffect(() => {
    devices.filter(d => d.is_online).forEach(d => connectToCamera(d.id));
    // Auto-select first online camera as PGM if none is selected
    if (!pgmRef.current) {
      const firstOnline = devices.find(d => d.is_online);
      if (firstOnline) selectPgm(firstOnline.id);
    }
  }, [devices, connectToCamera]);

  useEffect(() => {
    if (!vmixActive) return;
    const poll = () => vmixApi.status(vmixActive).then(d => { if (d.success) setVmixStatus(d.status); }).catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [vmixActive]);



  const selectPgm = (id) => { 
    setPgm(id);
    pgmRef.current = id;
    try {
      localStorage.setItem('pixel_current_pgm', id);
      if (window.BroadcastChannel) {
        new BroadcastChannel('pixel_perfect_pgm').postMessage({ type: 'pgm_change', pgmId: id, pvwId: pvw });
      }
    } catch (_) {}
    productionSocket.emit('tally-update', { pgmId: id, pvwId: pvw });
    devicesApi.setTally(id, 'program').catch(() => {}); 
    if (pgm && pgm !== id) devicesApi.setTally(pgm, pvw === pgm ? 'preview' : 'off').catch(() => {}); 
  };
  const selectPvw = (id) => { 
    setPvw(id); 
    productionSocket.emit('tally-update', { pgmId: pgm, pvwId: id });
    devicesApi.setTally(id, 'preview').catch(() => {}); 
    if (pvw && pvw !== id) devicesApi.setTally(pvw, pgm === pvw ? 'program' : 'off').catch(() => {}); 
  };

  // Cross-tab synchronization with /output/pgm window
  useEffect(() => {
    let bc;
    try {
      bc = new BroadcastChannel('pixel_perfect_pgm');
      bc.onmessage = (e) => {
        if (e.data?.type === 'request_pgm') {
          const activePgm = pgm || devices.find(d => d.is_online)?.id || devices[0]?.id;
          bc.postMessage({ type: 'pgm_change', pgmId: activePgm, pvwId: pvw });
        }
      };
    } catch (_) {}

    const syncInterval = setInterval(() => {
      try {
        const activePgm = pgm || devices.find(d => d.is_online)?.id;
        if (bc && activePgm) {
          bc.postMessage({ type: 'pgm_change', pgmId: activePgm, pvwId: pvw });
        }
      } catch (_) {}
    }, 2000);

    return () => {
      clearInterval(syncInterval);
      if (bc) bc.close();
    };
  }, [pgm, pvw, devices]);

  const doCut = () => { if (pvw) { const old = pgm; selectPgm(pvw); if (old) selectPvw(old); } };
  const doFade = () => {
    if (!pvw) return;
    setIsFading(true);
    if (transitionVideoRef.current && remoteStreams.current[pvw]) {
      transitionVideoRef.current.srcObject = remoteStreams.current[pvw];
      transitionVideoRef.current.play().catch(()=>{});
    }
    const old = pgm;
    setTimeout(() => { selectPgm(pvw); if (old) selectPvw(old); setIsFading(false); }, transSpeed * 500);
  };
  const doAutoTransition = () => {
    if (!pvw) return;
    setIsFading(true);
    if (transitionVideoRef.current && remoteStreams.current[pvw]) {
      transitionVideoRef.current.srcObject = remoteStreams.current[pvw];
      transitionVideoRef.current.play().catch(()=>{});
    }
    const old = pgm;
    setTimeout(() => { selectPgm(pvw); if (old) selectPvw(old); setIsFading(false); }, transSpeed * 250);
  };

  const doVmixAction = async (action, params) => {
    if (!vmixActive) return;
    try { await vmixApi.action(vmixActive, action, params); load(); } catch (e) { console.error(e); }
  };

  const goLive = () => { setIsLive(true); setElapsed(0); timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000); };
  const goOff = () => { setIsLive(false); clearInterval(timerRef.current); setElapsed(0); };

  const toggleRecord = () => {
    if (isRecording) { setIsRecording(false); clearInterval(recTimerRef.current); setRecElapsed(0); }
    else { setIsRecording(true); setRecElapsed(0); recTimerRef.current = setInterval(() => setRecElapsed(s => s + 1), 1000); }
  };

  const toggleFTB = () => { setIsFTB(f => !f); };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const toggleTalkback = () => {
    const next = !talkbackOn;
    setTalkbackOn(next);
    if (talkbackStreamRef.current) {
      talkbackStreamRef.current.getAudioTracks().forEach(t => t.enabled = next);
    }
  };

  const toggleOverlayGraphic = () => {
    const next = { ...overlayData, active: !overlayData.active };
    setOverlayData(next);
    productionSocket.emit('overlay-update', next);
  };
  
  const updateOverlayText = (field, value) => {
    const next = { ...overlayData, [field]: value };
    setOverlayData(next);
    productionSocket.emit('overlay-update', next);
  };

  const copyPgmLink = () => {
    const url = `${window.location.origin}/output/pgm`;
    navigator.clipboard.writeText(url).then(() => {
      alert('vMix PGM Link Copied! Paste this URL into a vMix Web Browser Input.');
    }).catch(() => alert('Failed to copy.'));
  };

  const fullscreenPgm = async () => {
    if (!pgmContainerRef.current) return;
    if (document.fullscreenElement === pgmContainerRef.current) {
      document.exitFullscreen().catch(()=>{});
      return;
    }
    
    try {
      if ('getScreenDetails' in window) {
        const screenDetails = await window.getScreenDetails();
        const externalScreen = screenDetails.screens.find(s => s !== screenDetails.currentScreen);
        if (externalScreen) {
          await pgmContainerRef.current.requestFullscreen({ screen: externalScreen }).catch(()=>{});
          return;
        }
      }
      await pgmContainerRef.current.requestFullscreen().catch(()=>{});
    } catch (e) {
      console.warn('Fullscreen API error:', e);
    }
  };

  const openPgmDisplay = () => {
    window.open(`${window.location.origin}/output/pgm`, '_blank');
  };

  const showQR = async (id) => {
    try {
      const d = await devicesApi.qr(id);
      setQrData(d);
    } catch (e) {
      alert('Failed to load QR: ' + e.message);
    }
  };

  const addInput = async () => {
    try {
      const created = await devicesApi.create(addForm);
      setShowAddInput(false);
      setAddForm({ name: '', label: '', group_name: 'Default' });
      await load();
      if (created && created.id) {
        showQR(created.id);
      }
    } catch (e) {
      alert('Error creating input: ' + e.message);
    }
  };
  const deleteInput = async (id) => {
    if (!confirm('Remove this input?')) return;
    try {
      await devicesApi.delete(id);
      await load();
    } catch (e) {
      alert('Error removing input: ' + e.message);
    }
  };

  const fmtTime = (s) => { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };

  const pgmDevice = devices.find(d => d.id === pgm);
  const pvwDevice = devices.find(d => d.id === pvw);
  const pgmRtmpStream = rtmpStreams.find(s => `rtmp-${s.streamKey}` === pgm);
  const pvwRtmpStream = rtmpStreams.find(s => `rtmp-${s.streamKey}` === pvw);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input field (just in case we add one later)
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.code === 'Space') { e.preventDefault(); doCut(); return; }
      if (e.code === 'Enter') { e.preventDefault(); doAutoTransition(); return; }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num > 0 && num <= devices.length) {
        const targetDevice = devices[num - 1];
        if (e.shiftKey) {
          selectPvw(targetDevice.id);
        } else {
          selectPgm(targetDevice.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [devices, pgm, pvw]);

  // Sync monitors when pvw/pgm changes or a stream connects
  // Helper: create mpegts player for a monitor video element
  const attachRtmpToMonitor = useCallback((videoEl, streamKey, refKey) => {
    if (!videoEl || !mpegts.isSupported()) return;
    // Destroy old player if exists
    if (rtmpPlayersRef.current[refKey]) {
      try { rtmpPlayersRef.current[refKey].destroy(); } catch(e) {}
      delete rtmpPlayersRef.current[refKey];
    }
    const flvUrl = `${window.location.protocol}//${window.location.host}/rtmp-flv/live/${streamKey}.flv`;
    const player = mpegts.createPlayer({ type: 'flv', isLive: true, url: flvUrl }, {
      enableWorker: true, 
      liveBufferLatencyChasing: true, 
      liveBufferLatencyMaxLatency: 3.0, // Relaxed to prevent stuttering
      liveBufferLatencyMinRemain: 0.3,  // Maintain healthy buffer
      autoCleanupSourceBuffer: true,
    });
    player.attachMediaElement(videoEl);
    player.load();
    player.play().catch(() => {});
    rtmpPlayersRef.current[refKey] = player;
  }, []);

  const detachRtmpFromMonitor = useCallback((refKey) => {
    if (rtmpPlayersRef.current[refKey]) {
      try { rtmpPlayersRef.current[refKey].destroy(); } catch(e) {}
      delete rtmpPlayersRef.current[refKey];
    }
  }, []);

  useEffect(() => {
    if (pvw && pvwVideoRef.current && remoteStreams.current[pvw]) {
      detachRtmpFromMonitor('pvw-monitor');
      if (pvwVideoRef.current.srcObject !== remoteStreams.current[pvw]) {
        pvwVideoRef.current.srcObject = remoteStreams.current[pvw];
        pvwVideoRef.current.play().catch(()=>{});
      }
    } else if (pvwRtmpStream && pvwVideoRef.current) {
      pvwVideoRef.current.srcObject = null;
      attachRtmpToMonitor(pvwVideoRef.current, pvwRtmpStream.streamKey, 'pvw-monitor');
    } else if (pvwVideoRef.current) {
      detachRtmpFromMonitor('pvw-monitor');
      pvwVideoRef.current.srcObject = null;
    }
  }, [pvw, updateTrigger, pvwRtmpStream]);

  useEffect(() => {
    if (pgm && pgmVideoRef.current && remoteStreams.current[pgm]) {
      detachRtmpFromMonitor('pgm-monitor');
      if (pgmVideoRef.current.srcObject !== remoteStreams.current[pgm]) {
        pgmVideoRef.current.srcObject = remoteStreams.current[pgm];
        pgmVideoRef.current.play().catch(()=>{});
      }
    } else if (pgmRtmpStream && pgmVideoRef.current) {
      pgmVideoRef.current.srcObject = null;
      attachRtmpToMonitor(pgmVideoRef.current, pgmRtmpStream.streamKey, 'pgm-monitor');
    } else if (pgmVideoRef.current) {
      detachRtmpFromMonitor('pgm-monitor');
      pgmVideoRef.current.srcObject = null;
    }
  }, [pgm, updateTrigger, pgmRtmpStream]);

  return (
    <div className="vmix-container" ref={containerRef}>
      {/* 1. TOP MENU BAR */}
      <div className="vmix-topbar">
        <div className="vmix-menu-group">
          <button className="vmix-menu-btn">Preset</button>
          <button className="vmix-menu-btn">New</button>
          <button className="vmix-menu-btn">Open</button>
          <button className="vmix-menu-btn">Save</button>
          <button className="vmix-menu-btn">Save As</button>
          <button className="vmix-menu-btn">Last</button>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button className="vmix-menu-btn" onClick={openPgmDisplay} style={{ color: '#22c55e' }}>🖥️ Open HDMI Display</button>
          <button className="vmix-menu-btn" onClick={copyPgmLink} style={{ color: '#3b82f6' }}>🔗 Copy vMix Link</button>
          <button className="vmix-menu-btn" onClick={toggleFullscreen}>Fullscreen</button>
        </div>
        <div className="vmix-menu-group" style={{ borderRight: 'none', borderLeft: '1px solid #2d3748' }}>
          <button 
            className="vmix-menu-btn" 
            style={{ color: talkbackOn ? '#ef4444' : '#94a3b8', fontWeight: talkbackOn ? 'bold' : 'normal', borderRight: '1px solid #2d3748' }} 
            onClick={toggleTalkback}
          >
            {talkbackOn ? '🎙️ TALKBACK ON' : '🎙️ Talkback Off'}
          </button>
          <button className="vmix-menu-btn"  style={paused?{color:'#ef4444'}:{}} onClick={() => setPaused(p => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
          <button className="vmix-menu-btn" onClick={() => setShowSettings(s => !s)}>⚙ Settings</button>
        </div>
      </div>

      {/* 2. MONITORS ROW (Top Half) */}
      <div className="vmix-monitors-row">
        {/* PREVIEW MONITOR (Left, Green) */}
        <div className="vmix-monitor-container">
          <div className="vmix-monitor-header pvw">
            <span>PREVIEW</span>
            <span style={{ fontSize: '.7rem', opacity: 0.9 }}>{pvwRtmpStream ? `🎬 RTMP: ${pvwRtmpStream.streamKey}` : (pvwDevice?.name || 'Blank')}</span>
          </div>
          <div className="vmix-monitor-video">
            <video 
              ref={pvwVideoRef}
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: (pvwDevice?.is_online || pvwRtmpStream) ? 'block' : 'none' }}
            />
            {!pvwDevice?.is_online && !pvwRtmpStream && (
              <span style={{ color: '#475569', fontSize: '1.2rem', fontWeight: 700 }}>PVW OFFLINE</span>
            )}
          </div>
        </div>

        {/* TRANSITION BAR (Center) */}
        <div className="vmix-trans-bar">
          <button className="vmix-trans-btn" onClick={doCut}>Quick Play</button>
          <button className="vmix-trans-btn" onClick={doCut}>Cut</button>
          <button className="vmix-trans-btn" onClick={doFade}>Fade</button>
          <button className="vmix-trans-btn" onClick={doAutoTransition}>Merge</button>
          <button className="vmix-trans-btn" onClick={doAutoTransition}>Wipe</button>
          <button className="vmix-trans-btn" onClick={doAutoTransition}>CubeZoom</button>
          <button className="vmix-trans-btn" style={isFTB?{background:'#ef4444'}:{}} onClick={toggleFTB}>FTB</button>
          
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="vmix-trans-row">{[1,2,3,4].map(n=><button key={n} className="vmix-trans-btn" style={transSpeed===n?{background:'#3b82f6'}:{}} onClick={()=>setTransSpeed(n)}>{n}</button>)}</div>
            <div className="vmix-trans-row">{[5,6,7,8].map(n=><button key={n} className="vmix-trans-btn" style={transSpeed===n?{background:'#3b82f6'}:{}} onClick={()=>setTransSpeed(n)}>{n}</button>)}</div>
            {/* Mock T-Bar */}
            <div style={{ background: '#0f1115', height: 30, borderRadius: 2, marginTop: 4, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 5, bottom: 5, left: '50%', width: 2, background: '#475569', transform: 'translateX(-50%)' }}></div>
              <div style={{ position: 'absolute', left: 4, right: 4, top: '50%', height: 8, background: '#3b82f6', transform: 'translateY(-50%)', borderRadius: 2 }}></div>
            </div>
          </div>
        </div>

        {/* PROGRAM MONITOR (Right, Red) */}
        <div className="vmix-monitor-container">
          <div className="vmix-monitor-header pgm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span>PROGRAM</span>
              <span style={{ fontSize: '.7rem', opacity: 0.9, marginLeft: 8 }}>{pgmRtmpStream ? `🎬 RTMP: ${pgmRtmpStream.streamKey}` : (pgmDevice?.name || 'Blank')}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button 
                onClick={openPgmDisplay}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px' }}
                title="Open in new window for extended monitors"
              >
                🪟
              </button>
              <button 
                onClick={fullscreenPgm} 
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px' }}
                title="Fullscreen Program (can target secondary monitors)"
              >
                ⛶
              </button>
            </div>
          </div>
          <div className="vmix-monitor-video" ref={pgmContainerRef} style={{ position: 'relative' }}>
            <style dangerouslySetInnerHTML={{__html: `video::-webkit-media-controls { display: none !important; }`}} />
            <video 
              ref={pgmVideoRef}
              autoPlay 
              playsInline 
              muted 
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: (pgmDevice?.is_online || pgmRtmpStream) ? 'block' : 'none' }}
            />
            <video 
              ref={transitionVideoRef}
              autoPlay 
              playsInline 
              muted 
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: isFading ? 1 : 0, transition: isFading ? `opacity ${transSpeed * 0.5}s ease` : 'none', pointerEvents: 'none', zIndex: 5 }}
            />
            {!pgmDevice?.is_online && !pgmRtmpStream && (
              <span style={{ color: '#475569', fontSize: '1.2rem', fontWeight: 700 }}>PGM OFFLINE</span>
            )}
            {isLive && (
              <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,.7)', padding: '4px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700, fontSize: '.75rem', animation: 'pulse-badge 2s infinite' }}>
                REC {fmtTime(elapsed)}
              </div>
            )}
            
            {/* OVERLAY GRAPHIC (Lower Third) */}
            <div style={{ position: 'absolute', bottom: '10%', left: '5%', transition: 'all 0.5s ease', opacity: overlayData.active ? 1 : 0, transform: overlayData.active ? 'translateY(0)' : 'translateY(20px)', zIndex: 50, pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(220, 38, 38, 0.95)', padding: '8px 24px', color: '#fff', fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, borderLeft: '8px solid #fff', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                {overlayData.title}
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '6px 24px', color: '#94a3b8', fontSize: '1.1rem', fontWeight: 600, display: 'inline-block', borderBottomRightRadius: 8, boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
                {overlayData.subtitle}
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* 3. MIDDLE DIVIDER */}
      <div className="vmix-divider">
        <div style={{ display: 'flex', gap: 2, height: 16 }}>
          {['#ef4444','#eab308','#22c55e','#3b82f6','#a855f7','#475569'].map(c => <div key={c} style={{ width: 16, background: c }}></div>)}
          <div style={{ width: 16, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: '#fff', border: '1px solid #475569', marginLeft: 4 }}>🔍</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="vmix-menu-btn" style={{ padding: '0 8px', height: 20, background: showOverlayMixer?'#3b82f6':'#334155', borderRadius: 2 }} onClick={() => setShowOverlayMixer(a => !a)}>🎨 Graphics</button>
          <button className="vmix-menu-btn" style={{ padding: '0 8px', height: 20, background: showAudioMixer?'#3b82f6':'#334155', borderRadius: 2 }} onClick={() => setShowAudioMixer(a => !a)}>🔊 Audio Mixer</button>
        </div>
      </div>

      {/* OVERLAYS MIXER PANEL */}
      {showOverlayMixer && (
        <div style={{ background: '#1e293b', borderBottom: '1px solid #0f1115', padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '.9rem' }}>LOWER THIRD</div>
          <input 
            type="text" 
            value={overlayData.title} 
            onChange={(e) => updateOverlayText('title', e.target.value)} 
            placeholder="Main Title" 
            style={{ background: '#0f1115', border: '1px solid #475569', color: '#fff', padding: '4px 8px', borderRadius: 4, width: 200 }} 
          />
          <input 
            type="text" 
            value={overlayData.subtitle} 
            onChange={(e) => updateOverlayText('subtitle', e.target.value)} 
            placeholder="Subtitle" 
            style={{ background: '#0f1115', border: '1px solid #475569', color: '#fff', padding: '4px 8px', borderRadius: 4, width: 300 }} 
          />
          <button 
            onClick={toggleOverlayGraphic}
            style={{ background: overlayData.active ? '#ef4444' : '#22c55e', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}
          >
            {overlayData.active ? 'HIDE GRAPHIC' : 'SHOW GRAPHIC'}
          </button>
        </div>
      )}

      {/* 4. INPUTS GRID (Bottom Half) */}
      <div className="vmix-inputs-area">
        {devices.map((d, i) => (
          <div key={d.id} className="vmix-input">
            {/* Input Header */}
            <div className={`vmix-input-header ${pgm === d.id ? 'pgm' : pvw === d.id ? 'pvw' : 'idle'}`} onClick={() => selectPvw(d.id)}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ background: 'rgba(0,0,0,.3)', padding: '0 4px', borderRadius: 2 }}>{i + 1}</span>
                <span>{d.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ cursor: 'pointer', padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); showQR(d.id); }} title="QR Pair">📱</span>
                <span style={{ cursor: 'pointer', padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); deleteInput(d.id); }} title="Remove Input">✕</span>
              </div>
            </div>
            
            {/* Input Video */}
            <div className="vmix-input-video" onClick={() => selectPvw(d.id)} onDoubleClick={() => selectPgm(d.id)}>
              {d.is_online ? (
                <video
                  ref={el => { if (el) videoRefs.current[d.id] = el; }}
                  autoPlay playsInline muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : <span style={{ color: '#475569', fontSize: '.8rem' }}>Offline</span>}
            </div>
            
            {/* Remote Controls */}
            {d.is_online && (
              <div style={{ display: 'flex', gap: 4, padding: '4px', background: '#0f1115' }}>
                <button className="vmix-input-btn" style={{ flex: 1, padding: '2px 0' }} onClick={() => productionSocket.emit('camera-cmd', { deviceId: d.id, cmd: 'flip' })} title="Flip Camera">🔄</button>
                <button className="vmix-input-btn" style={{ flex: 1, padding: '2px 0' }} onClick={() => productionSocket.emit('camera-cmd', { deviceId: d.id, cmd: 'torch' })} title="Toggle Torch">🔦</button>
                <button className="vmix-input-btn" style={{ flex: 1, padding: '2px 0' }} onClick={() => productionSocket.emit('camera-cmd', { deviceId: d.id, cmd: 'mute' })} title="Toggle Mute">🔇</button>
              </div>
            )}
            
            {/* Input Footer */}
            <div className="vmix-input-footer">
              <button className="vmix-input-btn" onClick={() => selectPgm(d.id)}>GO</button>
              <button className="vmix-input-btn" style={{ background: pgm === d.id ? '#ef4444' : '#334155' }} onClick={() => selectPgm(d.id)}>Cut</button>
              <button className="vmix-input-btn" onClick={() => { selectPvw(d.id); setTimeout(doCut, transSpeed * 500); }}>Fade</button>
              <button className="vmix-input-btn" style={{ marginLeft: 'auto' }} onClick={() => selectPvw(d.id)}>⚙️</button>
            </div>
          </div>
        ))}

        {/* RTMP Stream Inputs (DJI Pocket 3, GoPro, etc.) */}
        {rtmpStreams.map((stream) => (
          <div
            key={`rtmp-${stream.streamKey}`}
            className="vmix-input"
            style={{ border: '2px solid #00c3ff' }}
          >
            <div className="vmix-input-header" style={{ background: '#00c3ff22' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00c3ff', boxShadow: '0 0 6px #00c3ff' }}></span>
                <span>🎬 RTMP: {stream.streamKey}</span>
              </div>
            </div>
            <div className="vmix-input-video" style={{ position: 'relative' }}>
              <video
                ref={el => {
                  if (el && !rtmpPlayersRef.current[stream.streamKey]) {
                    // Initialize mpegts.js player for this RTMP stream
                    if (mpegts.isSupported()) {
                      const flvUrl = `${window.location.protocol}//${window.location.host}/rtmp-flv/live/${stream.streamKey}.flv`;
                      console.log('[RTMP] Initializing player for:', flvUrl);
                      
                      const player = mpegts.createPlayer({
                        type: 'flv',
                        isLive: true,
                        url: flvUrl,
                      }, {
                        enableWorker: true,
                        lazyLoadMaxDuration: 3, 
                        seekType: 'range',
                        liveBufferLatencyChasing: true,
                        liveBufferLatencyMaxLatency: 3.0, // Relaxed to prevent stuttering
                        liveBufferLatencyMinRemain: 0.3,  // Maintain healthy buffer
                        autoCleanupSourceBuffer: true,
                      });

                      player.on(mpegts.Events.ERROR, (type, detail, info) => {
                        console.error('[RTMP Player Error]', type, detail, info);
                        // If it's a decode error, it's likely H.265 issue
                        if (detail === mpegts.ErrorDetails.DECODE_ERROR) {
                          alert('RTMP Error: Your camera might be using H.265. Please change it to H.264 in the DJI app settings!');
                        }
                      });

                      player.attachMediaElement(el);
                      player.load();
                      const playPromise = player.play();
                      if (playPromise !== undefined) {
                        playPromise.catch(error => {
                          console.warn('[RTMP] Auto-play prevented, waiting for user interaction:', error);
                        });
                      }
                      rtmpPlayersRef.current[stream.streamKey] = player;
                    }
                  }
                }}
                autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <span style={{ position: 'absolute', top: 4, right: 4, background: '#00c3ff', color: '#000', fontSize: '.55rem', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>RTMP</span>
            </div>
            <div className="vmix-input-footer">
              <button className="vmix-input-btn" onClick={() => selectPgm(`rtmp-${stream.streamKey}`)}>GO</button>
              <button className="vmix-input-btn" style={{ background: pgm === `rtmp-${stream.streamKey}` ? '#ef4444' : '#334155' }} onClick={() => selectPgm(`rtmp-${stream.streamKey}`)}>Cut</button>
              <button className="vmix-input-btn" onClick={() => { selectPvw(`rtmp-${stream.streamKey}`); setTimeout(doCut, transSpeed * 500); }}>Fade</button>
              <button className="vmix-input-btn" style={{ marginLeft: 'auto' }} onClick={() => selectPvw(`rtmp-${stream.streamKey}`)}>⚙️</button>
            </div>
          </div>
        ))}
      </div>

      {/* 5. BOTTOM STATUS BAR */}
      <div className="vmix-bottom-bar">
        <div className="vmix-bottom-controls">
          <button className="vmix-action-btn" style={{ marginRight: 16 }} onClick={() => setShowAddInput(true)}>Add Input ▾</button>
          <button className={`vmix-action-btn ${isRecording ? 'active' : ''}`} onClick={toggleRecord}>{isRecording ? `● REC ${fmtTime(recElapsed)}` : 'Record'}</button>
          <button className="vmix-action-btn" style={rtmpStatus?.enabled ? { background: '#00c3ff22', color: '#00c3ff', border: '1px solid #00c3ff44' } : {}} title={rtmpStatus?.enabled ? `RTMP: ${rtmpStatus.rtmpUrl}` : 'RTMP disabled (set ENABLE_RTMP=true)'}>
            {rtmpStatus?.enabled ? `🎬 RTMP (${rtmpStreams.length} stream${rtmpStreams.length !== 1 ? 's' : ''})` : 'External'}
          </button>
          <button
            className="vmix-action-btn"
            style={atemStatus?.connected ? { background: 'rgba(0,188,212,0.2)', color: '#00bcd4', border: '1px solid rgba(0,188,212,0.5)' } : {}}
            title={atemStatus?.connected ? `Blackmagic ${atemStatus.model || 'ATEM'} Online (Click to Open Controls)` : 'Blackmagic ATEM Standby (Click to Open Controls)'}
            onClick={() => window.open('/atem', '_blank')}
          >
            {atemStatus?.connected ? `🎚️ ATEM (${atemStatus.model || 'Online'})` : '🎚️ ATEM'}
          </button>
          <button className={`vmix-action-btn ${isLive ? 'active' : ''}`} onClick={isLive ? goOff : goLive}>{isLive ? `● LIVE ${fmtTime(elapsed)}` : 'Stream ▾'}</button>
          <button className="vmix-action-btn">MultiCorder</button>
          <button className="vmix-action-btn">PlayList</button>
          
          <div style={{ flex: 1 }}></div>
          <button className={`vmix-action-btn ${overlayActive ? 'active' : ''}`} onClick={() => setOverlayActive(o => !o)}>Overlay</button>
          <div style={{ display: 'flex', gap: 2 }}>
            <div style={{ width: 12, height: 12, background: '#eab308' }}></div>
            <div style={{ width: 12, height: 12, background: '#22c55e' }}></div>
            <div style={{ width: 12, height: 12, background: '#ef4444' }}></div>
          </div>
          <span style={{ fontSize: '.8rem' }}>🔒</span>
        </div>
        
        <div className="vmix-bottom-stats">
          <div className="vmix-stat-item" style={{ color: '#22c55e' }}>{pgmDevice?.stream_resolution || '1080p29.97'}</div>
          <div className="vmix-stat-item">EX FPS: <span className="vmix-stat-val">{pgmDevice?.stream_fps || 30}</span></div>
          <div className="vmix-stat-item">Render Time: <span className="vmix-stat-val">1 ms</span></div>
          <div className="vmix-stat-item">GPU Mem: <span className="vmix-stat-val">2 %</span></div>
          <div className="vmix-stat-item">CPU vMix: <span className="vmix-stat-val">1 %</span></div>
          <div className="vmix-stat-item">Total: <span className="vmix-stat-val">33 %</span></div>
        </div>
      </div>

      {/* FTB OVERLAY */}
      {isFTB && <div style={{ position:'fixed',inset:0,background:'#000',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }} onClick={toggleFTB}><span style={{color:'#ef4444',fontSize:'2rem',fontWeight:900,animation:'pulse-badge 1s infinite'}}>FADE TO BLACK — Click to restore</span></div>}

      {/* QR MODAL */}
      {qrData && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setQrData(null)}>
          <div style={{background:'#1e293b',border:'1px solid #475569',borderRadius:12,padding:32,width:380,textAlign:'center',boxShadow:'0 20px 40px rgba(0,0,0,0.5)'}} onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 16px',color:'#f8fafc',fontSize:'1.4rem'}}>📱 Scan to Pair</h3>
            <img src={qrData.qr} alt="QR Code" style={{ width: 260, borderRadius: 16, margin: '16px auto', display:'block', background:'#fff', padding:8 }} />
            <p style={{ fontFamily: 'monospace', color: '#00c3ff', fontSize: '1.2rem', fontWeight:800, marginTop: 12, letterSpacing:2 }}>{qrData.pairing_token}</p>
            {qrData.camera_url && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: '.75rem', color: '#94a3b8', marginBottom: 12, wordBreak: 'break-all', padding:'0 12px' }}>{qrData.camera_url}</p>
                <a href={qrData.camera_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '12px 24px', background:'#3b82f6', color:'#fff', textDecoration: 'none', borderRadius:6, fontWeight:600 }}>
                  🎥 Open Camera Locally
                </a>
              </div>
            )}
            <p style={{ color: '#94a3b8', fontSize: '.85rem', marginTop: 24, lineHeight:1.5 }}>Scan this QR code with the Loyadham Live mobile app to connect the camera.</p>
            <div style={{display:'flex',justifyContent:'center', marginTop:24}}><button style={{padding:'10px 24px',background:'#334155',border:'none',borderRadius:6,color:'#fff',fontWeight:600,cursor:'pointer'}} onClick={() => setQrData(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ADD INPUT MODAL */}
      {showAddInput && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowAddInput(false)}>
          <div style={{background:'#1e293b',border:'1px solid #475569',borderRadius:8,padding:24,width:380}} onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 16px',color:'#f8fafc'}}>➕ Add Input</h3>
            <div style={{marginBottom:12}}><label style={{fontSize:'.75rem',color:'#94a3b8',display:'block',marginBottom:4}}>Name</label><input style={{width:'100%',padding:'8px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:4,color:'#f8fafc',boxSizing:'border-box'}} value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} placeholder="Camera 1" /></div>
            <div style={{marginBottom:12}}><label style={{fontSize:'.75rem',color:'#94a3b8',display:'block',marginBottom:4}}>Label</label><input style={{width:'100%',padding:'8px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:4,color:'#f8fafc',boxSizing:'border-box'}} value={addForm.label} onChange={e => setAddForm({...addForm, label: e.target.value})} placeholder="Main Hall" /></div>
            <div style={{marginBottom:16}}><label style={{fontSize:'.75rem',color:'#94a3b8',display:'block',marginBottom:4}}>Group</label><input style={{width:'100%',padding:'8px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:4,color:'#f8fafc',boxSizing:'border-box'}} value={addForm.group_name} onChange={e => setAddForm({...addForm, group_name: e.target.value})} /></div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button style={{padding:'8px 16px',background:'#334155',border:'none',borderRadius:4,color:'#fff',cursor:'pointer'}} onClick={() => setShowAddInput(false)}>Cancel</button><button style={{padding:'8px 16px',background:'#22c55e',border:'none',borderRadius:4,color:'#fff',fontWeight:700,cursor:'pointer'}} onClick={addInput}>Create</button></div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowSettings(false)}>
          <div style={{background:'#1e293b',border:'1px solid #475569',borderRadius:8,padding:24,width:420}} onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 16px',color:'#f8fafc'}}>⚙ Settings</h3>
            <div style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'#cbd5e1',fontSize:'.85rem'}}>Transition Speed</span><span style={{color:'#3b82f6',fontWeight:700}}>{transSpeed}x ({transSpeed * 500}ms)</span></div>
            <div style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'#cbd5e1',fontSize:'.85rem'}}>Total Inputs</span><span style={{color:'#22c55e',fontWeight:700}}>{devices.length}</span></div>
            <div style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'#cbd5e1',fontSize:'.85rem'}}>Online</span><span style={{color:'#22c55e',fontWeight:700}}>{devices.filter(d=>d.is_online).length}</span></div>
            <div style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'#cbd5e1',fontSize:'.85rem'}}>vMix Connections</span><span style={{color:'#eab308',fontWeight:700}}>{vmixConns.length}</span></div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}><button style={{padding:'8px 16px',background:'#334155',border:'none',borderRadius:4,color:'#fff',cursor:'pointer'}} onClick={() => setShowSettings(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* AUDIO MIXER PANEL */}
      {showAudioMixer && (
        <div style={{position:'fixed',bottom:56,left:0,right:0,height:120,background:'#0f172a',borderTop:'2px solid #3b82f6',zIndex:50,padding:'12px 24px',display:'flex',gap:24,alignItems:'flex-end',overflow:'auto'}}>
          <button style={{position:'absolute',top:4,right:12,background:'none',border:'none',color:'#94a3b8',fontSize:'1.2rem',cursor:'pointer'}} onClick={() => setShowAudioMixer(false)}>✕</button>
          {devices.map((d,i) => (
            <div key={d.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:50}}>
              <div style={{width:8,height:80,background:'#1e293b',borderRadius:4,position:'relative'}}><div style={{position:'absolute',bottom:0,width:'100%',height:`${60+Math.random()*30}%`,background: pgm===d.id?'#ef4444':'#22c55e',borderRadius:4,transition:'height .3s'}}></div></div>
              <span style={{fontSize:'.6rem',color:'#94a3b8',fontWeight:600}}>{i+1}</span>
            </div>
          ))}
          <div style={{marginLeft:'auto',display:'flex',flexDirection:'column',alignItems:'center',gap:4,minWidth:50}}>
            <div style={{width:8,height:80,background:'#1e293b',borderRadius:4,position:'relative'}}><div style={{position:'absolute',bottom:0,width:'100%',height:'75%',background:'#eab308',borderRadius:4}}></div></div>
            <span style={{fontSize:'.6rem',color:'#94a3b8',fontWeight:600}}>Master</span>
          </div>
        </div>
      )}

    </div>
  );
}
