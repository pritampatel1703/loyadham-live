import { useState, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════
   REPLAY SYSTEM — Instant Replay with Slow Motion
   ═══════════════════════════════════════════════════════════ */

export default function ReplaySystem() {
  const [channels, setChannels] = useState([
    { id: 'ch1', name: 'Channel 1', source: 'CAM 1', recording: true, buffer: 300, clips: [] },
    { id: 'ch2', name: 'Channel 2', source: 'CAM 2', recording: true, buffer: 300, clips: [] },
    { id: 'ch3', name: 'Channel 3', source: 'PGM', recording: true, buffer: 300, clips: [] },
  ]);
  const [clips, setClips] = useState([
    { id: 'clip1', name: 'Goal Celebration', channel: 'ch1', inPoint: 120, outPoint: 128, duration: 8, speed: 1.0, created: new Date().toISOString() },
    { id: 'clip2', name: 'Amazing Save', channel: 'ch2', inPoint: 200, outPoint: 205, duration: 5, speed: 0.5, created: new Date().toISOString() },
  ]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [markIn, setMarkIn] = useState(null);
  const [markOut, setMarkOut] = useState(null);
  const [bufferPosition, setBufferPosition] = useState(0);
  const [showOnAir, setShowOnAir] = useState(false);
  const animRef = useRef(null);

  // Simulate buffer filling
  useEffect(() => {
    const id = setInterval(() => {
      setBufferPosition(prev => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Playback simulation
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setPlayProgress(prev => {
        const next = prev + (playbackSpeed / 30);
        if (next >= 1) { setIsPlaying(false); return 0; }
        return next;
      });
    }, 33);
    return () => clearInterval(id);
  }, [isPlaying, playbackSpeed]);

  const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0];

  const createClip = () => {
    if (markIn === null || markOut === null || markOut <= markIn) return;
    const name = prompt('Clip name:') || `Clip ${clips.length + 1}`;
    const newClip = {
      id: `clip-${Date.now()}`, name, channel: 'ch1',
      inPoint: markIn, outPoint: markOut, duration: markOut - markIn,
      speed: playbackSpeed, created: new Date().toISOString(),
    };
    setClips(prev => [...prev, newClip]);
    setMarkIn(null);
    setMarkOut(null);
  };

  const playClip = (clip) => {
    setSelectedClip(clip.id);
    setPlaybackSpeed(clip.speed);
    setPlayProgress(0);
    setIsPlaying(true);
  };

  const sendToAir = (clip) => {
    setShowOnAir(true);
    playClip(clip);
    setTimeout(() => setShowOnAir(false), (clip.duration / clip.speed) * 1000);
  };

  const deleteClip = (id) => {
    setClips(prev => prev.filter(c => c.id !== id));
    if (selectedClip === id) setSelectedClip(null);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="replay-page">
      <div className="replay-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🔄 Instant Replay</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Mark, capture, and play back key moments with slow motion</p>
        </div>
        {showOnAir && (
          <div className="replay-onair-badge">
            <span className="replay-onair-dot"></span>
            REPLAY ON AIR
          </div>
        )}
      </div>

      <div className="replay-layout">
        {/* Player */}
        <div className="replay-player">
          <div className="replay-viewport">
            <div className="replay-video-area">
              <span style={{ fontSize: '4rem', opacity: 0.15 }}>🔄</span>
              {isPlaying && <div className="replay-speed-overlay">{playbackSpeed}x</div>}
              {showOnAir && <div className="replay-air-overlay">ON AIR</div>}
            </div>

            {/* Timeline scrubber */}
            <div className="replay-timeline">
              <div className="replay-timeline-track">
                {/* Buffer fill indicator */}
                <div className="replay-buffer-fill" style={{ width: `${Math.min(100, (bufferPosition / 300) * 100)}%` }}></div>
                {/* Playhead */}
                <div className="replay-playhead" style={{ left: `${playProgress * 100}%` }}></div>
                {/* Mark in/out */}
                {markIn !== null && <div className="replay-mark-in" style={{ left: `${(markIn / 300) * 100}%` }}></div>}
                {markOut !== null && <div className="replay-mark-out" style={{ left: `${(markOut / 300) * 100}%` }}></div>}
                {markIn !== null && markOut !== null && (
                  <div className="replay-selection" style={{ left: `${(markIn / 300) * 100}%`, width: `${((markOut - markIn) / 300) * 100}%` }}></div>
                )}
              </div>
              <div className="replay-timeline-labels">
                <span>{formatTime(0)}</span>
                <span>{formatTime(bufferPosition)}</span>
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="replay-transport">
            <div className="replay-transport-left">
              <button className="btn btn-xs btn-outline" onClick={() => setMarkIn(bufferPosition - 10)} title="Mark In (I)">
                ◄ Mark In
              </button>
              <button className="btn btn-xs btn-outline" onClick={() => setMarkOut(bufferPosition)} title="Mark Out (O)">
                Mark Out ►
              </button>
              <button className="btn btn-xs btn-primary" onClick={createClip} disabled={markIn === null || markOut === null}>
                ✂️ Create Clip
              </button>
            </div>
            <div className="replay-transport-center">
              <button className="btn btn-xs btn-outline" onClick={() => setPlayProgress(0)}>⏮</button>
              <button className="btn btn-xs btn-outline" onClick={() => { setPlayProgress(prev => Math.max(0, prev - 0.05)); }}>⏪</button>
              <button className={`btn btn-sm ${isPlaying ? 'btn-danger' : 'btn-primary'}`} onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="btn btn-xs btn-outline" onClick={() => { setPlayProgress(prev => Math.min(1, prev + 0.05)); }}>⏩</button>
              <button className="btn btn-xs btn-outline" onClick={() => setPlayProgress(1)}>⏭</button>
            </div>
            <div className="replay-transport-right">
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Speed:</span>
              {SPEEDS.map(s => (
                <button key={s} className={`replay-speed-btn ${playbackSpeed === s ? 'active' : ''}`} onClick={() => setPlaybackSpeed(s)}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Channels + Clip Bin */}
        <div className="replay-right">
          {/* Recording Channels */}
          <div className="replay-channels">
            <div className="replay-section-title">📹 Recording Channels</div>
            {channels.map(ch => (
              <div key={ch.id} className={`replay-channel ${ch.recording ? 'recording' : ''}`}>
                <span className="replay-ch-dot" style={{ background: ch.recording ? '#ef4444' : '#64748b' }}></span>
                <div className="replay-ch-info">
                  <div style={{ fontWeight: 700, fontSize: '.78rem' }}>{ch.name}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{ch.source} · {ch.buffer}s buffer</div>
                </div>
                <button className={`btn btn-xs ${ch.recording ? 'btn-danger' : 'btn-outline'}`}
                  onClick={() => setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, recording: !c.recording } : c))}>
                  {ch.recording ? '⏹' : '⏺'}
                </button>
              </div>
            ))}
          </div>

          {/* Clip Bin */}
          <div className="replay-clipbin">
            <div className="replay-section-title">📂 Clip Bin ({clips.length})</div>
            {clips.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>No clips yet. Mark in/out and create clips.</div>
            ) : (
              clips.map(clip => (
                <div key={clip.id} className={`replay-clip-item ${selectedClip === clip.id ? 'selected' : ''}`}>
                  <div className="replay-clip-info">
                    <div style={{ fontWeight: 700, fontSize: '.78rem' }}>{clip.name}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
                      {clip.duration}s · {clip.speed}x · {new Date(clip.created).toLocaleTimeString('en-IN')}
                    </div>
                  </div>
                  <div className="replay-clip-actions">
                    <button className="btn btn-xs btn-primary" onClick={() => playClip(clip)} title="Play">▶</button>
                    <button className="btn btn-xs btn-danger" onClick={() => sendToAir(clip)} title="Send to Air">📡</button>
                    <button className="btn btn-xs btn-ghost" style={{ color: '#ef4444' }} onClick={() => deleteClip(clip.id)}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
