import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * `PUT /api/trips/:id/segments` — el mismo agujero que ya se tapó en borrar y en corregir
 * la fecha, pero se había quedado afuera acá: sin este freno, la oficina podía corregir
 * cantidades (y con ellas el "se cobra a", recalculado con las reglas de HOY) de un viaje
 * que ya está en una factura emitida al cliente.
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

/** D1 mínimo: responde por lo que pide la consulta. */
function fakeDB(trip: ReturnType<typeof viaje>) {
  const responder = (sql: string) => {
    const s = sql.toLowerCase();
    if (s.includes("from trips")) return trip;
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
        run: async () => ({ meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function tokenOficina() {
  return signToken(
    { id: 2, name: "Oficina", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
}

async function putSegments(trip: ReturnType<typeof viaje>) {
  const res = await app.request(
    "/api/trips/1/segments",
    {
      method: "PUT",
      headers: { authorization: `Bearer ${await tokenOficina()}`, "content-type": "application/json" },
      body: JSON.stringify({ segments: [] }),
    },
    { DB: fakeDB(trip), JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any };
}

describe("PUT /trips/:id/segments frena un viaje ya facturado", () => {
  it("un viaje con número de factura no se toca", async () => {
    const { status, json } = await putSegments(viaje({ factura_numero: "A-1234" }));
    expect(status).toBe(409);
    expect(json.error).toContain("A-1234");
  });

  it("sin factura, la corrección sigue andando", async () => {
    const { status } = await putSegments(viaje());
    expect(status).toBe(200);
  });
});
