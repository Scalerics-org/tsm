import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/** El aviso de Control de surtidas que parecen repetidas: sólo avisa, y sólo a la oficina. */

const SECRET = "test-secret-tsm";
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace("T", " ").slice(0, 19);

const log = (id: number, o: Record<string, unknown> = {}) => ({
  id,
  truck_id: 1,
  driver_id: 2,
  odometer_km: 481_250,
  liters: 220.8,
  is_full: 1,
  logged_at: hace(60),
  ...o,
});

async function alertas(role: string, filas: Record<string, unknown[]>) {
  const escrituras: string[] = [];
  const token = await signToken({ id: 2, name: "X", role, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const stmt: any = {
        bind: () => stmt,
        first: async () => (q.includes("from users") ? { id: 2, role } : null),
        all: async () => ({ results: Object.entries(filas).find(([k]) => q.includes(k))?.[1] ?? [] }),
        run: async () => (escrituras.push(q), { meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  const res = await app.request("/api/reports/alerts", { headers: { authorization: `Bearer ${token}` } }, {
    DB: db,
    JWT_SECRET: SECRET,
  } as any);
  return { status: res.status, data: ((await res.json()) as any).data, escrituras };
}

const camiones = { "from trucks": [{ id: 1, plate: "GTP 4383", avg_km_litro: 3 }] };

describe("Control: surtidas que parecen repetidas", () => {
  it("dos de gasoil iguales con 3 minutos de diferencia salen, con camión, litros y odómetro", async () => {
    const r = await alertas(ROLES.ADMIN, { ...camiones, "from fuel_logs": [log(2, { logged_at: hace(57) }), log(1)] });
    expect(r.data.surtidasRepetidas).toHaveLength(1);
    expect(r.data.surtidasRepetidas[0]).toMatchObject({
      tipo: "gasoil",
      plate: "GTP 4383",
      liters: 220.8,
      odometer_km: 481_250,
      minutos: 3,
    });
    expect(r.data.surtidasRepetidas[0].primera.id).toBe(1);
    expect(r.data.surtidasRepetidas[0].segunda.id).toBe(2);
  });

  it("dos parecidas con otro odómetro no salen", async () => {
    const r = await alertas(ROLES.ADMIN, {
      ...camiones,
      "from fuel_logs": [log(2, { logged_at: hace(57), odometer_km: 481_900 }), log(1)],
    });
    expect(r.data.surtidasRepetidas).toEqual([]);
  });

  it("las de cámara de frío también", async () => {
    const frio = (id: number, min: number) => ({ id, truck_id: 1, driver_id: 2, liters: 85.5, logged_at: hace(min) });
    const r = await alertas(ROLES.ADMIN, { ...camiones, "from surtidas_frio": [frio(6, 57), frio(5, 60)] });
    expect(r.data.surtidasRepetidas).toHaveLength(1);
    expect(r.data.surtidasRepetidas[0]).toMatchObject({ tipo: "frio", odometer_km: null, liters: 85.5 });
  });

  it("sólo avisa: no escribe nada", async () => {
    const r = await alertas(ROLES.ADMIN, { ...camiones, "from fuel_logs": [log(2, { logged_at: hace(57) }), log(1)] });
    expect(r.escrituras).toEqual([]);
  });

  it("el lector no llega a Control", async () => {
    const r = await alertas(ROLES.LECTOR, {});
    expect(r.status).toBe(403);
  });
});
