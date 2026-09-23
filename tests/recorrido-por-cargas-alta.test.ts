import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, origenVisible, destinoVisible, ORIGEN_A_DEFINIR } from "@shared/domain";
import { vaciosEntreViajes } from "@shared/vacios";

/**
 * "Otros Viajes": el recorrido lo arman las cargas, así que al salir no se pide el origen.
 *
 * "Porque te hace elegir un destino, y después, agregar carga, y ahí te pide de vuelta
 * departamento, lugar de carga, etc. Tendría que iniciar directamente pidiéndote estos datos."
 * — Rodrigo, 22/9/2026.
 *
 * Lo que tiene que ser cierto: que el alta funcione sin origen ni destino para esas plantillas;
 * que la primera carga le ponga el origen al viaje; y que mientras no lo tiene, el viaje se vea
 * y se cuente como "a definir" y no como un viaje roto ni como un vacío inventado.
 */

const SECRET = "test-secret-tsm";

/** La plantilla 26 como está en producción: recorrido por cargas, origen de libreta al salir. */
const OTROS_VIAJES = {
  id: 26,
  provider_id: 7,
  provider_name: "OTROS VIAJES",
  name: "Viaje COMBINADO (MAS DE UN LUGAR DE CARGA)",
  origin: "",
  remite: null,
  cargo_type: "Otros",
  dest_options: "[]",
  fields: "[]",
  arrival_photo_label: null,
  carga_photo_label: null,
  campos_ubicacion: JSON.stringify({
    origen: { modo: "libreta", libreta_tipo: "departamento", permite_alta: true, requerido: true },
  }),
  multi_renglon: 1,
  renglon_pide_ubicacion: 1,
  renglon_pide_departamento: 0,
  renglones_fijos: null,
  pide_kilometros: 0,
  viaje_vacio: 0,
  foto_carga_requerida: 1,
  active: 1,
  truck_ids: "",
};

function viaje(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    template_id: 26,
    provider_name: "OTROS VIAJES",
    origin: "",
    remite: null,
    destination: "",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Otros",
    kilos: null,
    field_values: "{}",
    status: "EN_CURSO",
    started_at: "2026-09-22 10:00:00",
    finished_at: null,
    notes: null,
    created_at: "2026-09-22 10:00:00",
    segments: "[]",
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    facturado_at: null,
    facturado_by: null,
    driver_name: "Carlos Méndez",
    truck_plate: "GTP 4413",
    ...overrides,
  };
}

type Escritura = { sql: string; binds: unknown[] };

function fakeDB(escrituras: Escritura[], trip: ReturnType<typeof viaje> | null) {
  const responder = (q: string) => {
    if (q.includes("from users")) return { id: 2 };
    if (q.includes("from lecturas_odometro")) return { id: 1, truck_id: 1, periodo: "2026-09" };
    if (q.includes("from trip_templates")) return OTROS_VIAJES;
    if (q.includes("from trips") && q.includes("t.status = 'en_curso'")) return null;
    if (q.includes("from trips")) return trip;
    if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
    return null;
  };
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const stmt = {
        bind: (...b: unknown[]) => {
          binds = b;
          return stmt;
        },
        first: async () => responder(q),
        all: async () => ({ results: [] }),
        run: async () => {
          escrituras.push({ sql: q, binds });
          return { meta: { last_row_id: 1, changes: 1 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function pedir(url: string, json: unknown, trip: ReturnType<typeof viaje> | null = null) {
  const escrituras: Escritura[] = [];
  const token = await signToken(
    { id: 2, name: "Chofer", role: ROLES.CHOFER, driver_id: 1, truck_id: 1, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    url,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(json),
    },
    { DB: fakeDB(escrituras, trip), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, escrituras, body: (await res.json()) as any };
}

describe("el alta de un viaje con recorrido por cargas", () => {
  it("no exige origen ni destino: el viaje nace sin recorrido", async () => {
    const { status, escrituras } = await pedir("/api/trips", { template_id: 26, field_values: {} });
    expect(status).toBe(200);
    const alta = escrituras.find((e) => e.sql.includes("insert into trips"));
    // origin, remite, destination y destinatario van en las posiciones 2 a 5.
    expect(alta!.binds.slice(2, 6)).toEqual(["", null, "", null]);
  });

  it("la primera carga le pone el origen y el destino al viaje", async () => {
    const carga = {
      sid: "c1",
      origen: "Artigas",
      destino: "Montevideo",
      remitente: "Galpón Prueba",
      clientes: ["Depósito Mdeo"],
      cantidad: 15000,
      unidad: "pallets",
    };
    const { status, escrituras } = await pedir("/api/trips/1/segments", { segments: [carga] }, viaje());
    expect(status).toBe(200);
    const recorrido = escrituras.find((e) => e.sql.includes("update trips set origin=?, destination=?"));
    expect(recorrido!.binds.slice(0, 2)).toEqual(["Artigas", "Montevideo"]);
  });
});

describe("un viaje que todavía no tiene origen", () => {
  it("se muestra como 'a definir', no como un viaje roto", () => {
    expect(origenVisible({ origin: "" })).toBe(ORIGEN_A_DEFINIR);
    expect(origenVisible({ origin: "  " })).toBe(ORIGEN_A_DEFINIR);
    expect(origenVisible({ origin: "Artigas" })).toBe("Artigas");
    expect(`${origenVisible({ origin: "" })} → ${destinoVisible({ destination: "" })}`).toBe(
      "origen a definir → destino a definir",
    );
  });

  it("no inventa un vacío: sin origen no se sabe dónde va a cargar el camión", () => {
    const anterior = { id: 1, started_at: "2026-09-20", origin: "Mdeo", destination: "Bella Unión", kilometros: 667 };
    const enCurso = { id: 2, started_at: "2026-09-22", origin: "", destination: "", kilometros: null };
    expect(vaciosEntreViajes([anterior, enCurso])).toEqual([]);
  });

  it("con origen sí se deduce, como siempre", () => {
    const anterior = { id: 1, started_at: "2026-09-20", origin: "Mdeo", destination: "Bella Unión", kilometros: 667 };
    const siguiente = { id: 2, started_at: "2026-09-22", origin: "Salto", destination: "Mdeo", kilometros: null };
    expect(vaciosEntreViajes([anterior, siguiente])).toHaveLength(1);
  });
});
