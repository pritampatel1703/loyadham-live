import { useState, useEffect } from 'react';
import { devicesApi } from '../api/client';
import { productionSocket } from '../socket';

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', label: '', group_name: 'Default' });
  const [qrData, setQrData] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => devicesApi.list().then(d => setDevices(d.devices || [])).catch(console.error).finally(() => setLoading(false));

  useEffect(() => {
    load();
    productionSocket.connect();
    productionSocket.on('device:online', load);
    productionSocket.on('device:offline', load);
    productionSocket.on('device:heartbeat', load);
    const id = setInterval(load, 10000);
    return () => { clearInterval(id); productionSocket.disconnect(); };
  }, []);

  const addDevice = async () => {
    try { await devicesApi.create(form); setShowAdd(false); setForm({ name: '', label: '', group_name: 'Default' }); load(); } catch (e) { alert(e.message); }
  };
  const delDevice = async (id) => { if (confirm('Delete device?')) { await devicesApi.delete(id); load(); } };
  const showQR = async (id) => { const d = await devicesApi.qr(id); setQrData(d); };

  const filtered = devices.filter(d => !filter || d.name.toLowerCase().includes(filter.toLowerCase()) || d.group_name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-input" placeholder="🔍 Search devices…" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 260 }} />
          <span className="badge badge-info">{devices.length} devices</span>
          <span className="badge badge-online"><span className="badge-dot"></span>{devices.filter(d => d.is_online).length} online</span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>➕ Add Device</button>
      </div>

      {loading ? <div className="empty-state"><h3>Loading…</h3></div> : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📹</div><h3>No devices found</h3><p>Add a camera device to get started</p></div>
      ) : (
        <div className="device-grid">
          {filtered.map(d => (
            <div key={d.id} className="device-card">
              <div className={`device-tally ${d.tally_state !== 'off' ? d.tally_state : ''}`}></div>
              <div className="device-card-header">
                <span className="device-name">{d.name}</span>
                <span className={`badge ${d.is_online ? 'badge-online' : 'badge-offline'}`}><span className="badge-dot"></span>{d.is_online ? 'Online' : 'Offline'}</span>
              </div>
              {d.label && <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{d.label}</div>}
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Group: {d.group_name}{d.device_model ? ` · ${d.device_model}` : ''}</div>
              <div className="device-meta">
                <div className="device-meta-item">🔋 <span className="device-meta-value">{d.battery_percent >= 0 ? d.battery_percent + '%' : '—'}</span></div>
                <div className="device-meta-item">📶 <span className="device-meta-value">{d.signal_quality >= 0 ? d.signal_quality + '%' : '—'}</span></div>
                <div className="device-meta-item">📐 <span className="device-meta-value">{d.stream_resolution || '—'}</span></div>
                <div className="device-meta-item">🎞️ <span className="device-meta-value">{d.stream_fps > 0 ? d.stream_fps + ' fps' : '—'}</span></div>
                <div className="device-meta-item">📊 <span className="device-meta-value">{d.stream_bitrate > 0 ? d.stream_bitrate + ' kbps' : '—'}</span></div>
                <div className="device-meta-item">🌐 <span className="device-meta-value">{d.network_type || '—'}</span></div>
              </div>
              {d.tags?.length > 0 && <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{d.tags.map(t => <span key={t} className="badge badge-info" style={{fontSize:'.65rem'}}>{t}</span>)}</div>}
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => showQR(d.id)}>📱 QR Pair</button>
                <button className="btn btn-sm btn-danger" onClick={() => delDevice(d.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Add New Device</h2>
            <div className="form-group"><label className="form-label">Device Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Camera 1" /></div>
            <div className="form-group"><label className="form-label">Label</label><input className="form-input" value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder="e.g. Main Hall" /></div>
            <div className="form-group"><label className="form-label">Group</label><input className="form-input" value={form.group_name} onChange={e => setForm({...form, group_name: e.target.value})} /></div>
            <div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={addDevice}>Create Device</button></div>
          </div>
        </div>
      )}

      {qrData && (
        <div className="modal-overlay" onClick={() => setQrData(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h2 className="modal-title">📱 Scan to Pair</h2>
            <img src={qrData.qr} alt="QR Code" style={{ width: 280, borderRadius: 12, margin: '12px auto' }} />
            <p style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontSize: '1.1rem', marginTop: 8 }}>{qrData.pairing_token}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 8 }}>Scan this QR code from the Pixel Perfect Android app</p>
            <div className="modal-actions" style={{justifyContent:'center'}}><button className="btn" onClick={() => setQrData(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
