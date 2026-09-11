import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { hashPassword } from "../api/lib/crypto";
import {
  BLOQUEO_MIN,
  MAX_FALLOS_CUENTA,
  MAX_FALLOS_IP,
  VENTANA_MIN,
  aTextoUtc,
  clavePatente,
  conFallo,
  minutosDeBloqueo,
} from "../api/lib/intentos-login";

/**
 * El límite de intentos del login.
 *
 * Ninguno de los dos logins contaba intentos. El del chofer es patente + PIN de 4 dígitos y la
 * patente es pública: eran 10.000 combinaciones sin freno. La auditoría del 11/9 lo confirmó con
 * un pedido real: un PIN mal respondía 401 al instante, sin ningún límite.
 */

const T0 = new Date("2026-09-11T12:00:00Z");
const mas = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("las reglas", () => {
  it("el quinto fallo seguido bloquea 15 minutos", () => {
    let r = null as ReturnType<typeof conFallo> | null;
    for (let i = 0; i < MAX_FALLOS_CUENTA - 1; i++) r = conFallo(r, T0, MAX_FALLOS_CUENTA);
    expect(minutosDeBloqueo(r, T0)).toBeNull();
    r = conFallo(r, T0, MAX_FALLOS_CUENTA);
    expect(minutosDeBloqueo(r, T0)).toBe(BLOQUEO_MIN);
  });

  it("el bloqueo se va solo cuando pasa el tiempo, y se vuelve a tener todos los intentos", () => {
    let r = null as ReturnType<typeof conFallo> | null;
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) r = conFallo(r, T0, MAX_FALLOS_CUENTA);
    expect(minutosDeBloqueo(r, mas(BLOQUEO_MIN - 1))).toBe(1);
    expect(minutosDeBloqueo(r, mas(BLOQUEO_MIN))).toBeNull();
    expect(conFallo(r, mas(BLOQUEO_MIN + 1), MAX_FALLOS_CUENTA).fallos).toBe(1);
  });

  it("los fallos viejos se olvidan: un PIN mal tipeado hoy no suma contra el de hace rato", () => {
    const r = conFallo(conFallo(null, T0, 5), T0, 5);
    expect(r.fallos).toBe(2);
    expect(conFallo(r, mas(VENTANA_MIN + 1), 5).fallos).toBe(1);
  });

  it("la patente se reconoce escrita de cualquier forma", () => {
    expect(clavePatente("gtp 4413")).toBe(clavePatente("GTP4413"));
  });

  it("las fechas quedan en UTC con el formato de la base", () => {
    expect(aTextoUtc(T0)).toBe("2026-09-11 12:00:00");
  });
});

/** Base falsa: el chofer, el usuario de oficina y la tabla de intentos en memoria. */
function fakeDB(hash: string, opts: { sinTabla?: boolean } = {}) {
  const intentos = new Map<string, Record<string, unknown>>();
  const rompe = () => {
    throw new Error("no such table: intentos_login");
  };
  const db = {
    prepare(sql: string) {
      const s = sql.toLowerCase().trim();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (s.includes("from drivers"))
            return { id: 3, name: "Charlie Rosano", pin_hash: hash, default_truck_id: 5, status: "activo" };
          if (s.includes("from users"))
            return { id: 2, email: "oficina@tsm.uy", name: "Oficina", role: "ENCARGADO", password_hash: hash };
          return null;
        },
        all: async () => {
          if (!s.includes("intentos_login")) return { results: [] };
          if (opts.sinTabla) rompe();
          return { results: binds.map((k) => intentos.get(k as string)).filter(Boolean) };
        },
        run: async () => {
          if (s.includes("intentos_login")) {
            if (opts.sinTabla) rompe();
            if (s.startsWith("insert"))
              intentos.set(binds[0] as string, { clave: binds[0], fallos: binds[1], bloqueado_hasta: binds[2], actualizado: binds[3] });
            if (s.startsWith("delete")) intentos.delete(binds[0] as string);
          }
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async (stmts: any[]) => {
      for (const st of stmts) await st.run();
      return [];
    },
  } as unknown as D1Database;
  return { db, intentos };
}

async function entrarChofer(db: D1Database, pin: string, plate = "GTP 4413", ip?: string) {
  const res = await app.request(
    "/api/auth/driver-login",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(ip ? { "CF-Connecting-IP": ip } : {}) },
      body: JSON.stringify({ plate, pin }),
    },
    { DB: db, JWT_SECRET: "test-secret-tsm" } as any,
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("el login del chofer", () => {
  it("cinco PIN mal y el sexto se frena con 429, AUNQUE sea el correcto", async () => {
    const { db } = fakeDB(await hashPassword("1234"));
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) expect((await entrarChofer(db, "0000")).status).toBe(401);
    const r = await entrarChofer(db, "1234");
    // Si el correcto entrara durante el bloqueo, el bloqueo le diría al atacante cuál es.
    expect(r.status).toBe(429);
    expect(r.json.error).toContain("Probá de nuevo en 15 minutos");
  });

  it("entrar bien borra los fallos de esa patente", async () => {
    const { db, intentos } = fakeDB(await hashPassword("1234"));
    await entrarChofer(db, "0000");
    await entrarChofer(db, "0000");
    expect((await entrarChofer(db, "1234")).status).toBe(200);
    expect(intentos.has(clavePatente("GTP 4413"))).toBe(false);
  });

  it("20 fallos desde la misma IP la bloquean, aunque sean patentes distintas", async () => {
    const { db } = fakeDB(await hashPassword("1234"));
    for (let i = 0; i < MAX_FALLOS_IP; i++) await entrarChofer(db, "0000", `AAA ${1000 + i}`, "9.9.9.9");
    expect((await entrarChofer(db, "1234", "ZZZ 9999", "9.9.9.9")).status).toBe(429);
  });

  it("si la tabla no existe todavía, el login sigue andando como antes", async () => {
    // El código puede llegar a producción antes que la migración: eso no puede dejar a todos
    // los choferes sin poder entrar.
    const { db } = fakeDB(await hashPassword("1234"), { sinTabla: true });
    expect((await entrarChofer(db, "0000")).status).toBe(401);
    expect((await entrarChofer(db, "1234")).status).toBe(200);
  });
});

describe("el login de oficina", () => {
  it("también se frena después de cinco contraseñas mal", async () => {
    const { db } = fakeDB(await hashPassword("clave-buena"));
    const entrar = (password: string) =>
      app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "Oficina@TSM.uy", password }),
        },
        { DB: db, JWT_SECRET: "test-secret-tsm" } as any,
      );
    for (let i = 0; i < MAX_FALLOS_CUENTA; i++) expect((await entrar("mala")).status).toBe(401);
    expect((await entrar("clave-buena")).status).toBe(429);
  });
});
