import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES, type Descarga } from "@shared/domain";

/**
 * `PUT /api/trips/:id/descargas` — la oficina corrige dónde descargó un viaje del modelo nuevo.
 *
 * Es la misma forma del callejón sin salida de "Corregir lugares": la oficina ve las descargas y,
 * en cuanto Rodrigo se equivoca en un lugar, no tiene cómo arreglarlo. Lo que tiene que ser cierto:
 * se corrige cada lugar y se puede agregar o quitar uno, el viaje facturado sigue frenado, sólo
 * oficina, queda registrado quién y cuándo, un lugar con fotos no se quita, y el modelo anterior
 * no entra por acá.
 */

const SECRET = "test-secret-tsm";

const lugar = (sid: string, extra: Partial<Descarga> = {}): Descarga => ({
  sid,
  departamento: "Salto",
  lugar: "Molino",
  kilos: null,
  pallets: null,
  ...extra,
});

const viaje = (descargas: Descarga[] | null, extra: Record<string, unknown> = {}) => ({
  id: 1,
  template_id: null,
  provider_name: "OTROS VIAJES",
  origin: "Artigas",
  remite: null,
  destination: "Salto",
  destinatario: null,
  driver_id: 1,
  truck_id: 1,
  cargo_type: "Otros",
  kilos: null,
  field_values: "{}",
  status: "COMPLETADO",
  started_at: "2026-09-25 10:00:00",
  finished_at: "2026-09-25 18:00:00",
  notes: null,
  created_at: "2026-09-25 10:00:00",
  segments: "[]",
  descargas: descargas ? JSON.stringify(descargas) : null,
  kilometros: null,
  edited_by: null,
  edited_at: null,
  factura_numero: null,
  facturado_at: null,
  facturado_by: null,
  driver_name: "Carlos",
  truck_plate: "GTP 4413",
  ...extra,
});

type Escritura = { sql: string; binds: unknown[] };

async function corregir(
  trip: ReturnType<typeof viaje>,
  cuerpo: unknown,
  { rol = ROLES.ENCARGADO, fotos = [] as { kind: string; segment_sid: string | null }[] } = {},
) {
  const escrituras: Escritura[] = [];
  const db = {
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      let binds: unknown[] = [];
      const stmt: any = {
        bind: (...b: unknown[]) => ((binds = b), stmt),
        first: async () => {
          if (q.includes("from users")) return { id: 2, role: rol };
          if (q.includes("from drivers")) return { id: 1, status: "activo", default_truck_id: 1 };
          if (q.includes("from trips")) return trip;
          return null;
        },
        all: async () => ({
          results: q.includes("from trip_photos")
            ? fotos.map((f, i) => ({ id: i + 1, trip_id: 1, r2_key: "k" + i, taken_at: "2026-09-25 12:00:00", ...f }))
            : [],
        }),
        run: async () => (escrituras.push({ sql: q, binds }), { meta: {} }),
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
  const token = await signToken({ id: 2, name: "Oficina", role: rol, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const res = await app.request(
    "/api/trips/1/descargas",
    { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cuerpo) },
    { DB: db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  const guardado = escrituras.find((e) => e.sql.startsWith("update trips set descargas"));
  return {
    status: res.status,
    json: (await res.json()) as any,
    escritura: guardado,
    descargas: guardado?.binds[0] ? (JSON.parse(guardado.binds[0] as string) as Descarga[]) : null,
    recorrido: escrituras.find((e) => e.sql.startsWith("update trips set origin=?, destination=?"))?.binds.slice(0, 2),
  };
}

describe("PUT /trips/:id/descargas", () => {
  it("corrige el departamento, el lugar y las cantidades de un lugar, y deja marcada la falta de boleta", async () => {
    const r = await corregir(viaje([lugar("a")]), {
      descargas: [{ sid: "a", departamento: "Artigas", lugar: "UAM", kilos: 900, pallets: 3, sin_boleta: true }],
    });
    expect(r.status).toBe(200);
    expect(r.descargas).toEqual([{ sid: "a", departamento: "Artigas", lugar: "UAM", kilos: 900, pallets: 3, sin_boleta: true }]);
  });

  it("agrega un lugar (recibe su sid) y el destino del viaje pasa a ser el último", async () => {
    const r = await corregir(viaje([lugar("a")]), {
      descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino" }, { departamento: "Artigas", lugar: "UAM" }],
    });
    expect(r.descargas).toHaveLength(2);
    expect(r.descargas![0].sid).toBe("a");
    expect(r.descargas![1].sid).toMatch(/^[0-9a-f-]{20,}$/);
    expect(r.recorrido).toEqual(["Artigas", "Artigas"]);
  });

  it("quita un lugar sin fotos", async () => {
    const r = await corregir(viaje([lugar("a"), lugar("b", { lugar: "Otro" })]), {
      descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino" }],
    });
    expect(r.status).toBe(200);
    expect(r.descargas!.map((d) => d.sid)).toEqual(["a"]);
  });

  it("no quita un lugar que tiene fotos de boleta: primero se borran", async () => {
    const r = await corregir(
      viaje([lugar("a"), lugar("b", { lugar: "Otro" })]),
      { descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino" }] },
      { fotos: [{ kind: "descarga", segment_sid: "b" }] },
    );
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("Otro");
    expect(r.escritura).toBeUndefined();
  });

  it("siempre queda al menos un lugar, y un lugar incompleto se rechaza", async () => {
    expect((await corregir(viaje([lugar("a")]), { descargas: [] })).status).toBe(400);
    expect((await corregir(viaje([lugar("a")]), { descargas: [{ sid: "a", departamento: "", lugar: "X" }] })).status).toBe(400);
  });

  it("queda registrado quién y cuándo", async () => {
    const r = await corregir(viaje([lugar("a")]), { descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino" }] });
    expect(r.escritura!.sql).toContain("edited_by");
    expect(r.escritura!.binds[1]).toBe(2);
  });

  it("un viaje facturado sigue frenado y dice la factura", async () => {
    const r = await corregir(viaje([lugar("a")], { factura_numero: "A-1" }), { descargas: [{ sid: "a", departamento: "Salto", lugar: "M" }] });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("A-1");
    expect(r.escritura).toBeUndefined();
  });

  it("un viaje del modelo anterior no entra por acá", async () => {
    const r = await corregir(viaje(null), { descargas: [{ sid: "a", departamento: "Salto", lugar: "M" }] });
    expect(r.status).toBe(409);
    expect(r.json.error).toContain("Corregir lugares");
  });

  it("el chofer y el lector no llegan", async () => {
    const c = { descargas: [{ sid: "a", departamento: "Salto", lugar: "Molino" }] };
    expect((await corregir(viaje([lugar("a")]), c, { rol: ROLES.CHOFER })).status).toBe(403);
    expect((await corregir(viaje([lugar("a")]), c, { rol: ROLES.LECTOR })).status).toBe(403);
  });
});
