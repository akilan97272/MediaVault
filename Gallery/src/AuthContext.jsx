import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(window.CURRENT_USER || null);
  const [isAdmin, setIsAdmin] = useState(window.IS_ADMIN || false);
  const [loading, setLoading] = useState(!window.CURRENT_USER);

  useEffect(() => {
    if (!window.CURRENT_USER) {
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
