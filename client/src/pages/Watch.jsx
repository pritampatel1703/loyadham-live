import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import Chat from '../components/Chat';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

export default function Watch() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const pcRef = useRef(null);                 // RTCPeerConnection
  const pendingCandidates = useRef([]);       // ICE candidates received before offer processed

  const [streamState, setStreamState] = useState({ active: false, title: '', viewerCount: 0 });
  const [connStatus, setConnStatus]   = useState('idle'); // idle | connecting | connected | offline
  const [messages, setMessages]       = useState([]);
  const [username, setUsername]       = useState('');
  const [nameInput, setNameInput]     = useState('');
  const [showPrompt, setShowPrompt]   = useState(true);

  // ── WebRTC helpers ──────────────────────────────────────────────────────────
  function createPeerConnection(adminSocketId) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (videoRef.current && e.streams[0]) {
        videoRef.current.srcObject = e.streams[0];
      }
      setConnStatus('connected');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId: adminSocketId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed')       setConnStatus('failed');
      if (s === 'disconnected') setConnStatus('connecting');
      if (s === 'closed')       setConnStatus('idle');
    };

    return pc;
  }

  async function handleOffer({ fromId, sdp }) {
    if (pcRef.current) { pcRef.current.close(); }
    setConnStatus('connecting');

    const pc = createPeerConnection(fromId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    // Flush queued ICE candidates
    for (const c of pendingCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
    pendingCandidates.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { targetId: fromId, sdp: pc.localDescription });
  }

  async function handleIceCandidate({ candidate }) {
    if (pcRef.current?.remoteDescription) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    } else {
      pendingCandidates.current.push(candidate);
    }
  }

  // ── Join stream after username entered ─────────────────────────────────────
  function joinStream() {
    const name = nameInput.trim() || 'Guest';
    setUsername(name);
    setShowPrompt(false);
    socket.emit('viewer-join', { username: name });
  }

  // ── Socket lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    socket.on('stream-state', (state) => {
      setStreamState(state);
      if (!state.active) setConnStatus('offline');
    });

    socket.on('stream-started', ({ title, startedAt }) => {
      setStreamState(prev => ({ ...prev, active: true, title, startedAt }));
      setConnStatus('idle');
    });

    socket.on('stream-ended', () => {
      setStreamState(prev => ({ ...prev, active: false }));
      setConnStatus('offline');
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    socket.on('viewer-count', (count) =>
      setStreamState(prev => ({ ...prev, viewerCount: count }))
    );

    socket.on('offer', handleOffer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('chat-message', (msg) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.off('stream-state');
      socket.off('stream-started');
      socket.off('stream-ended');
      socket.off('viewer-count');
      socket.off('offer');
      socket.off('ice-candidate');
      socket.off('chat-message');
      if (pcRef.current) { pcRef.current.close(); }
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendMessage(message) {
    socket.emit('chat-message', { username, message, isAdmin: false });
  }

  // ── Username prompt screen ──────────────────────────────────────────────────
  if (showPrompt) {
    return (
      <div className="prompt-page">
        <div className="prompt-card glass-panel">
          <span className="om-glow" style={{ fontSize: '2.8rem' }}>🕉️</span>

          {/* Show stream status during prompt */}
          {streamState.active ? (
            <div className="prompt-status">
              <span className="live-badge sm"><span className="live-dot" /> LIVE</span>
              <span style={{ color: 'var(--text-muted)' }}>{streamState.viewerCount} watching</span>
            </div>
          ) : (
            <div className="prompt-status">⭕ No stream right now</div>
          )}

          <h2>Join the Stream</h2>
          <p>Enter your name to watch and participate in live chat</p>

          <input
            id="viewer-name-input"
            className="field-input"
            type="text"
            placeholder="Your name..."
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinStream()}
            maxLength={30}
            autoFocus
          />

          <button
            id="join-stream-btn"
            className="btn btn-primary"
            onClick={joinStream}
          >
            {streamState.active ? '▶ Watch Live' : '▶ Go to Waiting Room'}
          </button>

          <button className="btn-ghost prompt-back" onClick={() => navigate('/')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Main watch page ─────────────────────────────────────────────────────────
  return (
    <div className="watch-page">
      {/* Header */}
      <header className="watch-header glass-panel">
        <div className="watch-header-left">
          <span style={{ fontSize: '1.4rem' }}>🕉️</span>
          <span className="watch-brand">Loyadham Live</span>
          {streamState.active && (
            <span className="live-badge sm"><span className="live-dot" /> LIVE</span>
          )}
        </div>
        <div className="watch-header-right">
          <span className="viewer-pill">👁️ {streamState.viewerCount}</span>
          <button className="btn-icon" onClick={() => navigate('/')} title="Leave">✕</button>
        </div>
      </header>

      <div className="watch-body">
        {/* Video area */}
        <div className="video-section">
          <div className="video-wrapper">
            {connStatus === 'connected' && (
              <video
                ref={videoRef}
                id="stream-video"
                autoPlay
                playsInline
                className="stream-video"
              />
            )}

            {connStatus === 'connected' ? null : connStatus === 'offline' ? (
              <div className="video-placeholder">
                <div className="placeholder-icon">📿</div>
                <h3>Stream has ended</h3>
                <p>Thank you for watching. May you be blessed. 🙏</p>
                <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => navigate('/')}>
                  ← Go Home
                </button>
              </div>
            ) : (
              <div className="video-placeholder">
                <div className="placeholder-icon placeholder-spin">🕉️</div>
                <h3>{streamState.active ? 'Connecting to stream…' : 'Waiting for stream to start'}</h3>
                <p>
                  {streamState.active
                    ? 'Setting up your live connection, please wait…'
                    : 'You will be connected automatically when Loyadham goes live.'}
                </p>
              </div>
            )}
          </div>

          {streamState.title && connStatus === 'connected' && (
            <div className="stream-title-bar">{streamState.title}</div>
          )}
        </div>

        {/* Chat sidebar */}
        <Chat
          messages={messages}
          onSend={sendMessage}
          username={username}
          disabled={!streamState.active}
        />
      </div>
    </div>
  );
}
