import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Los dos últimos huecos de "un viaje facturado no se toca".
 *
 * Borrar el viaje, corregir sus cargas, cambiarle la fecha y corregir la cabecera ya frenaban
 * con 409 cuando el viaje estaba en una factura emitida. Cancelar y borrar una foto no.
 *
 * Cancelar saca el viaje del resumen (`viajesAFacturar` filtra los CANCELADO), o sea le quita
 * el respaldo a una factura ya emitida y deja el número de factura colgando de un viaje que
 * el resumen ya no muestra.
 *
 * Borrar la foto es peor porque no se puede deshacer: se va la fila Y el objeto de R2. La foto
 * es el remito, la evidencia de que ese viaje se hizo. Y esta rama le puso el botón a la
 * oficina, así que dejó de ser un hueco teórico del backend.
 */

const SECRET = "test-secret-tsm";

function viaje(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    template_id: null,
    provider_name: "Casarone",
    origin: "Mdeo",
    remite: null,
    destination: "Rincón",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Arroz",
    kilos: null,
    field_values: "{}",
    status: "COMPLETADO",
    started_at: "2026-08-18 07:30:00",
    finished_at: "2026-08-18 19:10:00",
    notes: null,
    created_at: "2026-08-18 07:30:00",
    segments: "[]",
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
    ...overrides,
  };
}

const FOTO = { id: 9, trip_id: 1, r2_key: "trips/1/carga-1.jpg", kind: "carga", taken_at: "2026-08-18 08:00:00", segment_sid: null };

/** Anota lo que se escribió, para poder afirmar que un 409 no toca nada. */
function fakeDB(trip: ReturnType<typeof viaje>, escrituras: string[]) {
  const responder = (sql: string) => {
    const s = sql.toLowerCase();
    if (s.includes("from trip_photos")) return FOTO;
    if (s.includes("from trips")) return trip;
    if (s.includes("from drivers")) return { id: 1, name: "Carlos Méndez" };
    if (s.includes("from trucks")) return { id: 1, plate: "STZ 4821" };
    return null;
  };
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        first: async () => responder(sql),
        all: async () => {
          const r = responder(sql);
          return { results: r ? [r] : [] };
        },
        run: async () => {
          escrituras.push(sql.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase());
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

/** R2 falso: anota los borrados, que son los irreversibles. */
function fakeR2(borrados: string[]) {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async (k: string) => {
      borrados.push(k);
    },
  } as unknown as R2Bucket;
}

const tokenOficina = () =>
  signToken(
    { id: 2, name: "Oficina", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );

const tokenAdmin = () =>
  signToken(
    { id: 3, name: "Admin", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );

async function cancelar(trip: ReturnType<typeof viaje>) {
  const escrituras: string[] = [];
  const res = await app.request(
    "/api/trips/1/cancel",
    {
      method: "POST",
      headers: { authorization: `Bearer ${await tokenOficina()}`, "content-type": "application/json" },
      body: JSON.stringify({ notes: "se cayó el flete" }),
    },
    { DB: fakeDB(trip, escrituras), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any, escrituras };
}

async function borrarFoto(trip: ReturnType<typeof viaje>) {
  const escrituras: string[] = [];
  const borrados: string[] = [];
  const res = await app.request(
    "/api/photos/9",
    { method: "DELETE", headers: { authorization: `Bearer ${await tokenAdmin()}` } },
    { DB: fakeDB(trip, escrituras), FOTOS: fakeR2(borrados), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any, escrituras, borrados };
}

describe("cancelar un viaje ya facturado", () => {
  it("no se puede: cancelarlo lo saca del resumen que respalda la factura", async () => {
    const { status, json } = await cancelar(viaje({ factura_numero: "A-1234" }));
    expect(status).toBe(409);
    expect(json.error).toContain("A-1234");
  });

  it("y no escribe nada", async () => {
    const { escrituras } = await cancelar(viaje({ factura_numero: "A-1234" }));
    expect(escrituras.filter((e) => e.startsWith("update"))).toEqual([]);
  });

  it("sin factura se cancela como siempre", async () => {
    const { status } = await cancelar(viaje());
    expect(status).toBe(200);
  });
});

describe("borrar una foto de un viaje ya facturado", () => {
  it("no se puede: es la evidencia de la factura y el borrado no se deshace", async () => {
    const { status, json } = await borrarFoto(viaje({ factura_numero: "A-1234" }));
    expect(status).toBe(409);
    expect(json.error).toContain("A-1234");
  });

  it("y sobre todo NO toca R2: el archivo no se recupera", async () => {
    const { borrados, escrituras } = await borrarFoto(viaje({ factura_numero: "A-1234" }));
    expect(borrados).toEqual([]);
    expect(escrituras.filter((e) => e.startsWith("delete"))).toEqual([]);
  });

  it("sin factura se borra como siempre, y se lleva el objeto de R2", async () => {
    const { status, borrados } = await borrarFoto(viaje());
    expect(status).toBe(200);
    expect(borrados).toEqual(["trips/1/carga-1.jpg"]);
  });
});
