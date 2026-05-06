import { useState, useEffect, useRef, useCallback } from 'react';
import { devicesApi, analyticsApi, streamsApi, vmixApi } from '../api/client';
import { productionSocket, signalingSocket } from '../socket';
import { ICE_SERVERS } from '../webrtc';

export default function Production() {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pgm, setPgm] = useState(null);
  const [pvw, setPvw] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [vmixConns, setVmixConns] = useState([]);
  const [vmixActive, setVmixActive] = useState(null);
  const [vmixStatus, setVmixStatus] = useState(null);
  const [fullscreen, setFullscreen] = useState(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', label: '', group_name: 'Default' });
  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [isFTB, setIsFTB] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAudioMixer, setShowAudioMixer] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);
  const [transSpeed, setTransSpeed] = useState(1);
  const timerRef = useRef(null);
  const recTimerRef = useRef(null);
  const containerRef = useRef(null);
  const videoRefs = useRef({});  // deviceId -> video element
  const pgmVideoRef = useRef(null);
  const pvwVideoRef = useRef(null);
  const iceQueues = useRef({});
  const peerConns = useRef({});  // deviceId -> RTCPeerConnection
  const remoteStreams = useRef({}); // deviceId -> MediaStream
  const pendingRooms = useRef([]); // rooms to join once socket connects
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const load = async () => {
    try {
      const [d, l, v] = await Promise.all([devicesApi.list(), analyticsApi.logs('', 30), vmixApi.connections()]);
      const devs = d.devices || [];
      setDevices(devs.length > 0 ? devs : demoCams);
      setLogs(l.logs || []);
      setVmixConns(v.connections || []);
      if (!vmixActive && v.connections?.[0]) setVmixActive(v.connections[0].id);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    load();
    productionSocket.connect();
    productionSocket.on('device:heartbeat', (data) => {
      setDevices(prev => prev.map(d => d.id === data.device_id ? { ...d, battery_percent: data.battery, signal_quality: data.signal, stream_fps: data.fps, stream_bitrate: data.bitrate, stream_resolution: data.resolution } : d));
    });
    productionSocket.on('device:online', load);
    productionSocket.on('device:offline', load);
    productionSocket.on('log:new', (log) => setLogs(prev => [log, ...prev].slice(0, 50)));
    const id = setInterval(load, 20000);
    return () => { clearInterval(id); productionSocket.disconnect(); };
  }, []);

  // ── WebRTC: Connect to each online device's camera stream ──
  const connectToCamera = useCallback((deviceId) => {
    if (peerConns.current[deviceId]) return; // already connected or pending

    // Mark as pending so we don't double-join
    peerConns.current[deviceId] = 'pending';
    console.log('[Production] connectToCamera:', deviceId, 'socket.connected:', signalingSocket.connected);

    // If socket is connected, join immediately. Otherwise queue for later.
    const roomId = `camera-${deviceId}`;
    if (signalingSocket.connected) {
      signalingSocket.emit('join-room', { roomId });
      console.log('[Production] Joined room:', roomId);
    } else {
      pendingRooms.current.push(roomId);
      console.log('[Production] Queued room:', roomId);
    }
  }, []);

  // Handle incoming offer from camera
  const handleCameraOffer = useCallback(async ({ fromId, sdp, streamId }) => {
    console.log('[Production] Received offer from camera:', fromId, 'streamId:', streamId);
    // Close any stale/pending connection for this device
    const existing = peerConns.current[streamId];
    if (existing && existing !== 'pending' && typeof existing === 'object') {
      try { existing.close(); } catch(e) {}
    }

    // Create a fresh peer connection with the camera's REAL socket ID
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      console.log('[Production] Got video track from camera:', streamId);
      remoteStreams.current[streamId] = e.streams[0];
      const videoEl = videoRefs.current[streamId];
      if (videoEl) {
        videoEl.srcObject = e.streams[0];
        videoEl.play().catch(() => {});
      }
      setUpdateTrigger(t => t + 1);
    };

    // CRITICAL: Send ICE candidates to the camera's ACTUAL socket ID, not a room name
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalingSocket.emit('ice-candidate', { targetId: fromId, candidate: e.candidate, streamId });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Production] Connection state:', streamId, pc.connectionState);
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        pc.close();
        delete peerConns.current[streamId];
        delete remoteStreams.current[streamId];
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });

    // Drain any queued ICE candidates
    if (iceQueues.current[streamId]) {
      iceQueues.current[streamId].forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{}));
      delete iceQueues.current[streamId];
    }
  }, []);

  // Setup signaling socket for receiving camera feeds
  useEffect(() => {
    signalingSocket.connect();

    // When socket connects/reconnects, drain pending room joins
    const onConnect = () => {
      pendingRooms.current.forEach(roomId => signalingSocket.emit('join-room', { roomId }));
      pendingRooms.current = [];
      // Re-join for any devices still in 'pending' state
      Object.entries(peerConns.current).forEach(([devId, val]) => {
        if (val === 'pending') {
          signalingSocket.emit('join-room', { roomId: `camera-${devId}` });
        }
      });
    };
    signalingSocket.on('connect', onConnect);
    if (signalingSocket.connected) onConnect();

    signalingSocket.on('offer', handleCameraOffer);
    signalingSocket.on('ice-candidate', async ({ fromId, candidate, streamId }) => {
      if (streamId) {
        const pc = peerConns.current[streamId];
        if (pc && typeof pc === 'object' && pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        } else {
          if (!iceQueues.current[streamId]) iceQueues.current[streamId] = [];
          iceQueues.current[streamId].push(candidate);
        }
      } else {
        for (const [devId, pc] of Object.entries(peerConns.current)) {
          if (typeof pc === 'object' && pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
          } else {
            if (!iceQueues.current[devId]) iceQueues.current[devId] = [];
            iceQueues.current[devId].push(candidate);
          }
        }
      }
    });

    return () => {
      signalingSocket.off('connect', onConnect);
      signalingSocket.off('offer');
      signalingSocket.off('ice-candidate');
      signalingSocket.disconnect();
      Object.values(peerConns.current).forEach(pc => { if (typeof pc === 'object' && pc.close) pc.close(); });
      peerConns.current = {};
    };
  }, [handleCameraOffer]);

  // Auto-connect to online devices
  useEffect(() => {
    devices.filter(d => d.is_online).forEach(d => connectToCamera(d.id));
  }, [devices, connectToCamera]);

  useEffect(() => {
    if (!vmixActive) return;
    const poll = () => vmixApi.status(vmixActive).then(d => { if (d.success) setVmixStatus(d.status); }).catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [vmixActive]);

  const demoCams = [
    { id: 'd1', name: 'CAM 1 — Main Hall', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 4500, battery_percent: 87, signal_quality: 92, tally_state: 'off' },
    { id: 'd2', name: 'CAM 2 — Stage Left', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 3800, battery_percent: 64, signal_quality: 78, tally_state: 'off' },
    { id: 'd3', name: 'CAM 3 — Wide Shot', is_online: true, stream_resolution: '1920x1080', stream_fps: 30, stream_bitrate: 4200, battery_percent: 45, signal_quality: 85, tally_state: 'off' },
    { id: 'd4', name: 'CAM 4 — Close Up', is_online: false, stream_resolution: '1280x720', stream_fps: 25, stream_bitrate: 2800, battery_percent: 23, signal_quality: 55, tally_state: 'off' },
  ];

  const selectPgm = (id) => { setPgm(id); devicesApi.setTally(id, 'program').catch(() => {}); if (pgm && pgm !== id) devicesApi.setTally(pgm, pvw === pgm ? 'preview' : 'off').catch(() => {}); };
  const selectPvw = (id) => { setPvw(id); devicesApi.setTally(id, 'preview').catch(() => {}); if (pvw && pvw !== id) devicesApi.setTally(pvw, pgm === pvw ? 'program' : 'off').catch(() => {}); };

  const doCut = () => { if (pvw) { const old = pgm; selectPgm(pvw); if (old) selectPvw(old); } };
  const doFade = () => {
    if (!pvw) return;
    // Simulate a fade by delaying the cut
    const old = pgm;
    setTimeout(() => { selectPgm(pvw); if (old) selectPvw(old); }, transSpeed * 500);
  };
  const doAutoTransition = () => {
    if (!pvw) return;
    const old = pgm;
    setTimeout(() => { selectPgm(pvw); if (old) selectPvw(old); }, transSpeed * 250);
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

  const copyPgmLink = () => {
    const token = localStorage.getItem('ag_token');
    const url = `${window.location.origin}/output/pgm?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('vMix PGM Link Copied! Paste this URL into a vMix Web Browser Input.');
    }).catch(() => alert('Failed to copy.'));
  };

  const fullscreenPgm = async () => {
    if (!pgmVideoRef.current) return;
    if (document.fullscreenElement === pgmVideoRef.current) {
      document.exitFullscreen().catch(()=>{});
      return;
    }
    
    try {
      if ('getScreenDetails' in window) {
        const screenDetails = await window.getScreenDetails();
        const externalScreen = screenDetails.screens.find(s => s !== screenDetails.currentScreen);
        if (externalScreen) {
          await pgmVideoRef.current.requestFullscreen({ screen: externalScreen }).catch(()=>{});
          return;
        }
      }
    } catch (e) {
      console.warn('Screen Details API not supported or denied. Using standard fullscreen.');
    }
    
    pgmVideoRef.current.requestFullscreen().catch(()=>{});
  };

  const openPgmDisplay = () => {
    const token = localStorage.getItem('ag_token');
    const url = `${window.location.origin}/output/pgm?token=${token}`;
    window.open(url, '_blank');
  };

  const addInput = async () => {
    try { await devicesApi.create(addForm); setShowAddInput(false); setAddForm({ name: '', label: '', group_name: 'Default' }); load(); } catch (e) { alert(e.message); }
  };
  const deleteInput = async (id) => {
    if (!confirm('Remove this input?')) return;
    try { await devicesApi.delete(id); load(); } catch (e) { alert(e.message); }
  };

  const fmtTime = (s) => { const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };

  const pgmDevice = devices.find(d => d.id === pgm);
  const pvwDevice = devices.find(d => d.id === pvw);

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
  useEffect(() => {
    if (pvw && pvwVideoRef.current && remoteStreams.current[pvw]) {
      if (pvwVideoRef.current.srcObject !== remoteStreams.current[pvw]) {
        pvwVideoRef.current.srcObject = remoteStreams.current[pvw];
        pvwVideoRef.current.play().catch(()=>{});
      }
    } else if (pvwVideoRef.current) {
      pvwVideoRef.current.srcObject = null;
    }
  }, [pvw, updateTrigger]);

  useEffect(() => {
    if (pgm && pgmVideoRef.current && remoteStreams.current[pgm]) {
      if (pgmVideoRef.current.srcObject !== remoteStreams.current[pgm]) {
        pgmVideoRef.current.srcObject = remoteStreams.current[pgm];
        pgmVideoRef.current.play().catch(()=>{});
      }
    } else if (pgmVideoRef.current) {
      pgmVideoRef.current.srcObject = null;
    }
  }, [pgm, updateTrigger]);

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
            <span style={{ fontSize: '.7rem', opacity: 0.9 }}>{pvwDevice?.name || 'Blank'}</span>
          </div>
          <div className="vmix-monitor-video">
            <video 
              ref={pvwVideoRef}
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: pvwDevice?.is_online ? 'block' : 'none' }}
            />
            {!pvwDevice?.is_online && (
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
              <span style={{ fontSize: '.7rem', opacity: 0.9, marginLeft: 8 }}>{pgmDevice?.name || 'Blank'}</span>
            </div>
            <button 
              onClick={fullscreenPgm} 
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px' }}
              title="Fullscreen Program (can target secondary monitors)"
            >
              ⛶
            </button>
          </div>
          <div className="vmix-monitor-video">
            <video 
              ref={pgmVideoRef}
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: pgmDevice?.is_online ? 'block' : 'none' }}
            />
            {!pgmDevice?.is_online && (
              <span style={{ color: '#475569', fontSize: '1.2rem', fontWeight: 700 }}>PGM OFFLINE</span>
            )}
            {isLive && (
              <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,.7)', padding: '4px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700, fontSize: '.75rem', animation: 'pulse-badge 2s infinite' }}>
                REC {fmtTime(elapsed)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. MIDDLE DIVIDER */}
      <div className="vmix-divider">
        <div style={{ display: 'flex', gap: 2, height: 16 }}>
          {['#ef4444','#eab308','#22c55e','#3b82f6','#a855f7','#475569'].map(c => <div key={c} style={{ width: 16, background: c }}></div>)}
          <div style={{ width: 16, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: '#fff', border: '1px solid #475569', marginLeft: 4 }}>🔍</div>
        </div>
        <button className="vmix-menu-btn" style={{ padding: '0 8px', height: 20, background: showAudioMixer?'#3b82f6':'#334155', borderRadius: 2 }} onClick={() => setShowAudioMixer(a => !a)}>🔊 Audio Mixer</button>
      </div>

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
              <span style={{ cursor: 'pointer', padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); deleteInput(d.id); }}>✕</span>
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
            
            {/* Input Footer */}
            <div className="vmix-input-footer">
              <button className="vmix-input-btn" onClick={() => selectPgm(d.id)}>GO</button>
              <button className="vmix-input-btn" style={{ background: pgm === d.id ? '#ef4444' : '#334155' }} onClick={() => selectPgm(d.id)}>Cut</button>
              <button className="vmix-input-btn" onClick={() => { selectPvw(d.id); setTimeout(doCut, transSpeed * 500); }}>Fade</button>
              <button className="vmix-input-btn" style={{ marginLeft: 'auto' }} onClick={() => selectPvw(d.id)}>⚙️</button>
            </div>
          </div>
        ))}
      </div>

      {/* 5. BOTTOM STATUS BAR */}
      <div className="vmix-bottom-bar">
        <div className="vmix-bottom-controls">
          <button className="vmix-action-btn" style={{ marginRight: 16 }} onClick={() => setShowAddInput(true)}>Add Input ▾</button>
          <button className={`vmix-action-btn ${isRecording ? 'active' : ''}`} onClick={toggleRecord}>{isRecording ? `● REC ${fmtTime(recElapsed)}` : 'Record'}</button>
          <button className="vmix-action-btn">External</button>
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
