import { useState, useEffect } from 'react';
import { analyticsApi } from '../api/client';
import { productionSocket } from '../socket';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => analyticsApi.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
    productionSocket.connect();
    productionSocket.on('device:online', load);
    productionSocket.on('device:offline', load);
    const id = setInterval(load, 15000);
    return () => { clearInterval(id); productionSocket.off('device:online', load); productionSocket.off('device:offline', load); productionSocket.disconnect(); };
  }, []);

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading dashboard…</h3></div>;

  const s = data?.stats || {};

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card accent"><span className="stat-icon">📹</span><div className="stat-label">Online Devices</div><div className="stat-value">{s.online_devices || 0}</div><div className="stat-sub">of {s.total_devices || 0} total</div></div>
        <div className="stat-card green"><span className="stat-icon">📡</span><div className="stat-label">Active Streams</div><div className="stat-value">{s.active_streams || 0}</div><div className="stat-sub">Live now</div></div>
        <div className="stat-card orange"><span className="stat-icon">📅</span><div className="stat-label">Total Events</div><div className="stat-value">{s.total_events || 0}</div><div className="stat-sub">All time</div></div>
        <div className="stat-card red"><span className="stat-icon">🎬</span><div className="stat-label">Live Event</div><div className="stat-value" style={{fontSize:'1.2rem'}}>{data?.active_event?.title || 'None'}</div><div className="stat-sub">{data?.active_event ? '🔴 LIVE NOW' : 'No active event'}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">📅 Scheduled Events</span></div>
          {(data?.scheduled_events || []).length === 0 ? <p style={{color:'var(--text-muted)',fontSize:'.9rem'}}>No upcoming events</p> : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {(data?.scheduled_events || []).map(e => (
                <div key={e.id} className="event-card">
                  <div className="event-title">{e.title}</div>
                  <div className="event-time">{e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : 'TBD'}</div>
                  <div className="event-status"><span className="badge badge-info"><span className="badge-dot"></span>{e.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">📋 Recent Activity</span></div>
          <div className="log-panel">
            {(data?.recent_logs || []).length === 0 ? <p style={{color:'var(--text-muted)',fontSize:'.9rem'}}>No recent activity</p> : (
              (data?.recent_logs || []).map((log, i) => (
                <div key={i} className="log-entry">
                  <span className="log-time">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className={`log-type ${log.type}`}>{log.type}</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
