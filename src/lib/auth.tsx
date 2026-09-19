import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ROLES, type AuthUser } from "@shared/domain";
import {
  api,
  ApiError,
  getToken,
  setToken,
  clearToken,
  getCachedUser,
  setCachedUser,
  SESION_CAIDA,
} from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Por qué se cerró la sesión sola, para que la pantalla de entrar lo diga. */
  motivoDeSalida: string;
  loginOffice: (email: string, password: string) => Promise<void>;
  loginDriver: (plate: string, pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [motivoDeSalida, setMotivoDeSalida] = useState("");

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

  // Cualquier pedido que vuelva con 401 —token vencido, o la oficina dio de baja al chofer—
  // devuelve la app a la pantalla de entrar, en vez de dejarla mostrando errores. Con el
  // motivo: "te echó y no sé por qué" es lo que termina en un llamado a la oficina.
  useEffect(() => {
    const caida = (e: Event) => {
      const motivo = (e as CustomEvent<{ motivo?: string }>).detail?.motivo;
      setMotivoDeSalida(motivo || "Se cerró tu sesión. Entrá de nuevo.");
      setUser(null);
    };
    window.addEventListener(SESION_CAIDA, caida);
    return () => window.removeEventListener(SESION_CAIDA, caida);
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
    setMotivoDeSalida("");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, motivoDeSalida, loginOffice, loginDriver, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * ¿Este usuario es de los que sólo miran?
 *
 * "Que él tenga opción solo de mirar, no tocar ni corregir." — Rodrigo, 19/9. Lo preguntan los
 * pocos componentes que son dueños de un botón que escribe (la fila de la lista, la ficha, las
 * cargas), en vez de pasarse un `soloMirar` de padre a hijo por media pantalla: la lista de
 * viajes tiene cuatro niveles y el prop se olvidaba en uno solo, que es justo donde queda el
 * botón que no tenía que estar.
 *
 * Esconder el botón es comodidad, no seguridad: quien de verdad lo frena es el servidor.
 */
export function useSoloMirar(): boolean {
  return useAuth().user?.role === ROLES.LECTOR;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
