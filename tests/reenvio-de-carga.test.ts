import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { esReenvioDeCarga } from "../shared/reenvio-de-carga";

/**
 * Reenviar una carga no la duplica.
 *
 * Con mala señal el pedido llega, la respuesta se pierde y el celular lo manda otra vez con el
 * MISMO sid (`GuardadoDeCarga` lo conserva justamente para eso). Antes el servidor veía el sid
 * ya usado y le inventaba otro: la carga quedaba dos veces y la foto, que se cuelga del sid
 * original, apuntaba a una sola de las dos.
 */

const SECRET = "test-secret-tsm";

/** Base de un solo viaje que recuerda las cargas entre pedidos, como la real. */
function baseConViaje(segments: unknown[]) {
  const fila: Record<string, unknown> = {
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
    status: "EN_CURSO",
    started_at: "2026-09-29 07:30:00",
    finished_at: null,
    notes: null,
    created_at: "2026-09-29 07:30:00",
    segments: segments.length ? JSON.stringify(segments) : null,
    kilometros: null,
    edited_by: null,
    edited_at: null,
    factura_numero: null,
    driver_name: "Carlos Méndez",
    truck_plate: "STZ 4821",
  };
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt: any = {
        bind: (...a: unknown[]) => ((args = a), stmt),
        first: async () => {
          const s = sql.toLowerCase();
          if (s.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          if (s.includes("from trips")) return fila;
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.toLowerCase().includes("update trips set segments")) fila.segments = args[0];
          return { meta: {} };
        },
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  return { db, cargas: () => (fila.segments ? (JSON.parse(fila.segments as string) as any[]) : []) };
}

async function postCarga(db: D1Database, segments: unknown[]) {
  const token = await signToken(
    { id: 1, name: "Carlos", role: ROLES.CHOFER, driver_id: 1, truck_id: 1, email: null } as any,
    SECRET,
  );
  const res = await app.request(
    "/api/trips/1/segments",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ segments }),
    },
    { DB: db, JWT_SECRET: SECRET } as any,
  );
  return { status: res.status, json: (await res.json()) as any };
}

const timber = { sid: "a1b2c3d4-0000-4000-8000-000000000001", remitente: "TIMBER", cantidad: 12, unidad: "pallets" };
const armco = { sid: "a1b2c3d4-0000-4000-8000-000000000002", remitente: "ARMCO", cantidad: 3, unidad: "pallets" };

describe("POST /trips/:id/segments — reenvío de una carga", () => {
  it("mandar la misma carga dos veces deja una sola", async () => {
    const { db, cargas } = baseConViaje([]);
    const primera = await postCarga(db, [timber]);
    const segunda = await postCarga(db, [timber]);

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(cargas()).toHaveLength(1);
    expect(cargas()[0].sid).toBe(timber.sid);
    expect(segunda.json.data.segments).toHaveLength(1);
  });

  it("el reenvío conserva lo que ya estaba: no pisa la cantidad que se corrigió después", async () => {
    const { db, cargas } = baseConViaje([{ ...timber, cantidad: 20, clientes: [], cliente_ids: [] }]);
    await postCarga(db, [{ ...timber, cantidad: 12 }]);
    expect(cargas()).toHaveLength(1);
    expect(cargas()[0].cantidad).toBe(20);
  });

  it("una carga nueva junto a una reenviada se suma sola", async () => {
    const { db, cargas } = baseConViaje([{ ...timber, clientes: [], cliente_ids: [] }]);
    const r = await postCarga(db, [timber, armco]);
    expect(r.status).toBe(200);
    expect(cargas().map((c) => c.sid)).toEqual([timber.sid, armco.sid]);
  });

  it("un sid repetido en OTRO lugar de carga no es reenvío: no pisa la foto de la otra", async () => {
    const { db, cargas } = baseConViaje([{ ...timber, clientes: [], cliente_ids: [] }]);
    await postCarga(db, [{ ...armco, sid: timber.sid }]);
    expect(cargas()).toHaveLength(2);
    const sids = cargas().map((c) => c.sid);
    expect(new Set(sids).size).toBe(2);
    expect(cargas()[0].sid).toBe(timber.sid);
  });

  it("dos cargas sin sid en el mismo pedido siguen siendo dos", async () => {
    const { db, cargas } = baseConViaje([]);
    await postCarga(db, [{ remitente: "TIMBER" }, { remitente: "TIMBER" }]);
    expect(cargas()).toHaveLength(2);
  });
});

describe("esReenvioDeCarga", () => {
  const ya = [{ sid: "s1", remitente: "TIMBER" }];
  it("mismo sid y mismo lugar de carga", () => expect(esReenvioDeCarga({ sid: "s1", remitente: " TIMBER " }, ya)).toBe(true));
  it("mismo sid, otro lugar", () => expect(esReenvioDeCarga({ sid: "s1", remitente: "ARMCO" }, ya)).toBe(false));
  it("sid que no está", () => expect(esReenvioDeCarga({ sid: "s2", remitente: "TIMBER" }, ya)).toBe(false));
  it("sin sid", () => expect(esReenvioDeCarga({ remitente: "TIMBER" }, ya)).toBe(false));
  it("basura", () => expect(esReenvioDeCarga(null, ya)).toBe(false));
});

describe("el reenvío con el lugar de carga como lo escribió el celular", () => {
  it("un lugar con espacios de más se reconoce igual, porque se guarda recortado", async () => {
    const { db, cargas } = baseConViaje([]);
    const conEspacios = { ...timber, remitente: "  TIMBER " };
    await postCarga(db, [conEspacios]);
    await postCarga(db, [conEspacios]);
    expect(cargas()).toHaveLength(1);
    expect(cargas()[0].remitente).toBe("TIMBER");
  });
});
