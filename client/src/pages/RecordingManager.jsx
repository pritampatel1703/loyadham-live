import { useState, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════
   RECORDING MANAGER — ISO Recording, File Naming, Encoding
   ═══════════════════════════════════════════════════════════ */

const FORMATS = [
  { id: 'mp4', label: 'MP4 (H.264)', ext: '.mp4', codec: 'libx264' },
  { id: 'mov', label: 'MOV (ProRes)', ext: '.mov', codec: 'prores' },
  { id: 'mkv', label: 'MKV (H.265)', ext: '.mkv', codec: 'libx265' },
  { id: 'ts', label: 'MPEG-TS', ext: '.ts', codec: 'libx264' },
];

const QUALITIES = [
  { id: 'proxy', label: 'Proxy (Low)', bitrate: '5 Mbps', resolution: '1280×720' },
  { id: 'standard', label: 'Standard', bitrate: '15 Mbps', resolution: '1920×1080' },
  { id: 'high', label: 'High Quality', bitrate: '35 Mbps', resolution: '1920×1080' },
  { id: 'master', label: 'Master (Max)', bitrate: '65 Mbps', resolution: '3840×2160' },
];

export default function RecordingManager() {
  const [recordings, setRecordings] = useState([
    { id: 'r1', name: 'Sunday_Service_2025-09-14', status: 'idle', format: 'mp4', quality: 'standard', source: 'PGM', duration: 0, fileSize: 0, startedAt: null, path: 'D:/Recordings/', isoTracks: [] },
  ]);
  const [isoEnabled, setIsoEnabled] = useState(false);
  const [isoSources, setIsoSources] = useState([
    { id: 'iso1', name: 'CAM 1', enabled: true, recording: false },
    { id: 'iso2', name: 'CAM 2', enabled: true, recording: false },
    { id: 'iso3', name: 'CAM 3', enabled: false, recording: false },
    { id: 'iso4', name: 'CAM 4', enabled: false, recording: false },
    { id: 'iso5', name: 'CAM 5', enabled: false, recording: false },
  ]);
  const [settings, setSettings] = useState({
    format: 'mp4', quality: 'standard', path: 'D:/Recordings/',
    namingTemplate: '{event}_{date}_{time}',
    splitDuration: 0, // 0 = no split, in minutes
  });
  const [globalRecording, setGlobalRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [diskSpace, setDiskSpace] = useState({ total: 500 * 1e9, used: 180 * 1e9, free: 320 * 1e9 });

  // Timer for recording
  useEffect(() => {
    if (!globalRecording) return;
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, [globalRecording]);

  // Simulate disk usage
  useEffect(() => {
    if (!globalRecording) return;
    const id = setInterval(() => {
      setDiskSpace(prev => ({
        ...prev,
        used: prev.used + 2000000, // ~2MB/s
        free: prev.free - 2000000,
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [globalRecording]);

  const startRecording = () => {
    setGlobalRecording(true);
    setElapsed(0);
    setRecordings(prev => prev.map(r => r.status === 'idle' ? { ...r, status: 'recording', startedAt: new Date().toISOString() } : r));
    if (isoEnabled) setIsoSources(prev => prev.map(s => s.enabled ? { ...s, recording: true } : s));
  };

  const stopRecording = () => {
    setGlobalRecording(false);
    setRecordings(prev => prev.map(r => r.status === 'recording' ? { ...r, status: 'completed', duration: elapsed } : r));
    setIsoSources(prev => prev.map(s => ({ ...s, recording: false })));
  };

  const formatTime = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const formatBytes = (b) => {
    const gb = b / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`;
  };

  const diskPercent = Math.round((diskSpace.used / diskSpace.total) * 100);

  return (
    <div className="rec-mgr">
      <div className="rec-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>⏺️ Recording Manager</h2>
          <p style={{ margin: 0, fontSize: '.78rem', color: 'var(--text-muted)' }}>ISO recording, encoding settings, and file management</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!globalRecording ? (
            <button className="btn btn-sm btn-danger" onClick={startRecording}>⏺ Start Recording</button>
          ) : (
            <button className="btn btn-sm btn-outline" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={stopRecording}>⏹ Stop Recording</button>
          )}
        </div>
      </div>

      {/* Recording Status Bar */}
      {globalRecording && (
        <div className="rec-status-bar">
          <div className="rec-status-indicator">
            <span className="rec-dot"></span>
            <span style={{ fontWeight: 800 }}>REC</span>
          </div>
          <span className="rec-timer">{formatTime(elapsed)}</span>
          <span className="rec-file-size">~{formatBytes(elapsed * 2000000)}</span>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
            {FORMATS.find(f => f.id === settings.format)?.label} · {QUALITIES.find(q => q.id === settings.quality)?.label}
          </span>
        </div>
      )}

      <div className="rec-layout">
        {/* Settings Panel */}
        <div className="rec-settings-panel">
          <div className="rec-section-title">⚙️ Encoding Settings</div>
          <div className="rec-settings-grid">
            <div className="form-group">
              <label className="form-label">Format</label>
              <select className="form-input" value={settings.format} disabled={globalRecording} onChange={e => setSettings({...settings, format: e.target.value})}>
                {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quality</label>
              <select className="form-input" value={settings.quality} disabled={globalRecording} onChange={e => setSettings({...settings, quality: e.target.value})}>
                {QUALITIES.map(q => <option key={q.id} value={q.id}>{q.label} ({q.bitrate})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Save Path</label>
              <input className="form-input" value={settings.path} onChange={e => setSettings({...settings, path: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">File Naming Template</label>
              <input className="form-input" value={settings.namingTemplate} onChange={e => setSettings({...settings, namingTemplate: e.target.value})} />
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>Variables: {'{event}'}, {'{date}'}, {'{time}'}, {'{cam}'}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Auto-Split (minutes, 0=off)</label>
              <input className="form-input" type="number" value={settings.splitDuration} onChange={e => setSettings({...settings, splitDuration: parseInt(e.target.value) || 0})} />
            </div>
          </div>

          {/* Disk Space */}
          <div className="rec-section-title" style={{ marginTop: 12 }}>💾 Storage</div>
          <div className="rec-disk">
            <div className="rec-disk-bar">
              <div className="rec-disk-fill" style={{
                width: `${diskPercent}%`,
                background: diskPercent > 90 ? '#ef4444' : diskPercent > 70 ? '#fbbf24' : '#4ade80',
              }}></div>
            </div>
            <div className="rec-disk-info">
              <span>{formatBytes(diskSpace.used)} used</span>
              <span>{formatBytes(diskSpace.free)} free</span>
              <span>{formatBytes(diskSpace.total)} total</span>
            </div>
          </div>
        </div>

        {/* ISO Recording */}
        <div className="rec-iso-panel">
          <div className="rec-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🎬 ISO Recording</span>
            <button className={`btn btn-xs ${isoEnabled ? 'btn-primary' : 'btn-outline'}`} onClick={() => setIsoEnabled(!isoEnabled)} disabled={globalRecording}>
              {isoEnabled ? 'ISO ON' : 'ISO OFF'}
            </button>
          </div>
          <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
            Record individual camera sources alongside the program output
          </p>
          <div className="rec-iso-grid">
            {isoSources.map(s => (
              <div key={s.id} className={`rec-iso-card ${s.recording ? 'recording' : ''}`}>
                <div className="rec-iso-top">
                  <span className="rec-iso-name">{s.name}</span>
                  {s.recording && <span className="rec-iso-badge">⏺ REC</span>}
                </div>
                <div className="rec-iso-preview">
                  <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>📹</span>
                </div>
                <label className="rec-iso-toggle">
                  <input type="checkbox" checked={s.enabled} disabled={globalRecording}
                    onChange={() => setIsoSources(prev => prev.map(i => i.id === s.id ? { ...i, enabled: !i.enabled } : i))} />
                  <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Recording History */}
        <div className="rec-history-panel">
          <div className="rec-section-title">📋 Recording History</div>
          {recordings.map(r => (
            <div key={r.id} className="rec-history-item">
              <div className="rec-history-status">
                {r.status === 'recording' ? <span className="badge badge-danger" style={{ fontSize: '.55rem' }}>⏺ REC</span> :
                 r.status === 'completed' ? <span className="badge badge-online" style={{ fontSize: '.55rem' }}>✓ Done</span> :
                 <span className="badge badge-default" style={{ fontSize: '.55rem' }}>Idle</span>}
              </div>
              <div className="rec-history-info">
                <div style={{ fontWeight: 700, fontSize: '.8rem' }}>{r.name}</div>
                <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
                  {r.startedAt ? new Date(r.startedAt).toLocaleString('en-IN') : 'Not started'} · {r.duration ? formatTime(r.duration) : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
