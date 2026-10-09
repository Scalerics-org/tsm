import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { baseReal } from "./helpers/d1-real";

/**
 * La salida del camión, de punta a punta contra una D1 de verdad con todas las migraciones: que se guarde sólo
 * lo que la lista reconoce, que una pantalla vieja (sin el campo) no se rompa ni borre nada, y que la
 * sugerencia salga de donde terminó el último viaje del camión.
 */

const SECRET = "test-secret-tsm";
let base: Awaited<ReturnType<typeof baseReal>>;
let ids = { camion: 0, chofer: 0, oficina: 0, plantilla: 0 };

beforeAll(async () => {
  base = await baseReal();
  const camion = await base.db
    .prepare("INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES ('ZZS 0001', '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')")
    .run();
  ids.camion = camion.meta.last_row_id as number;
  const chofer = await base.db
    .prepare("INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES ('Chofer Salida', 'ZS1', '', '', '', '', 'activo', ?)")
    .bind(ids.camion)
    .run();
  ids.chofer = chofer.meta.last_row_id as number;
  const oficina = await base.db
    .prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('salida@prueba.test', 'x', 'Oficina', 'admin')")
    .run();
  ids.oficina = oficina.meta.last_row_id as number;

  // Una plantilla simple de las que ya están sembradas: sin renglones ni datos obligatorios al salir.
  const { body } = await pedir("/api/templates");
  const simple = (body.data as any[]).find(
    (t) => t.active && !t.multi_renglon && !t.renglon_pide_ubicacion && !t.fields.some((f: any) => f.stage === "carga" && f.required),
  );
  ids.plantilla = simple?.id ?? 0;
}, 180_000);

afterAll(async () => {
  await base?.cerrar();
});

async function pedir(url: string, init: { method?: string; json?: unknown } = {}) {
  const token = await signToken(
    { id: ids.oficina, name: "Oficina", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any,
    SECRET,
  );
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const res = await app.request(
    url,
    { method: init.method ?? "GET", headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined },
    { DB: base.db, JWT_SECRET: SECRET } as any,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
  return { status: res.status, body: (await res.json()) as any };
}

const alta = (extra: Record<string, unknown> = {}) =>
  pedir("/api/trips", {
    method: "POST",
    json: {
      template_id: ids.plantilla,
      driver_id: ids.chofer,
      truck_id: ids.camion,
      fecha: "2026-10-05",
      origin: "Artigas",
      destino: "Montevideo",
      field_values: {},
      ...extra,
    },
  });

const guardada = async (id: number) =>
  (await base.db.prepare("SELECT salida_desde FROM trips WHERE id = ?").bind(id).first<{ salida_desde: string | null }>())
    ?.salida_desde;

describe("el alta guarda la salida", () => {
  it("hay una plantilla simple sembrada para probar", () => {
    expect(ids.plantilla).toBeGreaterThan(0);
  });

  it("con una localidad de la lista, la guarda con su nombre canónico", async () => {
    const r = await alta({ salida_desde: "bella unión" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await guardada(r.body.data.id)).toBe("Bella Unión");
  });

  it("sin el campo (una app vieja) el viaje se crea igual, con la salida vacía", async () => {
    const r = await alta();
    expect(r.status).toBe(200);
    expect(await guardada(r.body.data.id)).toBeNull();
  });

  it("con algo que la lista no reconoce, se ignora: no frena el alta", async () => {
    const r = await alta({ salida_desde: "Estancia La Paz" });
    expect(r.status).toBe(200);
    expect(await guardada(r.body.data.id)).toBeNull();
  });
});

describe("la oficina corrige la salida", () => {
  it("se cambia, y se borra con «Otra»", async () => {
    const creado = await alta({ salida_desde: "Salto" });
    const id = creado.body.data.id;
    const cambio = await pedir(`/api/trips/${id}`, { method: "PATCH", json: { salida_desde: "Artigas" } });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    expect(await guardada(id)).toBe("Artigas");
    await pedir(`/api/trips/${id}`, { method: "PATCH", json: { salida_desde: "" } });
    expect(await guardada(id)).toBeNull();
  });

  it("una corrección que no menciona la salida (pantalla vieja) no la borra", async () => {
    const creado = await alta({ salida_desde: "Rivera" });
    const id = creado.body.data.id;
    const r = await pedir(`/api/trips/${id}`, { method: "PATCH", json: { notes: "revisado" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await guardada(id)).toBe("Rivera");
  });
});

describe("GET /trips/salida-sugerida", () => {
  it("sugiere donde terminó el último viaje del camión", async () => {
    await alta({ fecha: "2026-10-07", destino: "Salto" });
    const r = await pedir(`/api/trips/salida-sugerida?truck=${ids.camion}`);
    expect(r.status).toBe(200);
    expect(r.body.data.sugerida).toBe("Salto");
  });

  it("un camión sin viajes no sugiere nada", async () => {
    const otro = await base.db
      .prepare("INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES ('ZZS 0002', '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')")
      .run();
    const r = await pedir(`/api/trips/salida-sugerida?truck=${otro.meta.last_row_id}`);
    expect(r.body.data.sugerida).toBeNull();
  });

  it("si terminó en un lugar que la lista no conoce, no inventa", async () => {
    await alta({ fecha: "2026-10-08", destino: "Estancia Perdida" });
    const r = await pedir(`/api/trips/salida-sugerida?truck=${ids.camion}`);
    expect(r.body.data.sugerida).toBeNull();
  });
});
