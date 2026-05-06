import { createContext, useContext, useState, useEffect } from 'react';
import { authApi, getToken, setToken, clearToken } from '../api/client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      authApi.me().then(d => setUser(d.user)).catch(() => clearToken()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => { clearToken(); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'super_admin' || user?.role === 'production_admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
