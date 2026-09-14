import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════
   STREAM DISTRIBUTION — Multi-Destination Restream
   ═══════════════════════════════════════════════════════════ */

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube Live', icon: '▶️', color: '#FF0000', urlTemplate: 'rtmp://a.rtmp.youtube.com/live2/' },
  { id: 'facebook', name: 'Facebook Live', icon: '📘', color: '#1877F2', urlTemplate: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
  { id: 'twitch', name: 'Twitch', icon: '💜', color: '#9146FF', urlTemplate: 'rtmp://live.twitch.tv/app/' },
  { id: 'instagram', name: 'Instagram Live', icon: '📷', color: '#E4405F', urlTemplate: 'rtmps://live-upload.instagram.com:443/rtmp/' },
  { id: 'custom', name: 'Custom RTMP', icon: '🔗', color: '#64748b', urlTemplate: 'rtmp://' },
  { id: 'srt', name: 'SRT Output', icon: '📡', color: '#06b6d4', urlTemplate: 'srt://' },
];

const QUALITY_PRESETS = [
  { id: 'source', label: 'Source (Passthrough)', bitrate: 0, resolution: 'Source' },
  { id: '1080p60', label: '1080p 60fps', bitrate: 8000, resolution: '1920×1080' },
  { id: '1080p30', label: '1080p 30fps', bitrate: 4500, resolution: '1920×1080' },
  { id: '720p60', label: '720p 60fps', bitrate: 4500, resolution: '1280×720' },
  { id: '720p30', label: '720p 30fps', bitrate: 2500, resolution: '1280×720' },
  { id: '480p30', label: '480p 30fps', bitrate: 1500, resolution: '854×480' },
  { id: '360p30', label: '360p 30fps', bitrate: 800, resolution: '640×360' },
];

export default function StreamDistribution() {
  const [destinations, setDestinations] = useState([
    { id: 'd1', platform: 'youtube', name: 'Main YouTube Channel', streamKey: '****-****-****-****', url: 'rtmp://a.rtmp.youtube.com/live2/', quality: '1080p30', enabled: true, status: 'idle', viewers: 0, bitrate: 0, uptime: 0 },
    { id: 'd2', platform: 'facebook', name: 'Facebook Page', streamKey: '****-****', url: 'rtmps://live-api-s.facebook.com:443/rtmp/', quality: '720p30', enabled: true, status: 'idle', viewers: 0, bitrate: 0, uptime: 0 },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [addData, setAddData] = useState({ platform: 'youtube', name: '', streamKey: '', url: '', quality: '1080p30', enabled: true });
  const [globalStatus, setGlobalStatus] = useState('idle'); // idle, live, error
  const [stats, setStats] = useState({ totalViewers: 0, totalBitrate: 0, uptime: 0 });
  const [uptimeCounter, setUptimeCounter] = useState(0);

  // Simulate live stats
  useEffect(() => {
    if (globalStatus !== 'live') return;
    const id = setInterval(() => {
      setUptimeCounter(prev => prev + 1);
      setDestinations(prev => prev.map(d => d.status === 'live' ? {
        ...d,
        viewers: Math.max(0, d.viewers + Math.floor(Math.random() * 10 - 3)),
        bitrate: 2000 + Math.floor(Math.random() * 1000),
        uptime: d.uptime + 1,
      } : d));
    }, 1000);
    return () => clearInterval(id);
  }, [globalStatus]);

  useEffect(() => {
    const totalViewers = destinations.filter(d => d.status === 'live').reduce((sum, d) => sum + d.viewers, 0);
    const totalBitrate = destinations.filter(d => d.status === 'live').reduce((sum, d) => sum + d.bitrate, 0);
    setStats({ totalViewers, totalBitrate, uptime: uptimeCounter });
  }, [destinations, uptimeCounter]);

  const goLive = () => {
    setGlobalStatus('live');
    setUptimeCounter(0);
    setDestinations(prev => prev.map(d => d.enabled ? { ...d, status: 'live', viewers: Math.floor(Math.random() * 50), bitrate: 2500, uptime: 0 } : d));
  };

  const stopAll = () => {
    setGlobalStatus('idle');
    setUptimeCounter(0);
    setDestinations(prev => prev.map(d => ({ ...d, status: 'idle', viewers: 0, bitrate: 0, uptime: 0 })));
  };

  const toggleDest = (id) => {
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, status: d.status === 'live' ? 'idle' : (globalStatus === 'live' ? 'live' : 'idle'), enabled: d.status === 'live' ? false : true } : d));
  };

  const removeDest = (id) => setDestinations(prev => prev.filter(d => d.id !== id));

  const addDestination = () => {
    if (!addData.name) return;
    const platform = PLATFORMS.find(p => p.id === addData.platform);
    setDestinations(prev => [...prev, {
      id: `d-${Date.now()}`, ...addData, url: addData.url || platform?.urlTemplate || '', status: 'idle', viewers: 0, bitrate: 0, uptime: 0,
    }]);
    setShowAdd(false);
    setAddData({ platform: 'youtube', name: '', streamKey: '', url: '', quality: '1080p30', enabled: true });
  };

  const formatUptime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="stream-dist">
      <div className="sd-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>📡 Stream Distribution</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>Multi-destination restreaming to YouTube, Facebook, Twitch & more</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={() => setShowAdd(true)}>+ Add Destination</button>
          {globalStatus === 'idle' ? (
            <button className="btn btn-sm btn-danger" onClick={goLive} disabled={destinations.filter(d => d.enabled).length === 0}>
              🔴 GO LIVE
            </button>
          ) : (
            <button className="btn btn-sm btn-outline" onClick={stopAll} style={{ color: '#ef4444', borderColor: '#ef4444' }}>
              ⏹ STOP ALL
            </button>
          )}
        </div>
      </div>

      {/* Global Stats */}
      {globalStatus === 'live' && (
        <div className="sd-stats-bar">
          <div className="sd-stat-chip live">
            <span className="sd-live-dot"></span> LIVE
          </div>
          <div className="sd-stat-chip">
            <span>⏱️</span> {formatUptime(stats.uptime)}
          </div>
          <div className="sd-stat-chip">
            <span>👁️</span> {stats.totalViewers.toLocaleString()} viewers
          </div>
          <div className="sd-stat-chip">
            <span>📊</span> {(stats.totalBitrate / 1000).toFixed(1)} Mbps total
          </div>
          <div className="sd-stat-chip">
            <span>📡</span> {destinations.filter(d => d.status === 'live').length} / {destinations.length} active
          </div>
        </div>
      )}

      {/* Destination Cards */}
      <div className="sd-dest-grid">
        {destinations.map(d => {
          const platform = PLATFORMS.find(p => p.id === d.platform);
          return (
            <div key={d.id} className={`sd-dest-card ${d.status === 'live' ? 'live' : ''}`} style={{ borderLeftColor: platform?.color || '#64748b' }}>
              <div className="sd-dest-header">
                <span className="sd-dest-icon" style={{ background: (platform?.color || '#64748b') + '20', color: platform?.color }}>{platform?.icon}</span>
                <div className="sd-dest-title">
                  <span className="sd-dest-name">{d.name}</span>
                  <span className="sd-dest-platform">{platform?.name || d.platform}</span>
                </div>
                <div className="sd-dest-status">
                  {d.status === 'live' ? (
                    <span className="badge badge-danger" style={{ fontSize: '.55rem', animation: 'pulse 1s infinite' }}>🔴 LIVE</span>
                  ) : (
                    <span className="badge badge-default" style={{ fontSize: '.55rem' }}>⚫ Idle</span>
                  )}
                </div>
              </div>

              {d.status === 'live' && (
                <div className="sd-dest-stats">
                  <div className="sd-dest-stat"><span className="sd-dest-stat-val">{d.viewers}</span><span className="sd-dest-stat-label">Viewers</span></div>
                  <div className="sd-dest-stat"><span className="sd-dest-stat-val">{(d.bitrate / 1000).toFixed(1)}</span><span className="sd-dest-stat-label">Mbps</span></div>
                  <div className="sd-dest-stat"><span className="sd-dest-stat-val">{formatUptime(d.uptime)}</span><span className="sd-dest-stat-label">Uptime</span></div>
                </div>
              )}

              <div className="sd-dest-details">
                <div className="sd-dest-detail"><span>Quality:</span><span>{QUALITY_PRESETS.find(q => q.id === d.quality)?.label || d.quality}</span></div>
                <div className="sd-dest-detail"><span>Key:</span><span style={{ fontFamily: 'var(--mono)' }}>{d.streamKey?.replace(/./g, '•').slice(0, 16)}</span></div>
              </div>

              <div className="sd-dest-actions">
                <button className={`btn btn-xs ${d.status === 'live' ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggleDest(d.id)}>
                  {d.status === 'live' ? '⏹ Stop' : '▶ Start'}
                </button>
                <button className="btn btn-xs btn-outline" style={{ color: '#ef4444' }} onClick={() => removeDest(d.id)}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Destination Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 550 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Stream Destination</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Platform</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {PLATFORMS.map(p => (
                    <button key={p.id} className={`btn btn-xs ${addData.platform === p.id ? 'btn-primary' : 'btn-outline'}`}
                      style={addData.platform === p.id ? { background: p.color, borderColor: p.color } : {}} onClick={() => setAddData({ ...addData, platform: p.id, url: p.urlTemplate })}>
                      {p.icon} {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={addData.name} onChange={e => setAddData({...addData, name: e.target.value})} placeholder="My YouTube Channel" /></div>
              <div className="form-group"><label className="form-label">Stream Key</label><input className="form-input" type="password" value={addData.streamKey} onChange={e => setAddData({...addData, streamKey: e.target.value})} placeholder="xxxx-xxxx-xxxx-xxxx" /></div>
              <div className="form-group"><label className="form-label">RTMP URL</label><input className="form-input" value={addData.url} onChange={e => setAddData({...addData, url: e.target.value})} /></div>
              <div className="form-group">
                <label className="form-label">Quality</label>
                <select className="form-input" value={addData.quality} onChange={e => setAddData({...addData, quality: e.target.value})}>
                  {QUALITY_PRESETS.map(q => <option key={q.id} value={q.id}>{q.label}{q.bitrate ? ` (${q.bitrate} kbps)` : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addDestination}>+ Add Destination</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
