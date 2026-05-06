import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="login-logo">⚡</span>
        <h1>Pixel Perfect</h1>
        <p>Broadcast Production Platform</p>
        <div className="form-group">
          <input id="login-username" className="form-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <input id="login-password" className="form-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="login-error">❌ {error}</p>}
        <button id="login-btn" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Signing in…' : '🔐 Sign In'}
        </button>
        <p style={{ marginTop: 16, fontSize: '.75rem', color: 'var(--text-muted)' }}>Loyadham Broadcast Operations</p>
      </form>
    </div>
  );
}
