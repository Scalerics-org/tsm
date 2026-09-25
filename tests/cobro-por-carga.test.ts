import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, cobroPorCarga, sinCobro, type TripSegment } from "@shared/domain";

/**
 * A quién se le cobra cada carga, desde la lista de Viajes.
 *
 * Rodrigo, 25/9: "prefiero asignarlos yo, porque acá es todo aquello de los combinados". Lo
 * asigna la oficina, carga por carga, y el chofer no ve ni toca nada de esto. Lo que tiene que
 * ser cierto: cambia SÓLO esa carga, queda fijado a mano, el nombre lo manda la libreta y no el
 * navegador, y un viaje facturado (o cancelado) no se toca.
 */

const SECRET = "test-secret-tsm";

function carga(sid: string, extra: Partial<TripSegment> = {}): TripSegment {
  return {
    sid,
    origen: "Bella Unión",
    origen_id: null,
    destino: "Montevideo",
    destino_id: null,
    remitente: `Lugar ${sid}`,
    remitente_id: null,
    clientes: [`Dest ${sid}`],
    cliente_ids: [],
    cantidad: 10,
    unidad: "pallets",
    remito: null,
    cobro_tipo: null,
    cobro_a: null,
    cobro_manual: false,
    ...extra,
  };
}

function viaje(segments: TripSegment[], extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    template_id: null,
    provider_name: "Otros Viajes",
    origin: "",
    remite: null,
    destination: "",
    destinatario: null,
    driver_id: 1,
    truck_id: 1,
    cargo_type: "Otros",
    kilos: null,
    field_values: "{}",
    status: "COMPLETADO",
    started_at: "2026-09-20 10:00:00",
    finished_at: "2026-09-21 10:00:00",
    notes: null,
    created_at: "2026-09-20 10:00:00",
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
  };
}

const ENTRADA = { id: 7, tipo: "destinatario", nombre: "Agronorte", provider_id: null, agrupador: 0, estado: "confirmado", usos: 3, created_by: 2 };

type Escritura = { sql: string; binds: unknown[] };

function fakeDB(trip: ReturnType<typeof viaje>, escrituras: Escritura[], opciones: { reglas?: unknown[]; sinEntrada?: boolean; rol?: string } = {}) {
  const responder = (q: string) => {
    // El rol sale de la base y no del token: el fake tiene que decir lo mismo que el token.
    if (q.includes("from users")) return { id: 2, role: opciones.rol ?? ROLES.ENCARGADO };
    if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
    if (q.includes("from trips")) return trip;
    if (q.includes("from libreta")) return opciones.sinEntrada ? null : ENTRADA;
    return null;
  };
  return {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => responder(q),
        all: async () => ({ results: q.includes("from cobro_reglas") ? (opciones.reglas ?? []) : [] }),
        run: async () => {
          escrituras.push({ sql: q, binds });
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

async function poner(
  trip: ReturnType<typeof viaje>,
  cuerpo: unknown,
  { rol = ROLES.ENCARGADO, sid = "b", ...opciones }: { rol?: string; sid?: string; reglas?: unknown[]; sinEntrada?: boolean } = {},
) {
  const escrituras: Escritura[] = [];
  const token = await signToken({ id: 2, name: "Oficina", role: rol, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    `/api/trips/1/segments/${sid}/cobro`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    },
    { DB: fakeDB(trip, escrituras, { ...opciones, rol }), JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  const guardado = escrituras.find((e) => e.sql.startsWith("update trips set segments"));
  return {
    status: res.status,
    json: (await res.json()) as any,
    segmentos: guardado ? (JSON.parse(guardado.binds[0] as string) as TripSegment[]) : null,
    escrituras,
  };
}

describe("cobroPorCarga", () => {
  it("una entrada por carga, con su sid y su número, en el orden del viaje", () => {
    const r = cobroPorCarga({
      segments: [carga("a", { cobro_a: "Agencia", cobro_tipo: "cliente", cobro_id: 3 }), carga("b")],
    });
    expect(r.map((x) => [x.sid, x.numero, x.nombre, x.cobroId])).toEqual([
      ["a", 1, "Agencia", 3],
      ["b", 2, null, null],
    ]);
  });

  it("una carga sin nombre es 'sin asignar' aunque le haya quedado un tipo", () => {
    const r = cobroPorCarga({ segments: [carga("a", { cobro_tipo: "cliente", cobro_a: "  " })] });
    expect(r[0].nombre).toBeNull();
    expect(r[0].tipo).toBeNull();
  });

  it("un viaje sin cargas no tiene ninguna", () => {
    expect(cobroPorCarga({})).toEqual([]);
    expect(cobroPorCarga({ segments: [] })).toEqual([]);
  });

  it("el título reconoce la carga por lugar y destinatarios", () => {
    const r = cobroPorCarga({ segments: [carga("a", { remitente: "TIMBER", clientes: ["Jair", "Agronorte"] })] });
    expect(r[0].titulo).toBe("TIMBER → Jair · Agronorte");
  });
});

describe("el chofer no recibe el id del cliente cobrado", () => {
  it("sinCobro saca también cobro_id", () => {
    const t: any = { segments: [carga("a", { cobro_a: "Agencia", cobro_tipo: "cliente", cobro_id: 3, cobro_manual: true })] };
    const visto = sinCobro(t).segments[0] as Record<string, unknown>;
    expect(visto).not.toHaveProperty("cobro_id");
    expect(visto).not.toHaveProperty("cobro_a");
  });
});

describe("PUT /trips/:id/segments/:sid/cobro", () => {
  const dos = () => viaje([carga("a", { cobro_tipo: "cliente", cobro_a: "Agencia" }), carga("b")]);

  it("asigna un cliente de la libreta: el nombre lo pone el servidor y queda fijado a mano", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7, cobro_a: "LO QUE SEA" });
    expect(r.status).toBe(200);
    const b = r.segmentos!.find((s) => s.sid === "b")!;
    expect(b).toMatchObject({ cobro_tipo: "cliente", cobro_a: "Agronorte", cobro_id: 7, cobro_manual: true });
  });

  it("no toca las otras cargas", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 });
    expect(r.segmentos!.find((s) => s.sid === "a")).toEqual(carga("a", { cobro_tipo: "cliente", cobro_a: "Agencia" }));
  });

  it("un proveedor va por nombre, sin id", async () => {
    const r = await poner(dos(), { cobro_tipo: "proveedor", cobro_a: " SAMAN " });
    const b = r.segmentos!.find((s) => s.sid === "b")!;
    expect(b).toMatchObject({ cobro_tipo: "proveedor", cobro_a: "SAMAN", cobro_id: null, cobro_manual: true });
  });

  it("no cuenta usos de la libreta ni reescribe otra cosa que las cargas", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 });
    const escritas = r.escrituras.map((e) => e.sql);
    expect(escritas.some((s) => s.includes("usos"))).toBe(false);
    expect(escritas.filter((s) => s.startsWith("update trips"))).toHaveLength(1);
  });

  it("quedan registrados quién y cuándo", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 });
    const e = r.escrituras.find((x) => x.sql.startsWith("update trips set segments"))!;
    expect(e.sql).toContain("edited_by");
    expect(e.binds[1]).toBe(2);
  });

  it("sacar la asignación devuelve la carga a las reglas de la libreta", async () => {
    const trip = viaje([carga("b", { remitente_id: 5, cobro_tipo: "cliente", cobro_a: "Agronorte", cobro_manual: true, cobro_id: 7 })]);
    const reglas = [{ id: 1, remitente_id: 5, destinatario_id: null, cobro_tipo: "proveedor", cobro_a: "SAMAN" }];
    const r = await poner(trip, { cobro_tipo: null }, { reglas });
    expect(r.segmentos![0]).toMatchObject({ cobro_tipo: "proveedor", cobro_a: "SAMAN", cobro_manual: false });
    expect(r.segmentos![0].cobro_id ?? null).toBeNull();
  });

  it("sacar la asignación sin regla la deja sin asignar", async () => {
    const trip = viaje([carga("b", { cobro_tipo: "cliente", cobro_a: "Agronorte", cobro_manual: true, cobro_id: 7 })]);
    const r = await poner(trip, { cobro_tipo: null });
    expect(r.segmentos![0]).toMatchObject({ cobro_tipo: null, cobro_a: null, cobro_manual: false });
  });

  it("un viaje facturado no se toca, y el mensaje dice la factura", async () => {
    const r = await poner(viaje([carga("b")], { factura_numero: "A-1234" }), { cobro_tipo: "cliente", cobro_id: 7 });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("A-1234");
    expect(r.segmentos).toBeNull();
  });

  it("un viaje cancelado tampoco", async () => {
    const r = await poner(viaje([carga("b")], { status: "CANCELADO" }), { cobro_tipo: "cliente", cobro_id: 7 });
    expect(r.status).toBe(409);
    expect(r.segmentos).toBeNull();
  });

  it("una carga que no existe es 404", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 }, { sid: "zzz" });
    expect(r.status).toBe(404);
  });

  it("un cliente que no está en la libreta es 404, no un nombre inventado", async () => {
    const r = await poner(dos(), { cobro_tipo: "cliente", cobro_id: 999 }, { sinEntrada: true });
    expect(r.status).toBe(404);
    expect(r.segmentos).toBeNull();
  });

  it("sin tipo válido o sin nombre no guarda nada", async () => {
    expect((await poner(dos(), { cobro_tipo: "otro", cobro_a: "X" })).status).toBe(400);
    expect((await poner(dos(), { cobro_tipo: "proveedor", cobro_a: "  " })).status).toBe(400);
    expect((await poner(dos(), {})).status).toBe(400);
  });

  it("el chofer y el lector no llegan", async () => {
    expect((await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 }, { rol: ROLES.CHOFER })).status).toBe(403);
    expect((await poner(dos(), { cobro_tipo: "cliente", cobro_id: 7 }, { rol: ROLES.LECTOR })).status).toBe(403);
  });
});
