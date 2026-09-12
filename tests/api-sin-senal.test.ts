import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  api,
  ApiError,
  SIN_SENAL,
  ESPERA_MS,
  getCachedUser,
  setCachedUser,
  setToken,
  getToken,
  SESION_CAIDA,
} from "../src/lib/api";

/**
 * El cliente de la API con mala señal, que es como lo van a usar los choferes en octubre.
 *
 * Tres cosas que pasaban y ya no:
 *   - Un corte de señal salía como un TypeError de fetch, que cada pantalla traducía a su manera.
 *   - Sin tiempo límite, el botón podía quedar girando minutos sin decir nada.
 *   - Cualquier falla al abrir la app borraba la sesión: el chofer tenía que volver a tipear
 *     patente y PIN. Ahora sólo la borra un 401, y el usuario queda guardado para seguir.
 */

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const USUARIO = { id: 3, name: "Charlie Rosano", role: "CHOFER", driver_id: 3, truck_id: 5, email: null } as any;

describe("sin señal", () => {
  it("un fetch que no llega es un error claro, con status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const e = await api.get("/trips/active").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
    expect(e.message).toBe(SIN_SENAL);
  });

  it("si no responde a tiempo, se corta y avisa en vez de quedar girando", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
      ),
    );
    const pedido = api.post("/trips/1/finish", {}).catch((x) => x);
    await vi.advanceTimersByTimeAsync(ESPERA_MS + 1);
    const e = await pedido;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
  });

  it("un corte de señal NO borra la sesión", async () => {
    setToken("tok");
    setCachedUser(USUARIO);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await api.get("/auth/me").catch(() => undefined);
    expect(getToken()).toBe("tok");
    expect(getCachedUser()?.name).toBe("Charlie Rosano");
  });
});

describe("la sesión", () => {
  it("un 401 sí la borra, token y usuario guardado", async () => {
    setToken("tok");
    setCachedUser(USUARIO);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, json: async () => ({ success: false, error: "Sesión vencida" }) }),
    );
    const avisos: string[] = [];
    vi.stubGlobal("window", { dispatchEvent: (ev: Event) => void avisos.push(ev.type) });
    const e = await api.get("/auth/me").catch((x) => x);
    expect(e.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(getCachedUser()).toBeNull();
    // Y avisa, para que la app vuelva a la pantalla de entrar en vez de quedarse mostrando
    // "No autenticado" en cada cosa que se toque.
    expect(avisos).toEqual([SESION_CAIDA]);
  });

  it("un usuario guardado roto no rompe nada: vuelve null", () => {
    localStorage.setItem("logistica_user", "{no es json");
    expect(getCachedUser()).toBeNull();
  });
});
