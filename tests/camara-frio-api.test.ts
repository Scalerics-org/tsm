import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Las rutas de la cámara de frío.
 *
 * Lo que tiene que ser cierto: que el gasoil de la cámara NUNCA caiga en `fuel_logs` (de ahí
 * sale todo el km/L), que sólo se registre en los camiones que la llevan, y que las horas
 * las ponga la oficina y nadie más.
 */

const SECRET = "test-secret-tsm";

type Escritura = { sql: string; binds: unknown[] };

function fakeDB(escrituras: Escritura[], opts: { camaraFrio?: boolean; surtida?: unknown } = {}) {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const q = sql.toLowerCase();
      const stmt = {
        bind: (...b: unknown[]) => {
          binds = b;
          return stmt;
        },
        first: async () => {
          if (q.includes("from users")) return { id: 2 };
          if (q.includes("from drivers")) return { status: "activo", default_truck_id: 1 };
          if (q.includes("select camara_frio from trucks")) return { camara_frio: opts.camaraFrio ? 1 : 0 };
          if (q.includes("from surtidas_frio")) return opts.surtida ?? null;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          escrituras.push({ sql: sql.replace(/\s+/g, " ").trim().toLowerCase(), binds });
          return { meta: { last_row_id: 11 } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const token = (role: string) =>
  signToken({ id: 2, name: "Quien sea", role, driver_id: 1, truck_id: 1, email: null } as any, SECRET);

async function pedir(
  url: string,
  rol: string,
  init: { method: string; body?: BodyInit; json?: unknown },
  opts: { camaraFrio?: boolean; surtida?: unknown } = {},
) {
  const escrituras: Escritura[] = [];
  const headers: Record<string, string> = { authorization: `Bearer ${await token(rol)}` };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await app.request(
    url,
    { method: init.method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body },
    { DB: fakeDB(escrituras, opts), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, escrituras, body: (await res.json()) as any };
}

const litros = (n: string) => {
  const fd = new FormData();
  fd.append("liters", n);
  return fd;
};

describe("POST /api/frio — el chofer registra la surtida de la cámara", () => {
  it("se guarda en surtidas_frio y nunca en fuel_logs", async () => {
    const { status, escrituras } = await pedir("/api/frio", ROLES.CHOFER, { method: "POST", body: litros("85,5".replace(",", ".")) }, { camaraFrio: true });
    expect(status).toBe(201);
    const insert = escrituras.find((e) => e.sql.startsWith("insert into surtidas_frio"));
    expect(insert?.binds).toEqual([1, 1, 85.5, null]);
    expect(escrituras.some((e) => e.sql.includes("fuel_logs") || e.sql.includes("update trucks"))).toBe(false);
  });

  it("en un camión sin cámara de frío no se puede", async () => {
    const { status, escrituras } = await pedir("/api/frio", ROLES.CHOFER, { method: "POST", body: litros("80") }, { camaraFrio: false });
    expect(status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("sin litros no se guarda", async () => {
    const { status, escrituras } = await pedir("/api/frio", ROLES.CHOFER, { method: "POST", body: litros("0") }, { camaraFrio: true });
    expect(status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });
});

describe("GET /api/frio/estado — si al chofer se le muestra el botón", () => {
  it("dice si el camión con el que anda lleva cámara", async () => {
    const si = await pedir("/api/frio/estado", ROLES.CHOFER, { method: "GET" }, { camaraFrio: true });
    expect(si.body.data).toEqual({ camara_frio: true });
    const no = await pedir("/api/frio/estado", ROLES.CHOFER, { method: "GET" }, { camaraFrio: false });
    expect(no.body.data).toEqual({ camara_frio: false });
  });
});

describe("PUT /api/frio/horas/:truck/:mes — las horas las pone la oficina", () => {
  it("guarda inicio y fin del mes, con quién lo hizo", async () => {
    const { status, escrituras } = await pedir(
      "/api/frio/horas/3/2026-09",
      ROLES.ENCARGADO,
      { method: "PUT", json: { horas_inicio: 1_000, horas_fin: 1_120 } },
      { camaraFrio: true },
    );
    expect(status).toBe(200);
    const w = escrituras.find((e) => e.sql.startsWith("insert into horas_frio"));
    expect(w?.binds.slice(0, 5)).toEqual([3, "2026-09", 1_000, 1_120, 2]);
  });

  it("el chofer no puede", async () => {
    const { status, escrituras } = await pedir(
      "/api/frio/horas/3/2026-09",
      ROLES.CHOFER,
      { method: "PUT", json: { horas_inicio: 1_000, horas_fin: 1_120 } },
      { camaraFrio: true },
    );
    expect(status).toBe(403);
    expect(escrituras).toHaveLength(0);
  });

  it("el final menor que el inicio se rechaza", async () => {
    const { status, escrituras } = await pedir(
      "/api/frio/horas/3/2026-09",
      ROLES.ADMIN,
      { method: "PUT", json: { horas_inicio: 1_200, horas_fin: 1_100 } },
      { camaraFrio: true },
    );
    expect(status).toBe(400);
    expect(escrituras).toHaveLength(0);
  });

  it("un mes mal escrito se rechaza", async () => {
    const { status } = await pedir(
      "/api/frio/horas/3/2026-13",
      ROLES.ADMIN,
      { method: "PUT", json: { horas_inicio: 1, horas_fin: 2 } },
      { camaraFrio: true },
    );
    expect(status).toBe(400);
  });

  it("borrar una hora (vacía) se puede", async () => {
    const { status, escrituras } = await pedir(
      "/api/frio/horas/3/2026-09",
      ROLES.ADMIN,
      { method: "PUT", json: { horas_inicio: 1_000, horas_fin: null } },
      { camaraFrio: true },
    );
    expect(status).toBe(200);
    expect(escrituras[0].binds.slice(2, 4)).toEqual([1_000, null]);
  });
});

describe("corregir y borrar la surtida de la cámara", () => {
  const SURTIDA = { id: 5, truck_id: 3, driver_id: 1, liters: 80, r2_key_boleta: null, logged_at: "2026-09-10 10:00:00" };

  it("la oficina corrige los litros", async () => {
    const { status, escrituras } = await pedir("/api/frio/5", ROLES.ENCARGADO, { method: "PUT", json: { liters: 90 } }, { surtida: SURTIDA });
    expect(status).toBe(200);
    expect(escrituras[0].binds[0]).toBe(90);
  });

  it("el chofer no corrige ni borra", async () => {
    expect((await pedir("/api/frio/5", ROLES.CHOFER, { method: "PUT", json: { liters: 90 } }, { surtida: SURTIDA })).status).toBe(403);
    expect((await pedir("/api/frio/5", ROLES.CHOFER, { method: "DELETE" }, { surtida: SURTIDA })).status).toBe(403);
  });

  it("borrar una que no existe da 404", async () => {
    const { status, escrituras } = await pedir("/api/frio/99", ROLES.ADMIN, { method: "DELETE" });
    expect(status).toBe(404);
    expect(escrituras).toHaveLength(0);
  });
});
