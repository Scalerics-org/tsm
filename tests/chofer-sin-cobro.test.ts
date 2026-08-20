import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * El chofer nunca ve la facturación.
 *
 * `sinCobro` está bien testeada como función. Lo que falló en el incidente no fue la función:
 * fue acordarse de llamarla — el cobro viajaba al celular en tres rutas distintas. Hoy el
 * invariante lo sostiene la disciplina de pasar cada respuesta por `okViaje`, y nada avisa si
 * alguien agrega una ruta y se olvida.
 *
 * Este test recorre las rutas de verdad, con el middleware puesto, y falla si aparece
 * cualquier campo de cobro en la respuesta. No mira CÓMO se saca: mira que no esté.
 */

const SECRET = "test-secret-tsm";

// Un renglón con facturación cargada: si algo se filtra, se filtra esto.
const SEGMENTS = JSON.stringify([
  {
    sid: "a",
    origen: null,
    origen_id: null,
    destino: null,
    destino_id: null,
    remitente: "TIMBER",
    remitente_id: 8,
    clientes: ["Jair"],
    cliente_ids: [1],
    cantidad: 6,
    unidad: "pallets",
    remito: null,
    cobro_tipo: "cliente",
    cobro_a: "SECRETO FACTURACION",
    cobro_manual: true,
  },
]);

const VIAJE = {
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
  status: "EN_CURSO",
  started_at: "2026-08-18 07:30:00",
  finished_at: null,
  notes: null,
  created_at: "2026-08-18 07:30:00",
  segments: SEGMENTS,
  kilometros: null,
  edited_by: null,
  edited_at: null,
  // El número de factura también es facturación: sale de DGI y el chofer no tiene por qué
  // saber si el viaje que hizo ya se cobró ni con qué papel.
  factura_numero: "FACTURA SECRETA",
  facturado_at: "2026-08-19 10:00:00",
  facturado_by: 2,
  driver_name: "Carlos Méndez",
  truck_plate: "STZ 4821",
};

/** D1 mínimo: responde por lo que pide la consulta, que es todo lo que estas rutas usan. */
function fakeDB() {
  const responder = (sql: string) => {
    const s = sql.toLowerCase();
    if (s.includes("from drivers") && s.includes("default_truck_id")) return { default_truck_id: 1 };
    if (s.includes("from trips")) return VIAJE;
    if (s.includes("from trip_photos")) return null;
    if (s.includes("from trip_templates")) return null;
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

const env = () => ({ DB: fakeDB(), JWT_SECRET: SECRET }) as any;

async function tokenDe(role: string) {
  return signToken(
    { id: 1, name: "X", role, driver_id: role === ROLES.CHOFER ? 1 : null, truck_id: 1, email: null } as any,
    SECRET,
  );
}

async function pedir(ruta: string, token: string) {
  const res = await app.request(ruta, { headers: { authorization: `Bearer ${token}` } }, env());
  return { status: res.status, texto: await res.text() };
}

const RUTAS = ["/api/trips", "/api/trips/active", "/api/trips/1"];

describe("el chofer no recibe facturación por ninguna ruta", () => {
  for (const ruta of RUTAS) {
    it(`${ruta} no devuelve ningún campo de cobro`, async () => {
      const { status, texto } = await pedir(ruta, await tokenDe(ROLES.CHOFER));
      expect(status).toBe(200);
      expect(texto).not.toContain("SECRETO FACTURACION");
      expect(texto).not.toContain("cobro_a");
      expect(texto).not.toContain("cobro_tipo");
      expect(texto).not.toContain("cobro_manual");
      expect(texto).not.toContain("FACTURA SECRETA");
      expect(texto).not.toContain("factura_numero");
    });
  }

  it("pero sí recibe la carga: se saca la facturación, no el renglón", async () => {
    const { texto } = await pedir("/api/trips/1", await tokenDe(ROLES.CHOFER));
    expect(texto).toContain("TIMBER");
    expect(texto).toContain("pallets");
  });

  /**
   * Control positivo: sin esto, el test pasaría igual si las rutas devolvieran vacío o si
   * el dato de prueba nunca hubiera tenido cobro. Prueba que el test mide algo.
   */
  it("la oficina sí la recibe, así que el dato existía", async () => {
    const { texto } = await pedir("/api/trips/1", await tokenDe(ROLES.ENCARGADO));
    expect(texto).toContain("SECRETO FACTURACION");
    expect(texto).toContain("cobro_a");
  });
});
