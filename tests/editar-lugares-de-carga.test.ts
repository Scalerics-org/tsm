import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, type TripSegment } from "@shared/domain";

/**
 * Corregir dónde cargó y dónde descargó una carga, en Otros Viajes.
 *
 * Corregir el viaje deja Origen y Destino apagados en esas plantillas porque el recorrido sale de
 * las cargas, y mandaba a "corregir el lugar en la carga"; ninguna pantalla lo permitía. La
 * pantalla nueva usa `PUT /trips/:id/segments`. Lo que tiene que ser cierto: el cambio llega a la
 * carga sin mover sus fotos ni su cobro a mano, el recorrido del viaje se acomoda solo, y el viaje
 * facturado sigue frenado.
 */

const SECRET = "test-secret-tsm";

const carga = (sid: string, extra: Partial<TripSegment> = {}): TripSegment => ({
  sid,
  origen: "Artigas",
  origen_id: null,
  destino: null,
  destino_id: null,
  remitente: "TIMBER",
  remitente_id: null,
  clientes: [],
  cliente_ids: [],
  cantidad: 5,
  unidad: "pallets",
  remito: null,
  cobro_tipo: null,
  cobro_a: null,
  cobro_manual: false,
  ...extra,
});

const TPL = {
  id: 26,
  provider_id: 7,
  provider_name: "OTROS VIAJES",
  name: "Viaje COMBINADO",
  origin: "",
  remite: null,
  cargo_type: "Otros",
  dest_options: "[]",
  fields: "[]",
  campos_ubicacion: null,
  multi_renglon: 1,
  renglon_pide_ubicacion: 1,
  renglon_pide_departamento: 0,
  renglones_fijos: null,
  exige_carga_al_salir: 0,
  pide_kilometros: 0,
  viaje_vacio: 0,
  foto_carga_requerida: 1,
  active: 1,
  truck_ids: "",
};

const viaje = (segments: TripSegment[], extra: Record<string, unknown> = {}) => ({
  id: 1,
  template_id: 26,
  provider_name: "OTROS VIAJES",
  origin: "Artigas",
  remite: null,
  destination: "",
  destinatario: null,
  driver_id: 1,
  truck_id: 1,
  cargo_type: "Otros",
  kilos: null,
  field_values: "{}",
  status: "EN_CURSO",
  started_at: "2026-09-25 10:00:00",
  finished_at: null,
  notes: null,
  created_at: "2026-09-25 10:00:00",
  segments: JSON.stringify(segments),
  kilometros: null,
  edited_by: null,
  edited_at: null,
  factura_numero: null,
  facturado_at: null,
  facturado_by: null,
  driver_name: "Carlos Méndez",
  truck_plate: "GTP 4413",
  ...extra,
});

type Escritura = { sql: string; binds: unknown[] };

async function corregir(trip: ReturnType<typeof viaje>, segments: unknown[]) {
  const escrituras: Escritura[] = [];
  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (q.includes("from users")) return { id: 2, role: ROLES.ENCARGADO };
          if (q.includes("from trip_templates")) return TPL;
          if (q.includes("from trips")) return trip;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => (escrituras.push({ sql: q, binds }), { meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  const token = await signToken(
    { id: 2, name: "Oficina", role: ROLES.ENCARGADO, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips/1/segments",
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ segments }),
    },
    { DB: db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  const guardado = escrituras.find((e) => e.sql.startsWith("update trips set segments"));
  const recorrido = escrituras.find((e) => e.sql.startsWith("update trips set origin=?, destination=?"));
  return {
    status: res.status,
    json: (await res.json()) as any,
    segmentos: guardado ? (JSON.parse(guardado.binds[0] as string) as TripSegment[]) : null,
    recorrido: recorrido?.binds.slice(0, 2),
  };
}

describe("corregir los lugares de una carga (PUT /trips/:id/segments)", () => {
  it("el destino y el lugar de descarga llegan a la carga, con su sid", async () => {
    const a = carga("a");
    const r = await corregir(viaje([a]), [{ ...a, destino: "Montevideo", clientes: ["Depósito Mdeo"] }]);
    expect(r.status).toBe(200);
    expect(r.segmentos![0]).toMatchObject({ sid: "a", destino: "Montevideo", clientes: ["Depósito Mdeo"] });
  });

  it("el recorrido del viaje se acomoda solo con lo corregido", async () => {
    const a = carga("a");
    const r = await corregir(viaje([a]), [{ ...a, origen: "Salto", destino: "Montevideo" }]);
    expect(r.recorrido).toEqual(["Salto", "Montevideo"]);
  });

  it("dejar el destino sin definir se puede: la carga queda y el recorrido no inventa nada", async () => {
    const a = carga("a", { destino: "Montevideo" });
    const r = await corregir(viaje([a], { destination: "Montevideo" }), [{ ...a, destino: null, clientes: [] }]);
    expect(r.status).toBe(200);
    expect(r.segmentos![0].destino).toBeNull();
    expect(r.recorrido).toEqual(["Artigas", ""]);
  });

  it("las otras cargas y el cobro fijado a mano no se mueven, ni el id del cliente", async () => {
    const a = carga("a");
    const b = carga("b", {
      remitente: "GIANNI",
      cobro_tipo: "cliente",
      cobro_a: "Agronorte",
      cobro_manual: true,
      cobro_id: 49,
    });
    const r = await corregir(viaje([a, b]), [{ ...a, destino: "Salto" }, b]);
    const guardadaB = r.segmentos!.find((s) => s.sid === "b")!;
    expect(guardadaB).toMatchObject({ remitente: "GIANNI", cobro_a: "Agronorte", cobro_manual: true, cobro_id: 49 });
    expect(r.segmentos!.map((s) => s.sid)).toEqual(["a", "b"]);
  });

  it("agregar una carga nueva con sus lugares deja el recorrido armado (viaje 306)", async () => {
    const nueva = { origen: "Montevideo", remitente: "BUNGE", destino: null, clientes: [], cliente_ids: [], cantidad: 3, unidad: "pallets" };
    const r = await corregir(viaje([], { origin: "" }), [nueva]);
    expect(r.status).toBe(200);
    expect(r.segmentos![0]).toMatchObject({ origen: "Montevideo", remitente: "BUNGE", destino: null });
    expect(r.recorrido).toEqual(["Montevideo", ""]);
  });

  it("un viaje facturado sigue frenado", async () => {
    const a = carga("a");
    const r = await corregir(viaje([a], { factura_numero: "A-1" }), [{ ...a, destino: "Salto" }]);
    expect(r.status).toBe(409);
    expect(r.segmentos).toBeNull();
  });
});
