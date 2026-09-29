import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Las lecturas que usa la app tras un corte de señal para ver si una surtida ya quedó guardada.
 * Tienen que ser de sólo lectura y, para el chofer, ceñirse a SU camión.
 */

const SECRET = "test-secret-tsm";

function fakeDB(consultas: { sql: string; binds: unknown[] }[], escrituras: string[]) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const q = sql.toLowerCase();
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 7 };
          return null;
        },
        all: async () => {
          consultas.push({ sql: q, binds });
          return { results: [{ id: 1, truck_id: 7, driver_id: 1, odometer_km: 100, liters: 50, logged_at: "2026-09-29 17:00:00" }] };
        },
        run: async () => {
          escrituras.push(q);
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function pedir(ruta: string) {
  const consultas: { sql: string; binds: unknown[] }[] = [];
  const escrituras: string[] = [];
  const token = await signToken(
    { id: 1, name: "Carlos", role: ROLES.CHOFER, driver_id: 1, truck_id: 7, email: null } as any,
    SECRET,
  );
  const res = await app.request(ruta, { headers: { authorization: `Bearer ${token}` } }, {
    DB: fakeDB(consultas, escrituras),
    JWT_SECRET: SECRET,
  } as any);
  return { status: res.status, json: (await res.json()) as any, consultas, escrituras };
}

describe.each(["/api/fuel/recientes", "/api/frio/recientes"])("GET %s", (ruta) => {
  it("devuelve las surtidas del camión del chofer con la hora del servidor", async () => {
    const r = await pedir(ruta);
    expect(r.status).toBe(200);
    expect(r.json.data.ahora).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(r.json.data.surtidas).toHaveLength(1);
  });

  it("el chofer no elige el camión: aunque mande ?truck=99 se lee el suyo", async () => {
    const r = await pedir(`${ruta}?truck=99`);
    const lectura = r.consultas.find((c) => c.sql.includes("surtidas") || c.sql.includes("fuel_logs"));
    expect(lectura?.binds[0]).toBe(7);
  });

  it("no escribe nada", async () => {
    const r = await pedir(ruta);
    expect(r.escrituras).toEqual([]);
  });
});
