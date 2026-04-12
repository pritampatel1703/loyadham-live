import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';

export default function Home() {
  const navigate = useNavigate();
  const [streamState, setStreamState] = useState({
    active: false, title: '', viewerCount: 0, startedAt: null,
  });

  useEffect(() => {
    socket.connect();

    socket.on('stream-state', (state) => setStreamState(state));

    socket.on('stream-started', ({ title, startedAt }) =>
      setStreamState(prev => ({ ...prev, active: true, title, startedAt }))
    );

    socket.on('stream-ended', () =>
      setStreamState(prev => ({ ...prev, active: false, title: '', startedAt: null, viewerCount: 0 }))
    );

    socket.on('viewer-count', (count) =>
      setStreamState(prev => ({ ...prev, viewerCount: count }))
    );

    return () => {
      socket.off('stream-state');
      socket.off('stream-started');
      socket.off('stream-ended');
      socket.off('viewer-count');
      socket.disconnect();
    };
  }, []);

  return (
    <div className="home-page">
      {/* Ambient orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="home-content">
        {/* Logo */}
        <div className="home-logo">
          <div className="home-logo-icon">
            <span className="om-glow">🕉️</span>
          </div>
          <h1>Loyadham</h1>
          <p>Live Spiritual Broadcast</p>
        </div>

        {/* Stream status card */}
        {streamState.active ? (
          <div className="stream-card glass-panel anim-fade-up">
            <div className="stream-card-row">
              <span className="live-badge">
                <span className="live-dot" /> LIVE NOW
              </span>
              <span className="viewer-pill">
                👁️ {streamState.viewerCount} watching
              </span>
            </div>

            <h2>{streamState.title || 'Loyadham Live'}</h2>

            <button
              id="watch-now-btn"
              className="btn btn-primary watch-btn"
              onClick={() => navigate('/watch')}
            >
              ▶&nbsp; Watch Now
            </button>
          </div>
        ) : (
          <div className="offline-card glass-panel anim-fade-up">
            <div className="offline-icon">📿</div>
            <h2>No Live Stream Right Now</h2>
            <p>
              Visit us again soon for live satsang, pravachan,
              and other spiritual programs from Loyadham.
            </p>
            <div className="jai-text">🙏 Jai Swaminarayan</div>
          </div>
        )}

        <a href="/admin" className="home-admin-link" id="admin-link">Admin</a>
      </div>
    </div>
  );
}
