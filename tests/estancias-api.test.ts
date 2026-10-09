import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { ROLES } from "@shared/domain";
import { baseReal } from "./helpers/d1-real";

/**
 * Las estancias de punta a punta contra una D1 de verdad con todas las migraciones: la oficina carga cuántos km
 * queda una estancia, el chofer la ve de sugerencia, y al guardar dónde descargó el viaje guarda el desvío.
 */

const SECRET = "test-secret-tsm";
let base: Awaited<ReturnType<typeof baseReal>>;
let ids = { camion: 0, chofer: 0, oficina: 0, plantilla: 0, estancia: 0, depositoComun: 0 };

async function pedir(url: string, init: { method?: string; json?: unknown; rol?: "admin" | "chofer" } = {}) {
  const esChofer = init.rol === "chofer";
  const token = await signToken(
    {
      id: esChofer ? 9999 : ids.oficina,
      name: "Prueba",
      role: esChofer ? ROLES.CHOFER : ROLES.ADMIN,
      driver_id: esChofer ? ids.chofer : null,
      truck_id: null,
      email: null,
    } as any,
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

beforeAll(async () => {
  base = await baseReal();
  const camion = await base.db
    .prepare("INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES ('ZZE 0001', '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')")
    .run();
  ids.camion = camion.meta.last_row_id as number;
  const chofer = await base.db
    .prepare("INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES ('Chofer Estancia', 'ZE1', '', '', '', '', 'activo', ?)")
    .bind(ids.camion)
    .run();
  ids.chofer = chofer.meta.last_row_id as number;
  const oficina = await base.db
    .prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('estancia@prueba.test', 'x', 'Oficina', 'admin')")
    .run();
  ids.oficina = oficina.meta.last_row_id as number;

  const artigas = await base.db.prepare("SELECT id FROM departamentos WHERE nombre = 'Artigas'").first<{ id: number }>();
  const estancia = await base.db
    .prepare("INSERT INTO libreta (tipo, nombre, estado, departamento_id) VALUES ('destinatario', 'Estancia La Paz', 'confirmado', ?)")
    .bind(artigas!.id)
    .run();
  ids.estancia = estancia.meta.last_row_id as number;
  const comun = await base.db
    .prepare("INSERT INTO libreta (tipo, nombre, estado, departamento_id) VALUES ('destinatario', 'Depósito común', 'confirmado', ?)")
    .bind(artigas!.id)
    .run();
  ids.depositoComun = comun.meta.last_row_id as number;

  const { body } = await pedir("/api/templates");
  ids.plantilla = (body.data as any[]).find(
    (t) => t.active && !t.multi_renglon && !t.renglon_pide_ubicacion && !t.fields.some((f: any) => f.stage === "carga" && f.required),
  ).id;
}, 180_000);

afterAll(async () => {
  await base?.cerrar();
});

describe("cargar los km de una estancia en la libreta", () => {
  it("el admin le pone cuántos km queda de la ciudad", async () => {
    const r = await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 60 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.km_desde_ciudad).toBe(60);
  });

  it("rechaza lo que no es un número entero razonable", async () => {
    for (const km of [-5, 12.5, 99999, "mucho"]) {
      const r = await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: km } });
      expect(r.status, String(km)).toBe(400);
    }
  });

  it("editar otra cosa no borra los km", async () => {
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 60 } });
    const r = await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { solo_cobro: false } });
    expect(r.body.data.km_desde_ciudad).toBe(60);
  });

  it("un chofer no puede cambiarlos", async () => {
    const r = await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", rol: "chofer", json: { km_desde_ciudad: 1 } });
    expect(r.status).toBe(403);
  });

  it("el chofer ve las estancias con km de sugerencia, y sólo esas", async () => {
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 60 } });
    const r = await pedir("/api/libreta/estancias", { rol: "chofer" });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ nombre: "Estancia La Paz", departamento: "Artigas", km_desde_ciudad: 60 }]);
  });

  it("con 0 o vacío deja de ser una estancia", async () => {
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 0 } });
    expect((await pedir("/api/libreta/estancias")).body.data).toEqual([]);
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 60 } });
  });
});

describe("al guardar dónde descargó, el viaje guarda el desvío", () => {
  async function viajeConDescargas() {
    const alta = await pedir("/api/trips", {
      method: "POST",
      json: {
        template_id: ids.plantilla,
        driver_id: ids.chofer,
        truck_id: ids.camion,
        fecha: "2026-10-05",
        origin: "Artigas",
        destino: "Montevideo",
        field_values: {},
      },
    });
    const id = alta.body.data.id as number;
    // El modelo nuevo: el viaje ya tiene descargas por lugar (la corrección de la oficina sólo entra si las hay).
    await base.db.prepare("UPDATE trips SET descargas = ? WHERE id = ?").bind(JSON.stringify([
      { sid: "a", departamento: "Montevideo", lugar: "Algún lado", kilos: null, pallets: null },
    ]), id).run();
    return id;
  }
  const guardadas = async (id: number) =>
    JSON.parse((await base.db.prepare("SELECT descargas FROM trips WHERE id = ?").bind(id).first<{ descargas: string }>())!.descargas);

  it("una descarga en la estancia suma 2 × 60 km, y la de un depósito común no suma nada", async () => {
    const id = await viajeConDescargas();
    const r = await pedir(`/api/trips/${id}/descargas`, {
      method: "PUT",
      json: {
        descargas: [
          { sid: "a", departamento: "Artigas", lugar: "estancia la paz", sin_boleta: true },
          { sid: "b", departamento: "Artigas", lugar: "Depósito común", sin_boleta: true },
          { sid: "c", departamento: "Montevideo", lugar: "Puerto", sin_boleta: true },
        ],
      },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = await guardadas(id);
    expect(d.map((x: any) => x.km_desvio)).toEqual([120, undefined, undefined]);
  });

  it("si la estancia deja de tener km, al corregir de nuevo se le saca el desvío", async () => {
    const id = await viajeConDescargas();
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: null } });
    const r = await pedir(`/api/trips/${id}/descargas`, {
      method: "PUT",
      json: { descargas: [{ sid: "a", departamento: "Artigas", lugar: "Estancia La Paz", sin_boleta: true }] },
    });
    expect(r.status).toBe(200);
    expect((await guardadas(id))[0].km_desvio).toBeUndefined();
    await pedir(`/api/libreta/${ids.estancia}`, { method: "PUT", json: { km_desde_ciudad: 60 } });
  });
});
