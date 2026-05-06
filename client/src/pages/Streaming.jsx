import { useState, useEffect } from 'react';
import { streamsApi } from '../api/client';

export default function Streaming() {
  const [streams, setStreams] = useState([]);
  const [tab, setTab] = useState('active');
  const load = () => streamsApi.list(tab === 'active').then(d => setStreams(d.streams || [])).catch(console.error);
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [tab]);

  const statusColor = { idle: 'badge-info', connecting: 'badge-warning', live: 'badge-live', error: 'badge-offline', ended: 'badge-offline' };

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>📡 Active</button>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>📋 All Streams</button>
        <button className={`tab ${tab === 'infra' ? 'active' : ''}`} onClick={() => setTab('infra')}>🏗️ Infrastructure</button>
      </div>

      {tab !== 'infra' ? (
        streams.length === 0 ? <div className="empty-state"><div className="empty-icon">📡</div><h3>No {tab} streams</h3></div> : (
          <div className="table-wrap">
            <table><thead><tr><th>Stream ID</th><th>Protocol</th><th>Status</th><th>Resolution</th><th>FPS</th><th>Bitrate</th><th>Latency</th><th>Packet Loss</th><th>Uptime</th></tr></thead>
              <tbody>{streams.map(s => (
                <tr key={s.id}><td style={{fontFamily:'var(--mono)',fontSize:'.8rem'}}>{s.id.slice(0,8)}…</td><td><span className="badge badge-info">{s.protocol}</span></td>
                  <td><span className={`badge ${statusColor[s.status]}`}><span className="badge-dot"></span>{s.status}</span></td>
                  <td style={{fontFamily:'var(--mono)'}}>{s.resolution || '—'}</td><td style={{fontFamily:'var(--mono)'}}>{s.fps}</td><td style={{fontFamily:'var(--mono)'}}>{s.bitrate} kbps</td>
                  <td style={{fontFamily:'var(--mono)'}}>{s.latency_ms}ms</td><td style={{fontFamily:'var(--mono)'}}>{s.packet_loss}%</td>
                  <td style={{fontFamily:'var(--mono)'}}>{Math.floor(s.uptime_seconds/60)}m</td></tr>
              ))}</tbody>
            </table>
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">🌐 WebRTC Infrastructure</span><span className="badge badge-online">Active</span></div>
            <p style={{color:'var(--text-secondary)',fontSize:'.9rem',marginBottom:12}}>Primary streaming protocol for low-latency camera feeds.</p>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.85rem'}}><span style={{color:'var(--text-muted)'}}>Protocol</span><span>WebRTC</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.85rem'}}><span style={{color:'var(--text-muted)'}}>Signaling</span><span>Socket.IO</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.85rem'}}><span style={{color:'var(--text-muted)'}}>STUN/TURN</span><span>Configured</span></div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">📡 SRT (Future)</span><span className="badge badge-warning">Planned</span></div>
            <p style={{color:'var(--text-secondary)',fontSize:'.9rem',marginBottom:12}}>Secure Reliable Transport for professional broadcast feeds.</p>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.85rem'}}><span style={{color:'var(--text-muted)'}}>Status</span><span style={{color:'var(--orange)'}}>Architecture Ready</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.85rem'}}><span style={{color:'var(--text-muted)'}}>Port</span><span>—</span></div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">🖥️ MediaMTX</span><span className="badge badge-warning">Optional</span></div>
            <p style={{color:'var(--text-secondary)',fontSize:'.9rem',marginBottom:12}}>Multi-protocol media server for RTSP/RTMP/HLS/WebRTC restreaming.</p>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">📺 NDI (Future)</span><span className="badge badge-offline">Planned</span></div>
            <p style={{color:'var(--text-secondary)',fontSize:'.9rem',marginBottom:12}}>Network Device Interface for LAN-based production workflows.</p>
          </div>
        </div>
      )}
    </div>
  );
}
