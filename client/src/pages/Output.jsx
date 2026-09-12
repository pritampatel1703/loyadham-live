import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { signalingSocket } from '../socket';
import { getIceConfig } from '../webrtc';

export default function Output() {
  const { id } = useParams();
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const iceQueue = useRef([]);
  const [status, setStatus] = useState('Waiting for camera...');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const connectCamera = useCallback(async () => {
    if (pcRef.current) return pcRef.current;
    setStatus('Connecting to camera...');

    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;

    pc.ontrack = (e) => {
      setStatus('');
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0];
        // Start muted for autoplay compliance, unmute on user click
        videoRef.current.muted = true;
        videoRef.current.play().catch(err => {
          console.warn('Autoplay prevented:', err);
        });
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalingSocket.emit('ice-candidate', { targetId: `camera-${id}`, candidate: e.candidate, streamId: id });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        setStatus('Camera disconnected. Waiting for reconnect...');
        pc.close();
        pcRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        // Try to reconnect after a delay
        setTimeout(() => connectCamera(), 3000);
      }
    };

    signalingSocket.emit('join-room', { roomId: `camera-${id}` });
    signalingSocket.emit('request-offer', { roomId: `camera-${id}` });
    return pc;
  }, [id]);

  const handleOffer = useCallback(async ({ fromId, sdp, streamId }) => {
    if (streamId !== id) return;

    let pc = pcRef.current;
    if (!pc) {
      pc = await connectCamera();
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalingSocket.emit('answer', { targetId: fromId, sdp: pc.localDescription });

    if (iceQueue.current.length > 0) {
      iceQueue.current.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=> {}));
      iceQueue.current = [];
    }
  }, [id, connectCamera]);

  useEffect(() => {
    signalingSocket.connect();
    
    signalingSocket.on('offer', handleOffer);
    signalingSocket.on('ice-candidate', async ({ fromId, candidate }) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { /* ignore */ }
      } else {
        iceQueue.current.push(candidate);
      }
    });

    // When a peer joins our camera room, request an offer from them
    signalingSocket.on('peer-joined', ({ peerId, roomId }) => {
      if (roomId === `camera-${id}`) {
        signalingSocket.emit('request-offer', { targetId: peerId, roomId });
      }
    });

    // On reconnect, rejoin the room and request offers
    const onConnect = () => {
      signalingSocket.emit('join-room', { roomId: `camera-${id}` });
      signalingSocket.emit('request-offer', { roomId: `camera-${id}` });
    };
    signalingSocket.on('connect', onConnect);
    if (signalingSocket.connected) onConnect();

    // Start connection
    connectCamera();

    return () => {
      signalingSocket.off('offer');
      signalingSocket.off('ice-candidate');
      signalingSocket.off('peer-joined');
      signalingSocket.off('connect', onConnect);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [connectCamera, handleOffer, id]);

  // Click-to-unmute gesture
  const handleUnmute = () => {
    setAudioUnlocked(true);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div
      onClick={handleUnmute}
      style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', cursor: status ? 'default' : 'none' }}
    >
      {status && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif', zIndex: 10 }}>
          {status}
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {!audioUnlocked && !status && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(30, 41, 59, 0.85)',
          color: '#cbd5e1',
          padding: '8px 20px',
          borderRadius: 8,
          fontSize: '0.85rem',
          border: '1px solid rgba(71, 85, 105, 0.5)',
          cursor: 'pointer',
          zIndex: 20,
        }}>
          🔊 Click anywhere to unmute audio
        </div>
      )}
    </div>
  );
}
