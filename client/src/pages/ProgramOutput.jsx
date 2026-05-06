import { useEffect, useRef, useState, useCallback } from 'react';
import { signalingSocket, productionSocket } from '../socket';
import { ICE_SERVERS } from '../webrtc';
import { devicesApi } from '../api/client';

export default function ProgramOutput() {
  const [pgmId, setPgmId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState('Waiting for Program feed...');

  const peerConns = useRef({});
  const videoRefs = useRef({});

  // 1. Fetch initial state
  const loadDevices = useCallback(async () => {
    try {
      const data = await devicesApi.list();
      const onlineDevices = data.devices?.filter(d => d.is_online) || [];
      setDevices(onlineDevices);
      
      const currentPgm = data.devices?.find(d => d.tally_state === 'program');
      if (currentPgm) {
        setPgmId(currentPgm.id);
        setStatus('');
      }

      // Connect WebRTC to all online devices
      onlineDevices.forEach(d => connectToCamera(d.id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 2. Connect to a specific camera (headless)
  const connectToCamera = useCallback((streamId) => {
    if (peerConns.current[streamId]) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current[streamId] = pc;

    pc.ontrack = (e) => {
      const videoEl = videoRefs.current[streamId];
      if (videoEl) {
        videoEl.srcObject = e.streams[0];
        videoEl.play().catch(err => {
          videoEl.muted = true;
          videoEl.play().catch(console.error);
        });
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalingSocket.emit('ice-candidate', { targetId: `camera-${streamId}`, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        pc.close();
        delete peerConns.current[streamId];
        // Reconnect attempt if still online
        setTimeout(() => connectToCamera(streamId), 3000);
      }
    };

    signalingSocket.emit('join-room', { roomId: `camera-${streamId}` });
  }, []);

  // 3. Handle incoming WebRTC offers
  const handleOffer = useCallback(async ({ fromId, sdp, streamId }) => {
    let pc = peerConns.current[streamId];
    if (!pc) {
      connectToCamera(streamId);
      pc = peerConns.current[streamId];
    }
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
  }, [connectToCamera]);

  useEffect(() => {
    // WebRTC Signaling
    signalingSocket.connect();
    signalingSocket.on('offer', handleOffer);
    signalingSocket.on('ice-candidate', async ({ fromId, candidate }) => {
      for (const [devId, pc] of Object.entries(peerConns.current)) {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
        }
      }
    });

    // Production State (Tally & Online status)
    productionSocket.connect();
    productionSocket.on('device:tally', ({ deviceId, state }) => {
      if (state === 'program') {
        setPgmId(deviceId);
        setStatus('');
      }
    });
    productionSocket.on('device:online', loadDevices);
    productionSocket.on('device:offline', loadDevices);

    loadDevices();

    return () => {
      signalingSocket.off('offer');
      signalingSocket.off('ice-candidate');
      productionSocket.off('device:tally');
      productionSocket.off('device:online');
      productionSocket.off('device:offline');
      Object.values(peerConns.current).forEach(pc => pc.close());
      peerConns.current = {};
    };
  }, [handleOffer, loadDevices]);

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
      {status && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif', zIndex: 10 }}>
          {status}
        </div>
      )}
      
      {/* Render all camera videos, but only the PGM one is visible */}
      {devices.map(d => {
        const isPgm = d.id === pgmId;
        return (
          <video
            key={d.id}
            ref={el => videoRefs.current[d.id] = el}
            autoPlay
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: isPgm ? 1 : 0,
              visibility: isPgm ? 'visible' : 'hidden',
              transition: 'opacity 0.1s ease',
              zIndex: isPgm ? 5 : 1
            }}
          />
        );
      })}
    </div>
  );
}
