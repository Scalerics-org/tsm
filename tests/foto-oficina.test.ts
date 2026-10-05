import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * La oficina sube fotos a un viaje (el remito de un internacional que cargó ella, por ejemplo).
 *
 * Lo que se fija: admin y encargado pueden en cualquier estado del viaje, también facturado
 * (agregar un respaldo no cambia lo facturado); el "solo mirar" no puede nunca (lo frena la lista blanca de `requireAuth`), ni con R2
 * apagado; y el chofer sigue limitado a sus viajes.
 */

const SECRET = "test-secret-tsm";
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);

function viaje(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, template_id: null, provider_name: "Internacional", origin: "Mdeo", remite: null, destination: "Asunción",
    destinatario: null, driver_id: 1, truck_id: 1, cargo_type: "Varios", kilos: null, field_values: "{}",
    status: "COMPLETADO", started_at: "2026-09-18 07:30:00", finished_at: "2026-09-19 19:10:00", notes: null,
    created_at: "2026-09-18 07:30:00", segments: "[]", kilometros: null, edited_by: null, edited_at: null,
    factura_numero: null, facturado_at: null, facturado_by: null, driver_name: "Carlos", truck_plate: "STZ 4821",
    ...overrides,
  };
}

function fakeDB(trip: ReturnType<typeof viaje>, insertadas: unknown[][], role: string) {
  return {
    prepare(sql: string) {
      const s = sql.toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (s.includes("from users")) return { id: 2, role };
          if (s.includes("from trips")) return trip;
          if (s.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (s.includes("insert into trip_photos")) insertadas.push(binds);
          return { meta: { last_row_id: 7 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function subir(role: string, trip = viaje(), opts: { sinR2?: boolean; driverId?: number | null } = {}) {
  const insertadas: unknown[][] = [];
  const puestos: string[] = [];
  const r2 = { put: async (k: string) => void puestos.push(k) } as unknown as R2Bucket;
  const token = await signToken(
    { id: 2, name: "X", role, driver_id: opts.driverId ?? null, truck_id: 1, email: null } as any,
    SECRET,
  );
  const fd = new FormData();
  fd.append("file", new File([JPG], "remito.jpg", { type: "image/jpeg" }));
  fd.append("trip_id", "1");
  fd.append("kind", "descarga");
  const res = await app.request(
    "/api/photos",
    { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd },
    { DB: fakeDB(trip, insertadas, role), FOTOS: opts.sinR2 ? undefined : r2, JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any, insertadas, puestos };
}

describe("subir una foto desde la oficina", () => {
  it.each([ROLES.ADMIN, ROLES.ENCARGADO])("%s puede subirla a un viaje completado", async (rol) => {
    const r = await subir(rol);
    expect(r.status).toBe(201);
    expect(r.puestos).toHaveLength(1);
    expect(r.insertadas).toHaveLength(1);
  });

  it("también a uno en curso y a uno cancelado", async () => {
    expect((await subir(ROLES.ENCARGADO, viaje({ status: "EN_CURSO", finished_at: null }))).status).toBe(201);
    expect((await subir(ROLES.ENCARGADO, viaje({ status: "CANCELADO" }))).status).toBe(201);
  });

  it("también a uno ya facturado: agregar un respaldo no cambia lo facturado", async () => {
    const r = await subir(ROLES.ENCARGADO, viaje({ factura_numero: "A-123" }));
    expect(r.status).toBe(201);
  });

  it("el solo mirar no puede, y no se toca ni R2 ni la base", async () => {
    const r = await subir(ROLES.LECTOR);
    expect(r.status).toBe(403);
    expect(r.puestos).toEqual([]);
    expect(r.insertadas).toEqual([]);
  });

  it("el solo mirar tampoco puede cuando R2 no está configurado", async () => {
    expect((await subir(ROLES.LECTOR, viaje(), { sinR2: true })).status).toBe(403);
  });

  it("un chofer sólo sube a su propio viaje", async () => {
    expect((await subir(ROLES.CHOFER, viaje({ driver_id: 9 }), { driverId: 1 })).status).toBe(403);
    expect((await subir(ROLES.CHOFER, viaje({ driver_id: 1 }), { driverId: 1 })).status).toBe(201);
  });
});
