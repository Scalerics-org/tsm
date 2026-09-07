import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Un viaje ya facturado no se toca por ningún lado.
 *
 * Borrarlo daba 409 y cambiarle la fecha también, pero corregirle las CARGAS pasaba derecho.
 * Y es el camino que más pesa de los tres: cada renglón es una unidad facturable, así que
 * cambiar una cantidad le cambia el monto a una factura ya emitida. Encima cada guardado
 * vuelve a correr `aplicarCobro` con las reglas de HOY, así que un viaje de hace tres meses
 * puede cambiar de "se cobra a" sin que nadie lo haya pedido.
 *
 * Hoy ninguna pantalla llama a PUT /segments, así que el agujero no está haciendo daño. Se
 * tapa ANTES de ponerle botón, no después.
 */

const SECRET = "test-secret-tsm";
const FACTURA = "A-0001234";

const CARGA = {
  sid: "a",
  origen: null,
  origen_id: null,
  destino: null,
  destino_id: null,
  remitente: "TIMBER",
  remitente_id: null,
  clientes: ["Jair"],
  cliente_ids: [],
  cantidad: 6,
  unidad: "pallets",
  remito: null,
  cobro_tipo: "cliente",
  cobro_a: "TIMBER",
  cobro_manual: false,
};

function viajeRow(facturado: boolean) {
  return {
    id: 1,
    template_id: null,
    provider_name: "Combinados",
    origin: "Mdeo",
    remite: null,
    destination: "Bella Unión",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Varios",
    kilos: null,
    field_values: "{}",
    status: "COMPLETADO",
    started_at: "2026-06-18 07:30:00",
    finished_at: "2026-06-18 19:10:00",
    notes: null,
    created_at: "2026-06-18 07:30:00",
    segments: JSON.stringify([CARGA]),
    kilometros: 520,
    edited_by: null,
    edited_at: null,
    factura_numero: facturado ? FACTURA : null,
    facturado_at: facturado ? "2026-07-02 10:00:00" : null,
    facturado_by: facturado ? 2 : null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
  };
}

/** D1 mínimo que además anota cada escritura, que es lo que este test necesita ver. */
function fakeDB(facturado: boolean, escrituras: string[]) {
  const responder = (sql: string) => (sql.toLowerCase().includes("from trips") ? viajeRow(facturado) : null);
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
          escrituras.push(sql);
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function corregirCargas(facturado: boolean) {
  const escrituras: string[] = [];
  const token = await signToken(
    { id: 2, name: "Oficina", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips/1/segments",
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      // La corrección que no puede pasar: la misma carga con otra cantidad.
      body: JSON.stringify({ segments: [{ ...CARGA, cantidad: 99 }] }),
    },
    { DB: fakeDB(facturado, escrituras), JWT_SECRET: SECRET } as any,
  );
  return {
    status: res.status,
    texto: await res.text(),
    guardó: escrituras.some((s) => /update trips set segments/i.test(s)),
  };
}

describe("PUT /api/trips/:id/segments contra un viaje facturado", () => {
  it("lo frena con 409 y no escribe nada", async () => {
    const r = await corregirCargas(true);
    expect(r.status).toBe(409);
    expect(r.guardó).toBe(false);
  });

  it("y el mensaje dice qué factura es y por dónde salir", async () => {
    // Un "no se puede" pelado deja a la oficina sin saber qué hacer con la corrección real
    // que tiene entre manos.
    const r = await corregirCargas(true);
    expect(r.texto).toContain(FACTURA);
    expect(r.texto).toContain("Facturación");
  });

  /**
   * Control positivo: sin esto el test pasaría igual si la ruta estuviera rota y devolviera
   * 409 siempre, o si nunca escribiera. Prueba que lo que se frenó es la escritura.
   */
  it("un viaje sin facturar sí se corrige", async () => {
    const r = await corregirCargas(false);
    expect(r.status).toBe(200);
    expect(r.guardó).toBe(true);
  });
});
