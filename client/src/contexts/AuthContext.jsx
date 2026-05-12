import { createContext, useContext } from 'react';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  // === LOCAL RENDERLESS MODE ===
  // We completely ripped out login. Everyone is always super_admin.
  const user = { id: 'local-admin', username: 'admin', display_name: 'Broadcast Admin', role: 'super_admin', avatar: '' };

  return (
    <AuthContext.Provider value={{ user, loading: false, login: async () => {}, logout: () => {}, isAdmin: true }}>
      {children}
    </AuthContext.Provider>
  );
}
