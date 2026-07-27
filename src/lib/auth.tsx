import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "@shared/domain";
import { api, getToken, setToken, clearToken } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  loginOffice: (email: string, password: string) => Promise<void>;
  loginDriver: (plate: string, pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function loginOffice(email: string, password: string) {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>("/auth/login", {
      email,
      password,
    });
    setToken(token);
    setUser(user);
  }

  async function loginDriver(plate: string, pin: string) {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>("/auth/driver-login", {
      plate,
      pin,
    });
    setToken(token);
    setUser(user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginOffice, loginDriver, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
