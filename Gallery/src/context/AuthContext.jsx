import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {

const init = window.__INIT__ || {};
const [user, setUser]       = useState(init.user     ?? null);
const [isAdmin, setIsAdmin] = useState(init.is_admin ?? false);
const [loading, setLoading] = useState(!init.user);   // ← use __INIT__

useEffect(() => {
  if (!init.user) {  
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.username || null);
        setIsAdmin(d.is_admin || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
}, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
