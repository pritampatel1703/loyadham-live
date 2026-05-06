import { useState, useEffect } from 'react';
import { analyticsApi } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [tab, setTab] = useState('general');

  const load = () => analyticsApi.settings(tab).then(d => setSettings(d.settings || [])).catch(console.error);
  useEffect(() => { load(); }, [tab]);

  const update = async (key, value, category) => {
    try { await analyticsApi.setSetting(key, value, category); load(); } catch(e) { alert(e.message); }
  };

  const categories = ['general', 'streaming', 'vmix', 'analytics', 'network'];

  return (
    <div>
      <div className="tabs">{categories.map(c => (
        <button key={c} className={`tab ${tab === c ? 'active' : ''}`} onClick={() => setTab(c)}>{c.charAt(0).toUpperCase() + c.slice(1)}</button>
      ))}</div>
      <div className="card" style={{ marginTop: 16 }}>
        {settings.length === 0 ? <p style={{color:'var(--text-muted)'}}>No settings in this category</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {settings.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.key.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{s.key}</div>
                </div>
                <input className="form-input" style={{ width: 260 }} value={s.value} onChange={e => {
                  setSettings(prev => prev.map(p => p.key === s.key ? { ...p, value: e.target.value } : p));
                }} onBlur={(e) => update(s.key, e.target.value, s.category)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><span className="card-title">🏗️ Future Architecture Status</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { name: 'SRT Streaming', status: 'Architecture Ready', color: 'orange' },
            { name: 'Network Bonding', status: 'Planned', color: 'red' },
            { name: 'PTZ Control', status: 'Planned', color: 'red' },
            { name: 'AI Camera Switch', status: 'Planned', color: 'red' },
            { name: 'NDI Workflows', status: 'Architecture Ready', color: 'orange' },
            { name: 'Cloud Relays', status: 'Planned', color: 'red' },
            { name: 'Tally System', status: 'Active', color: 'green' },
            { name: 'Return Video', status: 'Architecture Ready', color: 'orange' },
            { name: 'Intercom', status: 'Planned', color: 'red' },
            { name: 'Recording Archive', status: 'Planned', color: 'red' },
            { name: 'Multi-Location', status: 'Architecture Ready', color: 'orange' },
            { name: 'WebRTC', status: 'Active', color: 'green' },
          ].map(f => (
            <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '.85rem' }}>{f.name}</span>
              <span className={`badge badge-${f.color === 'green' ? 'online' : f.color === 'orange' ? 'warning' : 'offline'}`}>{f.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
