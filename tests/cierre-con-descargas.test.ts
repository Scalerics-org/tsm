import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, type TripSegment } from "@shared/domain";

/**
 * `POST /api/trips/:id/finish` con el lugar de descarga de cada carga (Otros Viajes).
 *
 * El chofer sólo dice dónde cargó; al cerrar dice dónde descargó cada carga, o "todavía no sé" y
 * esa carga no se manda. Lo que tiene que ser cierto: se completan las cargas por sid y sólo lo
 * que falta, el recorrido del viaje se acomoda, el "no sé" NO traba el cierre, y un sid ajeno se
 * rechaza sin cerrar nada.
 */

const SECRET = "test-secret-tsm";

const carga = (sid: string, extra: Partial<TripSegment> = {}): TripSegment => ({
  sid,
  origen: "Artigas",
  origen_id: null,
  destino: null,
  destino_id: null,
  remitente: `Lugar ${sid}`,
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
  foto_carga_requerida: 0,
  active: 1,
  truck_ids: "",
};

const viaje = (segments: TripSegment[]) => ({
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
});

type Escritura = { sql: string; binds: unknown[] };

async function cerrar(segments: TripSegment[], cuerpo: Record<string, unknown>) {
  const escrituras: Escritura[] = [];
  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (q.includes("from users")) return { id: 2, role: ROLES.CHOFER };
          if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          if (q.includes("from trip_templates")) return TPL;
          if (q.includes("from trips")) return viaje(segments);
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
    { id: 2, name: "Carlos", role: ROLES.CHOFER, driver_id: 1, truck_id: 1, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips/1/finish",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    },
    { DB: db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  const guardado = escrituras.find((e) => e.sql.startsWith("update trips set segments"));
  return {
    status: res.status,
    json: (await res.json()) as any,
    segmentos: guardado ? (JSON.parse(guardado.binds[0] as string) as TripSegment[]) : null,
    recorrido: escrituras.find((e) => e.sql.startsWith("update trips set origin=?, destination=?"))?.binds.slice(0, 2),
    cerro: escrituras.some((e) => e.sql.startsWith("update trips set status")),
  };
}

describe("cerrar el viaje con el lugar de descarga de cada carga", () => {
  it("completa las cargas por sid y cierra", async () => {
    const r = await cerrar(
      [carga("a"), carga("b", { origen: "Salto" })],
      { descargas: [{ sid: "a", destino: "Montevideo", descarga: "Depósito" }, { sid: "b", destino: "Montevideo", descarga: "Molino" }] },
    );
    expect(r.status).toBe(200);
    expect(r.segmentos!.map((s) => [s.sid, s.destino, s.clientes[0]])).toEqual([
      ["a", "Montevideo", "Depósito"],
      ["b", "Montevideo", "Molino"],
    ]);
    expect(r.cerro).toBe(true);
  });

  it("el recorrido del viaje se acomoda con lo que dijo", async () => {
    const r = await cerrar([carga("a")], { descargas: [{ sid: "a", destino: "Montevideo", descarga: "Depósito" }] });
    expect(r.recorrido).toEqual(["Artigas", "Montevideo"]);
  });

  it("'todavía no sé' no traba el cierre: la carga sin mencionar queda como estaba", async () => {
    const r = await cerrar([carga("a"), carga("b")], { descargas: [{ sid: "b", destino: "Salto", descarga: "Molino" }] });
    expect(r.status).toBe(200);
    expect(r.cerro).toBe(true);
    expect(r.segmentos!.find((s) => s.sid === "a")!.destino).toBeNull();
  });

  it("sin descargas en el pedido el viaje cierra igual, sin tocar las cargas", async () => {
    const r = await cerrar([carga("a")], {});
    expect(r.status).toBe(200);
    expect(r.segmentos).toBeNull();
    expect(r.cerro).toBe(true);
  });

  it("no pisa una carga que ya tenía su destino", async () => {
    const r = await cerrar(
      [carga("a", { destino: "Montevideo", clientes: ["Depósito"] })],
      { descargas: [{ sid: "a", destino: "Salto", descarga: "Otro" }] },
    );
    expect(r.status).toBe(200);
    expect(r.segmentos).toBeNull();
  });

  it("una carga que no es del viaje se rechaza y el viaje NO se cierra", async () => {
    const r = await cerrar([carga("a")], { descargas: [{ sid: "zzz", destino: "Salto", descarga: "X" }] });
    expect(r.status).toBe(400);
    expect(r.cerro).toBe(false);
  });
});
