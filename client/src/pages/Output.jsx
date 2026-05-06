import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { signalingSocket } from '../socket';
import { ICE_SERVERS } from '../webrtc';

export default function Output() {
  const { id } = useParams();
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const iceQueue = useRef([]);
  const [status, setStatus] = useState('Waiting for camera...');

  const connectCamera = useCallback(() => {
    if (pcRef.current) return;
    setStatus('Connecting to camera...');

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.ontrack = (e) => {
      setStatus('');
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0];
        // Browsers require interaction or muted for autoplay. 
        // vMix browser input bypasses this automatically.
        videoRef.current.play().catch(err => {
          console.warn('Autoplay prevented, trying muted:', err);
          videoRef.current.muted = true;
          videoRef.current.play().catch(e => console.error(e));
        });
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalingSocket.emit('ice-candidate', { targetId: `camera-${id}`, candidate: e.candidate });
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
  }, [id]);

  const handleOffer = useCallback(async ({ fromId, sdp, streamId }) => {
    if (streamId !== id) return;

    let pc = pcRef.current;
    if (!pc) {
      connectCamera();
      pc = pcRef.current;
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

    // Start connection
    connectCamera();

    return () => {
      signalingSocket.off('offer');
      signalingSocket.off('ice-candidate');
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [connectCamera, handleOffer]);

  return (
    <div style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {status && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif', zIndex: 10 }}>
          {status}
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}
