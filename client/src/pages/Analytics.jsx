import { useState, useEffect } from 'react';
import { analyticsApi } from '../api/client';
import { Chart, registerables } from 'chart.js';
import { Line } from 'react-chartjs-2';
Chart.register(...registerables);

const chartOpts = (title) => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, plugins: { legend: { display: false }, title: { display: true, text: title, color: '#8899aa', font: { size: 11 } } }, scales: { x: { display: false }, y: { grid: { color: '#1a233220' }, ticks: { color: '#556677', font: { size: 10 } } } } });

export default function Analytics() {
  const [realtime, setRealtime] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('realtime');

  const load = async () => { const [r, h] = await Promise.all([analyticsApi.realtime(), analyticsApi.history('', 60)]); setRealtime(r); setHistory(h.snapshots || []); };
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);

  const bitrateData = { labels: history.slice(-30).map((_, i) => i), datasets: [{ data: history.slice(-30).map(s => s.bitrate), borderColor: '#00d4ff', backgroundColor: '#00d4ff20', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 }] };
  const fpsData = { labels: history.slice(-30).map((_, i) => i), datasets: [{ data: history.slice(-30).map(s => s.fps), borderColor: '#00e676', backgroundColor: '#00e67620', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 }] };
  const latencyData = { labels: history.slice(-30).map((_, i) => i), datasets: [{ data: history.slice(-30).map(s => s.latency_ms), borderColor: '#ffab00', backgroundColor: '#ffab0020', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 }] };

  const o = realtime?.overview || {};

  return (
    <div>
      <div className="tabs"><button className={`tab ${tab === 'realtime' ? 'active' : ''}`} onClick={() => setTab('realtime')}>📊 Real-time</button><button className={`tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>📹 Devices</button><button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>📈 History</button></div>

      {tab === 'realtime' && (
        <div>
          <div className="stats-grid">
            <div className="stat-card accent"><span className="stat-icon">📹</span><div className="stat-label">Online Devices</div><div className="stat-value">{o.online_devices || 0}</div></div>
            <div className="stat-card green"><span className="stat-icon">📡</span><div className="stat-label">Active Streams</div><div className="stat-value">{o.active_streams || 0}</div></div>
            <div className="stat-card orange"><span className="stat-icon">📊</span><div className="stat-label">Total Devices</div><div className="stat-value">{o.total_devices || 0}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="card"><div className="chart-container"><Line data={bitrateData} options={chartOpts('Bitrate (kbps)')} /></div></div>
            <div className="card"><div className="chart-container"><Line data={fpsData} options={chartOpts('FPS')} /></div></div>
            <div className="card"><div className="chart-container"><Line data={latencyData} options={chartOpts('Latency (ms)')} /></div></div>
          </div>
        </div>
      )}

      {tab === 'devices' && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table><thead><tr><th>Device</th><th>Bitrate</th><th>FPS</th><th>Latency</th><th>Battery</th><th>Signal</th><th>Resolution</th></tr></thead>
            <tbody>{(realtime?.devices || []).length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',color:'var(--text-muted)'}}>No devices online</td></tr> :
              (realtime?.devices || []).map(d => (
                <tr key={d.id}><td style={{fontWeight:600}}>{d.name}</td><td style={{fontFamily:'var(--mono)'}}>{d.bitrate} kbps</td><td style={{fontFamily:'var(--mono)'}}>{d.fps}</td><td style={{fontFamily:'var(--mono)'}}>—</td>
                  <td><span style={{color: d.battery < 20 ? 'var(--red)' : 'var(--green)', fontFamily:'var(--mono)'}}>{d.battery >= 0 ? d.battery + '%' : '—'}</span></td>
                  <td style={{fontFamily:'var(--mono)'}}>{d.signal >= 0 ? d.signal + '%' : '—'}</td><td style={{fontFamily:'var(--mono)'}}>{d.resolution || '—'}</td></tr>
              ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'history' && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table><thead><tr><th>Time</th><th>Device</th><th>Bitrate</th><th>FPS</th><th>Latency</th><th>Packet Loss</th><th>Battery</th></tr></thead>
            <tbody>{history.slice(0, 50).map((s, i) => (
              <tr key={i}><td style={{fontFamily:'var(--mono)',fontSize:'.8rem'}}>{new Date(s.created_at).toLocaleTimeString()}</td><td>{s.device_id?.slice(0,8) || '—'}</td>
                <td style={{fontFamily:'var(--mono)'}}>{s.bitrate}</td><td style={{fontFamily:'var(--mono)'}}>{s.fps}</td><td style={{fontFamily:'var(--mono)'}}>{s.latency_ms}ms</td>
                <td style={{fontFamily:'var(--mono)'}}>{s.packet_loss}%</td><td style={{fontFamily:'var(--mono)'}}>{s.battery_percent >= 0 ? s.battery_percent+'%' : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
