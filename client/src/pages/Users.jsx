import { useState, useEffect } from 'react';
import { authApi } from '../api/client';

const ROLES = ['super_admin', 'production_admin', 'operator', 'camera_operator', 'viewer'];
const roleColor = { super_admin: 'badge-live', production_admin: 'badge-warning', operator: 'badge-info', camera_operator: 'badge-online', viewer: 'badge-offline' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'operator' });

  const load = () => authApi.users().then(d => setUsers(d.users || [])).catch(console.error);
  useEffect(() => { load(); }, []);

  const add = async () => { try { await authApi.register(form); setShowAdd(false); setForm({ username: '', password: '', display_name: '', role: 'operator' }); load(); } catch (e) { alert(e.message); } };
  const changeRole = async (id, role) => { await authApi.updateRole(id, role); load(); };
  const del = async (id) => { if (confirm('Delete user?')) { try { await authApi.deleteUser(id); load(); } catch(e) { alert(e.message); } } };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <span className="badge badge-info">{users.length} users</span>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>➕ Add User</button>
      </div>
      <div className="table-wrap">
        <table><thead><tr><th>Username</th><th>Display Name</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}><td style={{fontWeight:600}}>{u.username}</td><td>{u.display_name}</td>
              <td><select className="form-input" style={{width:'auto',padding:'4px 8px',fontSize:'.8rem'}} value={u.role} onChange={e => changeRole(u.id, e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
              </select></td>
              <td style={{fontSize:'.8rem',color:'var(--text-muted)'}}>{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
              <td><button className="btn btn-sm btn-danger" onClick={() => del(u.id)}>🗑️</button></td></tr>
          ))}</tbody>
        </table>
      </div>
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">➕ Add User</h2>
            <div className="form-group"><label className="form-label">Username</label><input className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Display Name</label><input className="form-input" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>{ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}</select></div>
            <div className="modal-actions"><button className="btn" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={add}>Create User</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
