import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "@shared/domain";
import { api, ApiError, getToken, setToken, clearToken, getCachedUser, setCachedUser } from "./api";

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
      .then((u) => {
        setUser(u);
        setCachedUser(u);
      })
      .catch((e) => {
        // Un 401 ya borró la sesión en `request`: ahí sí hay que volver a entrar. Cualquier otra
        // falla —sin señal en el galpón, el servidor que tarda— NO es motivo para echar al chofer
        // y hacerle tipear patente y PIN de nuevo, parado y con guantes: se sigue con el usuario
        // que ya tenía, y el próximo pedido que haga dirá si la sesión sigue viva.
        if (!(e instanceof ApiError && e.status === 401)) setUser(getCachedUser());
      })
      .finally(() => setLoading(false));
  }, []);

  async function loginOffice(email: string, password: string) {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>("/auth/login", {
      email,
      password,
    });
    setToken(token);
    setCachedUser(user);
    setUser(user);
  }

  async function loginDriver(plate: string, pin: string) {
    const { token, user } = await api.post<{ token: string; user: AuthUser }>("/auth/driver-login", {
      plate,
      pin,
    });
    setToken(token);
    setCachedUser(user);
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
