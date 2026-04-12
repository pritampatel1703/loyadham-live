import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from '../components/Chat';

const ADMIN_PASSWORD = 'Muktmuni1925';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN relay servers — required for cross-network streaming
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export default function Admin() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authed, setAuthed]           = useState(false);
  const [pwInput, setPwInput]         = useState('');
  const [pwError, setPwError]         = useState(false);

  // ── Stream state ────────────────────────────────────────────────────────────
  const [isLive, setIsLive]           = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [micOn, setMicOn]             = useState(true);
  const [camOn, setCamOn]             = useState(true);
  const [messages, setMessages]       = useState([]);
  const [elapsed, setElapsed]         = useState(0); // stream seconds

  // ── Refs ────────────────────────────────────────────────────────────────────
  const localVideoRef    = useRef(null);
  const localStreamRef   = useRef(null);
  const peerConns        = useRef(new Map()); // viewerId → RTCPeerConnection
  const pendingCands     = useRef(new Map()); // viewerId → candidate[]
  const timerRef         = useRef(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  function authenticate() {
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true); setPwError(false);
    } else {
      setPwError(true); setPwInput('');
    }
  }

  // ── Camera ──────────────────────────────────────────────────────────────────
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Camera access failed:', err);
      alert('Could not access camera/microphone.\nPlease allow permissions and reload.');
    }
  }

  // ── WebRTC: create offer for a specific viewer ──────────────────────────────
  async function createOfferForViewer(viewerId) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConns.current.set(viewerId, pc);

    // Add all local tracks so viewer gets audio + video
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track =>
        pc.addTrack(track, localStreamRef.current)
      );
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { targetId: viewerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConns.current.delete(viewerId);
        pendingCands.current.delete(viewerId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { targetId: viewerId, sdp: pc.localDescription });
  }

  // ── WebRTC: receive answer from viewer ─────────────────────────────────────
  async function handleAnswer({ fromId, sdp }) {
    const pc = peerConns.current.get(fromId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    // Flush queued ICE candidates for this viewer
    const queued = pendingCands.current.get(fromId) || [];
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
    pendingCands.current.delete(fromId);
  }

  // ── WebRTC: receive ICE candidate from viewer ──────────────────────────────
  async function handleIceFromViewer({ fromId, candidate }) {
    const pc = peerConns.current.get(fromId);
    if (pc?.remoteDescription) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    } else {
      const arr = pendingCands.current.get(fromId) || [];
      arr.push(candidate);
      pendingCands.current.set(fromId, arr);
    }
  }

  // ── Go Live ─────────────────────────────────────────────────────────────────
  function goLive() {
    socket.emit('admin-go-live', { title: streamTitle || 'Loyadham Live' });
    setIsLive(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }

  // ── End Stream ──────────────────────────────────────────────────────────────
  function endStream() {
    socket.emit('admin-end-stream');
    setIsLive(false);
    peerConns.current.forEach(pc => pc.close());
    peerConns.current.clear();
    pendingCands.current.clear();
    clearInterval(timerRef.current);
    setElapsed(0);
    setViewerCount(0);
  }

  // ── Mic / Camera toggles ────────────────────────────────────────────────────
  function toggleMic() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  }
  function toggleCam() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  }

  // ── Chat ────────────────────────────────────────────────────────────────────
  function sendMessage(message) {
    socket.emit('chat-message', { username: 'Loyadham 🕉️', message, isAdmin: true });
  }

  // ── Elapsed timer display ───────────────────────────────────────────────────
  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // ── Socket setup (only after auth) ─────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;

    socket.connect();
    startCamera();

    socket.on('new-viewer',    async ({ viewerId }) => { await createOfferForViewer(viewerId); });
    socket.on('answer',        handleAnswer);
    socket.on('ice-candidate', handleIceFromViewer);
    socket.on('viewer-count',  (n) => setViewerCount(n));
    socket.on('viewer-left',   ({ viewerId }) => {
      peerConns.current.get(viewerId)?.close();
      peerConns.current.delete(viewerId);
    });
    socket.on('chat-message', (msg) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.off('new-viewer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('viewer-count');
      socket.off('viewer-left');
      socket.off('chat-message');
      peerConns.current.forEach(pc => pc.close());
      peerConns.current.clear();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSWORD SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (!authed) {
    return (
      <div className="auth-page">
        <div className="auth-card glass-panel">
          <span className="om-glow" style={{ fontSize: '3.5rem' }}>🕉️</span>
          <h1>Admin Panel</h1>
          <p>Loyadham Live — Streamer Access</p>

          <input
            id="admin-password-input"
            className={`auth-input ${pwError ? 'error' : ''}`}
            type="password"
            placeholder="Enter password…"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false); }}
            onKeyDown={e => e.key === 'Enter' && authenticate()}
            autoFocus
          />

          {pwError && <p className="auth-error">❌ Incorrect password. Try again.</p>}

          <button id="admin-login-btn" className="btn btn-primary" onClick={authenticate}>
            🔓&nbsp; Enter
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header glass-panel">
        <div className="admin-header-left">
          <span style={{ fontSize: '1.4rem' }}>🕉️</span>
          <span>Loyadham Admin</span>
          {isLive && (
            <span className="live-badge sm">
              <span className="live-dot" /> LIVE · {fmtTime(elapsed)}
            </span>
          )}
        </div>
        <div className="admin-header-right">
          <span className="viewer-pill">👁️ {viewerCount} viewers</span>
        </div>
      </header>

      <div className="admin-body">
        {/* ─── Left: Camera + Controls ──────────────────────────── */}
        <div className="admin-left">
          {/* Camera preview */}
          <div className="admin-preview glass-panel">
            <video
              ref={localVideoRef}
              id="admin-camera-preview"
              autoPlay muted playsInline
              className={`admin-video${camOn ? '' : ' cam-off'}`}
            />
            {!camOn && (
              <div className="cam-off-overlay">
                <span>📷</span>
                <p>Camera Off</p>
              </div>
            )}
          </div>

          {/* Stream info when live */}
          {isLive && (
            <div className="stream-info-bar">
              <span className="stream-info-title">{streamTitle || 'Loyadham Live'}</span>
              <span className="stream-timer">⏱ {fmtTime(elapsed)}</span>
            </div>
          )}

          {/* Title input (only before going live) */}
          {!isLive && (
            <div className="stream-setup glass-panel">
              <label>Stream Title</label>
              <input
                id="stream-title-input"
                className="field-input"
                type="text"
                placeholder="e.g. Morning Satsang, Pravachan..."
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                maxLength={60}
              />
            </div>
          )}

          {/* Mic / Camera controls */}
          <div className="admin-controls glass-panel">
            <button
              id="toggle-mic-btn"
              className={`ctrl-btn ${micOn ? 'on' : 'off'}`}
              onClick={toggleMic}
            >
              <span>{micOn ? '🎤' : '🔇'}</span>
              <span>{micOn ? 'Mic On' : 'Muted'}</span>
            </button>
            <button
              id="toggle-cam-btn"
              className={`ctrl-btn ${camOn ? 'on' : 'off'}`}
              onClick={toggleCam}
            >
              <span>{camOn ? '📷' : '🚫'}</span>
              <span>{camOn ? 'Camera On' : 'Camera Off'}</span>
            </button>
          </div>

          {/* Go Live / End Stream */}
          {!isLive ? (
            <button id="go-live-btn" className="go-live-btn" onClick={goLive}>
              <span className="live-dot" />
              Go Live
            </button>
          ) : (
            <button id="end-stream-btn" className="end-stream-btn" onClick={endStream}>
              ⏹&nbsp; End Stream
            </button>
          )}
        </div>

        {/* ─── Right: Live Chat ──────────────────────────────────── */}
        <div className="admin-right">
          <Chat
            messages={messages}
            onSend={sendMessage}
            username="Loyadham 🕉️"
            isAdmin
            disabled={!isLive}
          />
        </div>
      </div>
    </div>
  );
}
