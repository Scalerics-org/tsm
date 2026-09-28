import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";

/**
 * Dos campos donde alcanza con uno: no se puede exigir cada uno por separado.
 *
 * "Ahí cargó solo en Logipark, pero le decía que no podía estar vacío la cantidad de pallet.
 * Puse cero y quedó bien. Estaría bueno que si ponen el logi y en el otro nada, los deje
 * seguir." (Rodrigo, Molino Cañuelas, 28/9/2026). Un 0 puesto para pasar la validación se lee
 * en el Excel como "cargó cero pallets", no "no corresponde" — peor que el hueco que evita.
 *
 * La regla en sí (qué campo se agrupa con cuál) la valida `grupoIncompleto`
 * (tests/campo-faltante.test.ts); esto prueba que la ruta de alta del viaje la aplica de verdad.
 */

const SECRET = "test-secret-tsm";

const CAMPOS = [
  { key: "pallets", label: "Cantidad de pallets", type: "numero", required: true, stage: "carga", requiere_uno_de: "pallets" },
  { key: "pallets_logipark", label: "Si cargás en Logipark, indicá la cantidad de pallet", type: "numero", required: true, stage: "carga", requiere_uno_de: "pallets" },
];

function plantilla() {
  return {
    id: 3,
    provider_id: 4,
    provider_name: "Molino Cañuelas",
    name: "Montevideo → Salto y Artigas (Varios)",
    origin: "Montevideo",
    remite: null,
    cargo_type: "Molino Cañuelas",
    dest_options: "[]",
    fields: JSON.stringify(CAMPOS),
    arrival_photo_label: null,
    carga_photo_label: null,
    campos_ubicacion: null,
    multi_renglon: 0,
    renglon_pide_ubicacion: 0,
    renglon_pide_departamento: 0,
    renglones_fijos: null,
    pide_kilometros: 0,
    viaje_vacio: 0,
    foto_carga_requerida: 0,
    active: 1,
    truck_ids: "",
  };
}

function fakeDB() {
  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const stmt = {
        bind: () => stmt,
        first: async () => {
          if (q.includes("from users")) return { id: 2, role: ROLES.CHOFER };
          if (q.includes("from lecturas_odometro")) return { id: 1, truck_id: 1, periodo: "2026-09" };
          if (q.includes("from trip_templates")) return plantilla();
          if (q.includes("from trips")) return null; // sin viaje abierto
          if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { last_row_id: 1 } }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function crearViaje(field_values: Record<string, unknown>) {
  const token = await signToken(
    { id: 2, name: "Carlos", role: ROLES.CHOFER, driver_id: 1, truck_id: 1, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ template_id: 3, destino: "Salto", field_values }),
    },
    { DB: fakeDB(), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, body: (await res.json()) as any };
}

describe("POST /api/trips — cantidad de pallets, alcanza con uno de los dos", () => {
  it("con los dos vacíos no deja seguir, y no pide un 0 de relleno", async () => {
    const { status, body } = await crearViaje({});
    expect(status).toBe(400);
    expect(body.error).toBe("Completá uno de estos: Cantidad de pallets o Si cargás en Logipark, indicá la cantidad de pallet.");
  });

  it("con sólo el de Logipark completo, cierra: el general se puede dejar en blanco", async () => {
    const { status } = await crearViaje({ pallets_logipark: "23" });
    expect(status).toBe(200);
  });

  it("con sólo el general completo también alcanza", async () => {
    const { status } = await crearViaje({ pallets: "10" });
    expect(status).toBe(200);
  });
});
