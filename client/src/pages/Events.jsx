import { useState, useEffect } from 'react';
import { eventsApi, devicesApi } from '../api/client';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', scheduled_start: '', scheduled_end: '' });

  const load = async () => { const [e, d] = await Promise.all([eventsApi.list(), devicesApi.list()]); setEvents(e.events || []); setDevices(d.devices || []); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing) { await eventsApi.update(editing, form); } else { await eventsApi.create(form); }
      setShowForm(false); setEditing(null); setForm({ title: '', description: '', scheduled_start: '', scheduled_end: '' }); load();
    } catch (e) { alert(e.message); }
  };
  const del = async (id) => { if (confirm('Delete event?')) { await eventsApi.delete(id); load(); } };
  const launch = async (id) => { await eventsApi.launch(id); load(); };
  const end = async (id) => { await eventsApi.end(id); load(); };
  const edit = (ev) => { setEditing(ev.id); setForm({ title: ev.title, description: ev.description, scheduled_start: ev.scheduled_start || '', scheduled_end: ev.scheduled_end || '' }); setShowForm(true); };

  const statusColor = { draft: 'badge-info', scheduled: 'badge-warning', live: 'badge-live', completed: 'badge-online', cancelled: 'badge-offline' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <span className="badge badge-info">{events.length} events</span>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ title: '', description: '', scheduled_start: '', scheduled_end: '' }); setShowForm(true); }}>➕ New Event</button>
      </div>

      {events.length === 0 ? <div className="empty-state"><div className="empty-icon">📅</div><h3>No events</h3><p>Create your first production event</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 16 }}>
          {events.map(ev => (
            <div key={ev.id} className="event-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div><div className="event-title">{ev.title}</div>{ev.description && <p style={{ fontSize: '.85rem', color: 'var(--text-secondary)', margin: '4px 0' }}>{ev.description}</p>}</div>
                <span className={`badge ${statusColor[ev.status] || 'badge-info'}`}><span className="badge-dot"></span>{ev.status}</span>
              </div>
              <div className="event-time" style={{ marginTop: 8 }}>
                {ev.scheduled_start && <span>📅 {new Date(ev.scheduled_start).toLocaleString()}</span>}
                {ev.scheduled_end && <span> → {new Date(ev.scheduled_end).toLocaleTimeString()}</span>}
              </div>
              {ev.assignments?.length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>📹 {ev.assignments.length} cameras assigned</span></div>}
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ev.status === 'draft' || ev.status === 'scheduled' ? <button className="btn btn-sm btn-success" onClick={() => launch(ev.id)}>🚀 Launch</button> : null}
                {ev.status === 'live' ? <button className="btn btn-sm btn-danger" onClick={() => end(ev.id)}>⏹ End</button> : null}
                <button className="btn btn-sm" onClick={() => edit(ev)}>✏️ Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(ev.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editing ? '✏️ Edit Event' : '➕ New Event'}</h2>
            <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Morning Satsang" /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">Start Time</label><input className="form-input" type="datetime-local" value={form.scheduled_start} onChange={e => setForm({ ...form, scheduled_start: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">End Time</label><input className="form-input" type="datetime-local" value={form.scheduled_end} onChange={e => setForm({ ...form, scheduled_end: e.target.value })} /></div>
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>{editing ? 'Update' : 'Create'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
