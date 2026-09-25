import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, type Descarga, type TripSegment } from "@shared/domain";

/**
 * `POST /api/trips/:id/finish` con los lugares de descarga (Otros Viajes).
 *
 * Rodrigo (25/9): al cerrar se llena siempre el primer lugar y después de cada uno se pregunta si
 * hay otro; cada lugar lleva departamento, dónde descargó y la foto de la boleta. Lo que tiene que
 * ser cierto: siempre llega al menos un lugar, se guardan en su columna y el recorrido del viaje
 * se acomoda, la boleta es obligatoria PERO "No pude sacar la boleta" cierra igual, y nada se
 * escribe si el pedido está mal.
 */

const SECRET = "test-secret-tsm";

const carga = (sid: string, origen: string): TripSegment => ({
  sid,
  origen,
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
  descargas: null,
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
type Foto = { kind: string; segment_sid: string | null };

const d = (sid: string, extra: Record<string, unknown> = {}) => ({
  sid,
  departamento: "Montevideo",
  lugar: "Depósito",
  ...extra,
});

async function cerrar(
  cuerpo: Record<string, unknown>,
  { segments = [carga("a", "Artigas")], fotos, campos }: { segments?: TripSegment[]; fotos?: Foto[]; campos?: string } = {},
) {
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
          if (q.includes("from trip_templates")) return campos ? { ...TPL, campos_ubicacion: campos } : TPL;
          if (q.includes("from trips")) return viaje(segments);
          return null;
        },
        all: async () => ({
          results: q.includes("from trip_photos")
            ? (fotos ?? []).map((f, i) => ({ id: i + 1, trip_id: 1, r2_key: "k" + i, taken_at: "2026-09-25 12:00:00", ...f }))
            : [],
        }),
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
    { DB: db, JWT_SECRET: SECRET, ...(fotos ? { FOTOS: {} } : {}) } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  const guardado = escrituras.find((e) => e.sql.startsWith("update trips set descargas"));
  return {
    status: res.status,
    json: (await res.json()) as any,
    descargas: guardado?.binds[0] ? (JSON.parse(guardado.binds[0] as string) as Descarga[]) : null,
    recorrido: escrituras.find((e) => e.sql.startsWith("update trips set origin=?, destination=?"))?.binds.slice(0, 2),
    cerro: escrituras.some((e) => e.sql.startsWith("update trips set status")),
  };
}

describe("cerrar el viaje con los lugares de descarga", () => {
  it("un lugar: se guarda en su columna, el recorrido se acomoda y cierra", async () => {
    const r = await cerrar({ descargas: [d("d1", { kilos: 800 })] });
    expect(r.status).toBe(200);
    expect(r.descargas).toEqual([{ sid: "d1", departamento: "Montevideo", lugar: "Depósito", kilos: 800, pallets: null }]);
    expect(r.recorrido).toEqual(["Artigas", "Montevideo"]);
    expect(r.cerro).toBe(true);
  });

  it("varios lugares: en orden, y el destino del viaje es el último", async () => {
    const r = await cerrar({ descargas: [d("d1", { departamento: "Salto" }), d("d2", { departamento: "Artigas" })] });
    expect(r.descargas!.map((x) => x.departamento)).toEqual(["Salto", "Artigas"]);
    expect(r.recorrido).toEqual(["Artigas", "Artigas"]);
  });

  it("el destino de un solo destino ya no se pide: una plantilla que lo tenga al cerrar no frena el cierre", async () => {
    const campos = JSON.stringify({ destino: { modo: "libreta", libreta_tipo: "lugar", requerido: true, al_cerrar: true } });
    const r = await cerrar({ descargas: [d("d1")] }, { campos });
    expect(r.status).toBe(200);
    expect(r.cerro).toBe(true);
  });

  it("sin lugares no se cierra: siempre hay al menos uno", async () => {
    for (const cuerpo of [{}, { descargas: [] }]) {
      const r = await cerrar(cuerpo);
      expect(r.status).toBe(400);
      expect(r.cerro).toBe(false);
      expect(r.descargas).toBeNull();
    }
  });

  it("un lugar incompleto se rechaza y no se escribe nada", async () => {
    const r = await cerrar({ descargas: [d("d1", { lugar: "" })] });
    expect(r.status).toBe(400);
    expect(r.cerro).toBe(false);
    expect(r.descargas).toBeNull();
  });

  it("los kilos y los pallets son opcionales", async () => {
    const r = await cerrar({ descargas: [d("d1")] });
    expect(r.status).toBe(200);
    expect(r.descargas![0]).toMatchObject({ kilos: null, pallets: null });
  });

  it("con R2, la boleta de cada lugar es obligatoria: sin ella el viaje queda pendiente", async () => {
    const r = await cerrar({ descargas: [d("d1"), d("d2", { lugar: "UAM" })] }, { fotos: [{ kind: "descarga", segment_sid: "d1" }] });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("la foto de la boleta de UAM");
    expect(r.json.error).not.toContain("boleta de Depósito");
    expect(r.cerro).toBe(false);
  });

  it("con la boleta de cada lugar, cierra", async () => {
    const r = await cerrar(
      { descargas: [d("d1"), d("d2")] },
      { fotos: [{ kind: "descarga", segment_sid: "d1" }, { kind: "descarga", segment_sid: "d2" }] },
    );
    expect(r.status).toBe(200);
    expect(r.cerro).toBe(true);
  });

  it("'No pude sacar la boleta' cierra igual y el lugar queda marcado", async () => {
    const r = await cerrar({ descargas: [d("d1", { sin_boleta: true })] }, { fotos: [] });
    expect(r.status).toBe(200);
    expect(r.cerro).toBe(true);
    expect(r.descargas![0]).toMatchObject({ sid: "d1", sin_boleta: true });
  });

  it("la foto de la CARGA no cuenta como boleta de la descarga", async () => {
    const r = await cerrar({ descargas: [d("d1")] }, { fotos: [{ kind: "carga", segment_sid: "d1" }] });
    expect(r.status).toBe(409);
  });
});
