import { useState, useEffect, useRef } from 'react';
import { analyticsApi, systemApi, devicesApi, eventsApi } from '../api/client';
import { productionSocket } from '../socket';

/* ═══════════════════════════════════════════════════════════
   COMMAND CENTER — Real-time Mission Control Dashboard
   ═══════════════════════════════════════════════════════════ */

const formatBytes = (b) => {
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getHealthColor = (percent) => {
  if (percent < 50) return '#4ade80';  // green
  if (percent < 75) return '#fbbf24';  // amber
  if (percent < 90) return '#fb923c';  // orange
  return '#ef4444';  // red
};

const getHealthGlow = (percent) => {
  const color = getHealthColor(percent);
  return `0 0 20px ${color}40, 0 0 40px ${color}20`;
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cpuHistory, setCpuHistory] = useState(new Array(30).fill(0));
  const [memHistory, setMemHistory] = useState(new Array(30).fill(0));
  const [now, setNow] = useState(new Date());
  const [activeAlerts, setActiveAlerts] = useState([]);
  const canvasRef = useRef(null);
  const cpuCanvasRef = useRef(null);
  const memCanvasRef = useRef(null);

  // Load all data
  const loadAll = async () => {
    try {
      const [dash, sys, devs, evts] = await Promise.all([
        analyticsApi.dashboard().catch(() => null),
        systemApi.health().catch(() => null),
        devicesApi.list().catch(() => ({ devices: [] })),
        eventsApi.list().catch(() => ({ events: [] })),
      ]);
      setData(dash);
      setHealth(sys);
      setDevices(devs?.devices || []);
      setEvents(evts?.events || []);

      // Generate alerts
      const alerts = [];
      if (sys?.cpu?.percent > 85) alerts.push({ type: 'warning', icon: '🔥', msg: `CPU usage critical: ${sys.cpu.percent}%` });
      if (sys?.memory?.percent > 85) alerts.push({ type: 'warning', icon: '💾', msg: `RAM usage high: ${sys.memory.percent}%` });
      (devs?.devices || []).forEach(d => {
        if (d.is_online && d.battery_percent >= 0 && d.battery_percent < 20) {
          alerts.push({ type: 'danger', icon: '🔋', msg: `${d.name}: Battery low (${d.battery_percent}%)` });
        }
      });
      setActiveAlerts(alerts);

      // Update history
      if (sys) {
        setCpuHistory(prev => [...prev.slice(1), sys.cpu?.percent || 0]);
        setMemHistory(prev => [...prev.slice(1), sys.memory?.percent || 0]);
      }
    } catch (e) { console.error('[Dashboard] Load error:', e); }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    productionSocket.connect();
    productionSocket.on('device:online', loadAll);
    productionSocket.on('device:offline', loadAll);
    const dataId = setInterval(loadAll, 5000);
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(dataId);
      clearInterval(clockId);
      productionSocket.off('device:online', loadAll);
      productionSocket.off('device:offline', loadAll);
      productionSocket.disconnect();
    };
  }, []);

  // Draw sparkline on canvas
  useEffect(() => {
    drawSparkline(cpuCanvasRef.current, cpuHistory, getHealthColor(health?.cpu?.percent || 0));
    drawSparkline(memCanvasRef.current, memHistory, getHealthColor(health?.memory?.percent || 0));
  }, [cpuHistory, memHistory, health]);

  function drawSparkline(canvas, data, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (val / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (val / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (loading) return (
    <div className="empty-state">
      <div className="empty-icon" style={{ animation: 'pulse 1.5s infinite' }}>⚡</div>
      <h3>Initializing Command Center…</h3>
    </div>
  );

  const s = data?.stats || {};
  const onlineDevices = devices.filter(d => d.is_online);
  const offlineDevices = devices.filter(d => !d.is_online);

  // Find next event for countdown
  const nextEvent = events
    .filter(e => e.status === 'scheduled' && e.scheduled_start)
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))[0];

  const activeEvent = events.find(e => e.status === 'live');

  let countdown = null;
  if (nextEvent) {
    const diff = new Date(nextEvent.scheduled_start) - now;
    if (diff > 0) {
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      countdown = { hrs, mins, secs, title: nextEvent.title };
    }
  }

  return (
    <div className="cmd-center">
      {/* ═══ Alert Banner ═══ */}
      {activeAlerts.length > 0 && (
        <div className="cmd-alerts">
          {activeAlerts.map((a, i) => (
            <div key={i} className={`cmd-alert cmd-alert-${a.type}`}>
              <span>{a.icon}</span>
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Top Stats Row ═══ */}
      <div className="cmd-stats-row">
        {/* Live Event / Countdown */}
        <div className="cmd-stat-card cmd-stat-hero">
          {activeEvent ? (
            <>
              <div className="cmd-live-badge">
                <span className="cmd-live-dot"></span>
                LIVE NOW
              </div>
              <div className="cmd-hero-title">{activeEvent.title}</div>
              <div className="cmd-hero-sub">
                Started {activeEvent.actual_start ? new Date(activeEvent.actual_start).toLocaleTimeString() : 'recently'}
              </div>
            </>
          ) : countdown ? (
            <>
              <div className="cmd-countdown-label">Next Event</div>
              <div className="cmd-countdown">
                <div className="cmd-countdown-block">
                  <span className="cmd-countdown-num">{String(countdown.hrs).padStart(2, '0')}</span>
                  <span className="cmd-countdown-unit">HRS</span>
                </div>
                <span className="cmd-countdown-sep">:</span>
                <div className="cmd-countdown-block">
                  <span className="cmd-countdown-num">{String(countdown.mins).padStart(2, '0')}</span>
                  <span className="cmd-countdown-unit">MIN</span>
                </div>
                <span className="cmd-countdown-sep">:</span>
                <div className="cmd-countdown-block">
                  <span className="cmd-countdown-num">{String(countdown.secs).padStart(2, '0')}</span>
                  <span className="cmd-countdown-unit">SEC</span>
                </div>
              </div>
              <div className="cmd-hero-sub">{countdown.title}</div>
            </>
          ) : (
            <>
              <div className="cmd-hero-title" style={{ fontSize: '1.1rem' }}>No Events Scheduled</div>
              <div className="cmd-hero-sub">Create an event to get started</div>
            </>
          )}
        </div>

        {/* Quick Stat Cards */}
        <div className="cmd-stat-card">
          <div className="cmd-stat-icon" style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)' }}>📹</div>
          <div className="cmd-stat-info">
            <div className="cmd-stat-value">{onlineDevices.length}</div>
            <div className="cmd-stat-label">Online Cameras</div>
            <div className="cmd-stat-sub">{devices.length} total</div>
          </div>
        </div>

        <div className="cmd-stat-card">
          <div className="cmd-stat-icon" style={{ background: 'linear-gradient(135deg, #60a5fa, #3b82f6)' }}>📡</div>
          <div className="cmd-stat-info">
            <div className="cmd-stat-value">{s.active_streams || 0}</div>
            <div className="cmd-stat-label">Active Streams</div>
            <div className="cmd-stat-sub">Live now</div>
          </div>
        </div>

        <div className="cmd-stat-card">
          <div className="cmd-stat-icon" style={{ background: 'linear-gradient(135deg, #c084fc, #a855f7)' }}>📅</div>
          <div className="cmd-stat-info">
            <div className="cmd-stat-value">{s.total_events || 0}</div>
            <div className="cmd-stat-label">Total Events</div>
            <div className="cmd-stat-sub">All time</div>
          </div>
        </div>
      </div>

      {/* ═══ System Health Monitor ═══ */}
      <div className="cmd-section-header">
        <span className="cmd-section-icon">💻</span>
        <span>System Health Monitor</span>
        <span className="cmd-section-badge">{health?.uptime?.processFormatted || '—'} uptime</span>
      </div>

      <div className="cmd-health-grid">
        {/* CPU */}
        <div className="cmd-health-card">
          <div className="cmd-health-header">
            <span>🔲 CPU</span>
            <span className="cmd-health-val" style={{ color: getHealthColor(health?.cpu?.percent || 0) }}>
              {health?.cpu?.percent || 0}%
            </span>
          </div>
          <div className="cmd-gauge-wrap">
            <div className="cmd-gauge-bar">
              <div className="cmd-gauge-fill" style={{
                width: `${health?.cpu?.percent || 0}%`,
                background: `linear-gradient(90deg, #4ade80, ${getHealthColor(health?.cpu?.percent || 0)})`,
                boxShadow: getHealthGlow(health?.cpu?.percent || 0),
              }}></div>
            </div>
          </div>
          <canvas ref={cpuCanvasRef} className="cmd-sparkline"></canvas>
          <div className="cmd-health-meta">
            <span>{health?.cpu?.cores || 0} cores</span>
            <span>{health?.cpu?.speed || 0} MHz</span>
          </div>
        </div>

        {/* Memory */}
        <div className="cmd-health-card">
          <div className="cmd-health-header">
            <span>💾 Memory</span>
            <span className="cmd-health-val" style={{ color: getHealthColor(health?.memory?.percent || 0) }}>
              {health?.memory?.percent || 0}%
            </span>
          </div>
          <div className="cmd-gauge-wrap">
            <div className="cmd-gauge-bar">
              <div className="cmd-gauge-fill" style={{
                width: `${health?.memory?.percent || 0}%`,
                background: `linear-gradient(90deg, #60a5fa, ${getHealthColor(health?.memory?.percent || 0)})`,
                boxShadow: getHealthGlow(health?.memory?.percent || 0),
              }}></div>
            </div>
          </div>
          <canvas ref={memCanvasRef} className="cmd-sparkline"></canvas>
          <div className="cmd-health-meta">
            <span>{formatBytes(health?.memory?.used || 0)} used</span>
            <span>{formatBytes(health?.memory?.total || 0)} total</span>
          </div>
        </div>

        {/* Network */}
        <div className="cmd-health-card">
          <div className="cmd-health-header">
            <span>🌐 Network</span>
            <span className="cmd-health-val" style={{ color: '#4ade80' }}>
              {health?.network?.interfaces?.length || 0} NIC{(health?.network?.interfaces?.length || 0) !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="cmd-network-list">
            {(health?.network?.interfaces || []).slice(0, 3).map((nic, i) => (
              <div key={i} className="cmd-network-item">
                <span className="cmd-network-name">{nic.name}</span>
                <span className="cmd-network-ip">{nic.ip}</span>
              </div>
            ))}
            {(!health?.network?.interfaces || health.network.interfaces.length === 0) && (
              <div className="cmd-network-item"><span className="cmd-network-name">No interfaces</span></div>
            )}
          </div>
          <div className="cmd-health-meta">
            <span>{health?.network?.hostname || '—'}</span>
            <span>{health?.platform?.os || '—'}</span>
          </div>
        </div>

        {/* Server */}
        <div className="cmd-health-card">
          <div className="cmd-health-header">
            <span>⚡ Server</span>
            <span className="cmd-health-val" style={{ color: '#4ade80' }}>Online</span>
          </div>
          <div className="cmd-server-info">
            <div className="cmd-server-row">
              <span>Node.js</span>
              <span className="cmd-server-val">{health?.platform?.nodeVersion || '—'}</span>
            </div>
            <div className="cmd-server-row">
              <span>Process Uptime</span>
              <span className="cmd-server-val">{health?.uptime?.processFormatted || '—'}</span>
            </div>
            <div className="cmd-server-row">
              <span>System Uptime</span>
              <span className="cmd-server-val">{health?.uptime?.systemFormatted || '—'}</span>
            </div>
            <div className="cmd-server-row">
              <span>Architecture</span>
              <span className="cmd-server-val">{health?.platform?.arch || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Quick Actions ═══ */}
      <div className="cmd-section-header">
        <span className="cmd-section-icon">🎯</span>
        <span>Quick Actions</span>
      </div>
      <div className="cmd-actions-row">
        <button className="cmd-action-btn cmd-action-green" onClick={() => window.location.href = '/production'}>
          <span>🎬</span><span>Open Production</span>
        </button>
        <button className="cmd-action-btn cmd-action-blue" onClick={() => window.location.href = '/switchers'}>
          <span>🔀</span><span>Switcher Hub</span>
        </button>
        <button className="cmd-action-btn cmd-action-purple" onClick={() => window.location.href = '/vmix'}>
          <span>🎛️</span><span>vMix Control</span>
        </button>
        <button className="cmd-action-btn cmd-action-orange" onClick={() => window.location.href = '/atem'}>
          <span>🎚️</span><span>ATEM Control</span>
        </button>
        <button className="cmd-action-btn cmd-action-cyan" onClick={() => window.location.href = '/streaming'}>
          <span>📡</span><span>Streaming</span>
        </button>
        <button className="cmd-action-btn cmd-action-red" onClick={() => window.location.href = '/output/pgm'}>
          <span>📺</span><span>PGM Output</span>
        </button>
      </div>

      {/* ═══ Bottom Grid: Devices + Activity Log ═══ */}
      <div className="cmd-bottom-grid">
        {/* Device Fleet */}
        <div className="cmd-panel">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">📹 Device Fleet</span>
            <span className="badge badge-online" style={{ fontSize: '.65rem' }}>
              {onlineDevices.length} online
            </span>
          </div>
          <div className="cmd-device-list">
            {devices.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.85rem', padding: 16 }}>No devices registered</div>
            ) : (
              devices.slice(0, 10).map(d => (
                <div key={d.id} className={`cmd-device-item ${d.is_online ? 'online' : 'offline'}`}>
                  <span className={`cmd-device-dot ${d.is_online ? 'online' : 'offline'}`}></span>
                  <div className="cmd-device-info">
                    <span className="cmd-device-name">{d.name || d.label || 'Camera'}</span>
                    <span className="cmd-device-meta">
                      {d.device_model || 'Unknown'} · {d.is_online ? '🟢 Live' : '⚫ Offline'}
                      {d.battery_percent >= 0 ? ` · 🔋${d.battery_percent}%` : ''}
                    </span>
                  </div>
                  <div className="cmd-device-tally">
                    {d.tally_state === 'program' && <span className="badge badge-danger" style={{ fontSize: '.55rem' }}>PGM</span>}
                    {d.tally_state === 'preview' && <span className="badge badge-online" style={{ fontSize: '.55rem' }}>PVW</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity Log */}
        <div className="cmd-panel">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">📋 Live Activity</span>
            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>Auto-refreshing</span>
          </div>
          <div className="cmd-log-list">
            {(data?.recent_logs || []).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.85rem', padding: 16 }}>No recent activity</div>
            ) : (
              (data?.recent_logs || []).slice(0, 15).map((log, i) => (
                <div key={i} className="cmd-log-item">
                  <span className="cmd-log-time">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`cmd-log-type cmd-log-type-${log.type}`}>{log.type}</span>
                  <span className="cmd-log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="cmd-panel">
          <div className="cmd-panel-header">
            <span className="cmd-panel-title">📅 Upcoming Events</span>
          </div>
          <div className="cmd-events-list">
            {events.filter(e => e.status === 'scheduled' || e.status === 'live').length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.85rem', padding: 16 }}>No upcoming events</div>
            ) : (
              events.filter(e => e.status === 'scheduled' || e.status === 'live').slice(0, 5).map(e => (
                <div key={e.id} className="cmd-event-item">
                  <div className="cmd-event-top">
                    <span className="cmd-event-title">{e.title}</span>
                    <span className={`badge ${e.status === 'live' ? 'badge-danger' : 'badge-info'}`} style={{ fontSize: '.55rem' }}>
                      {e.status === 'live' ? '🔴 LIVE' : e.status}
                    </span>
                  </div>
                  <div className="cmd-event-time">
                    {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══ Footer Info ═══ */}
      <div className="cmd-footer">
        <span>⚡ Pixel Perfect v2.0 — Command Center</span>
        <span>Last updated: {now.toLocaleTimeString('en-IN')}</span>
        <span>{health?.platform?.os} {health?.platform?.arch} · Node {health?.platform?.nodeVersion}</span>
      </div>
    </div>
  );
}
