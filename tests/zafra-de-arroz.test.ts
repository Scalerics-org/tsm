import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { periodoDeHoy } from "../api/lib/periodo";
import { ROLES, SI_NO, compararPlantillas } from "@shared/domain";
import { kmEstimados } from "@shared/distancias";
import { baseReal, sentenciasDe } from "./helpers/d1-real";

/**
 * La zafra de arroz (febrero 2027): un cliente nuevo con 7 viajes que Rodrigo quiere mirar antes de que los vea
 * ningún chofer. Contra una D1 de verdad con todas las migraciones: los datos de la 0060, que no los vea un chofer,
 * que se prenda desde la oficina, los km fijos al cerrar y el campo Sí/No obligatorio.
 */

const SECRET = "test-secret-tsm";
const VIAJES = [
  { orden: 1, nombre: "B.Brum-SAMAN T.G", origen: "B. Brum", destino: "Saman T.G", km: 45 },
  { orden: 2, nombre: "Patitas-SAMAN T.G", origen: "Patitas", destino: "Saman T.G", km: 83 },
  { orden: 3, nombre: "Patitas-SALTO", origen: "Patitas", destino: "Salto", km: 110 },
  { orden: 4, nombre: "Puesto-SALTO", origen: "Puesto", destino: "Salto", km: 160 },
  { orden: 5, nombre: "Puesto-SAMAN T.G", origen: "Puesto", destino: "Saman T.G", km: 225 },
  { orden: 6, nombre: "Puesto-TACUAREMBO", origen: "Puesto", destino: "Tacuarembó", km: 240 },
  { orden: 7, nombre: "B.Brum-SALTO", origen: "B. Brum", destino: "Salto", km: 72 },
];

let base: Awaited<ReturnType<typeof baseReal>>;
const ids = { camionDeLaZafra: 0, otroCamion: 0, choferZafra: 0, otroChofer: 0, oficina: 0 };

const sqlDeLaMigracion = () =>
  readFileSync(path.resolve(__dirname, "../migrations/0060_zafra_de_arroz.sql"), "utf8");
const correrMigracion = async () => {
  for (const s of sentenciasDe(sqlDeLaMigracion())) await base.db.prepare(s).run();
};

beforeAll(async () => {
  base = await baseReal();
  const camion = (placa: string) =>
    base.db
      .prepare(
        "INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES (?, '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')",
      )
      .bind(placa)
      .run();
  ids.otroCamion = (await camion("ZZZ 0002")).meta.last_row_id as number;
  const chofer = (nombre: string, doc: string, camionId: number | null) =>
    base.db
      .prepare(
        "INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES (?, ?, '', '', '', '', 'activo', ?)",
      )
      .bind(nombre, doc, camionId)
      .run();
  ids.otroChofer = (await chofer("Chofer Otro", "ZA2", ids.otroCamion)).meta.last_row_id as number;
  ids.oficina = (
    await base.db
      .prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('zafra@prueba.test', 'x', 'Oficina', 'admin')")
      .run()
  ).meta.last_row_id as number;
}, 180_000);

afterAll(async () => {
  await base?.cerrar();
});

async function pedir(token: string, url: string, init: { method?: string; json?: unknown } = {}) {
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

const tokenOficina = () =>
  signToken({ id: ids.oficina, name: "Oficina", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);
const tokenChofer = (driverId: number, truckId: number) =>
  signToken({ id: driverId, name: "Chofer", role: ROLES.CHOFER, driver_id: driverId, truck_id: truckId, email: null } as any, SECRET);

const filasDeLaZafra = async () =>
  (
    await base.db
      .prepare(
        `SELECT tt.* FROM trip_templates tt JOIN providers p ON p.id = tt.provider_id
          WHERE p.name = 'Zafra de arroz' ORDER BY tt.orden`,
      )
      .all<any>()
  ).results;

describe("la migración 0060", () => {
  it("crea el cliente y las 7 plantillas con los km y el orden de Rodrigo", async () => {
    const filas = await filasDeLaZafra();
    expect(filas.map((f) => [f.orden, f.name, f.km_fijos])).toEqual(VIAJES.map((v) => [v.orden, v.nombre, v.km]));
  });

  it("origen y destino fijos, como los escribió Rodrigo", async () => {
    const filas = await filasDeLaZafra();
    for (const [i, f] of filas.entries()) {
      expect(f.origin).toBe(VIAJES[i].origen);
      const cu = JSON.parse(f.campos_ubicacion);
      expect(cu.origen).toMatchObject({ modo: "fijo", valor: VIAJES[i].origen });
      expect(cu.destino).toMatchObject({ modo: "fijo", valor: VIAJES[i].destino });
    }
  });

  it("la carga pide remito y foto; la descarga, kilos, sobrepeso Sí/No, remito o boleta y foto: todo obligatorio", async () => {
    const [primera] = await filasDeLaZafra();
    const campos = JSON.parse(primera.fields) as any[];
    expect(campos.map((c) => [c.stage, c.label, c.type, c.required])).toEqual([
      ["carga", "Número de remito", "numero", true],
      ["descarga", "Kilos", "numero", true],
      ["descarga", "Sobrepeso", "si_no", true],
      ["descarga", "Número de remito / boleta", "texto", true],
    ]);
    expect(campos.find((c) => c.label === "Kilos").is_weight).toBe(true);
    expect(primera.foto_carga_requerida).toBe(1);
    expect(primera.arrival_photo_label).toBe("Foto del remito de descarga");
  });

  it("nacen apagadas", async () => {
    expect((await filasDeLaZafra()).every((f) => f.active === 0)).toBe(true);
  });

  it("no asigna a ningún camión si GTP 4371 no existe en la base", async () => {
    const n = await base.db
      .prepare("SELECT COUNT(*) AS n FROM template_trucks WHERE template_id IN (SELECT id FROM trip_templates WHERE km_fijos IS NOT NULL)")
      .first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("se puede correr de nuevo sin duplicar nada", async () => {
    await correrMigracion();
    await correrMigracion();
    const prov = await base.db.prepare("SELECT COUNT(*) AS n FROM providers WHERE name = 'Zafra de arroz'").first<{ n: number }>();
    expect(prov?.n).toBe(1);
    expect(await filasDeLaZafra()).toHaveLength(7);
  });

  it("con GTP 4371 en la base las deja asignadas sólo a ese camión, también sin duplicar", async () => {
    ids.camionDeLaZafra = (
      await base.db
        .prepare(
          "INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES ('GTP 4371', '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')",
        )
        .run()
    ).meta.last_row_id as number;
    ids.choferZafra = (
      await base.db
        .prepare(
          "INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES ('Chofer Zafra', 'ZA1', '', '', '', '', 'activo', ?)",
        )
        .bind(ids.camionDeLaZafra)
        .run()
    ).meta.last_row_id as number;
    // Para que el chofer pueda salir: la foto del tacógrafo del mes.
    await base.db
      .prepare("INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje) VALUES (?, ?, 1000)")
      .bind(ids.camionDeLaZafra, periodoDeHoy())
      .run();

    await correrMigracion();
    await correrMigracion();
    const filas = (
      await base.db
        .prepare("SELECT template_id, truck_id FROM template_trucks WHERE truck_id = ?")
        .bind(ids.camionDeLaZafra)
        .all<any>()
    ).results;
    expect(filas).toHaveLength(7);
  });
});

describe("los choferes no la ven", () => {
  it("la lista del chofer no trae ninguna plantilla de la zafra, ni siquiera la del camión asignado", async () => {
    const r = await pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), "/api/templates");
    expect(r.status).toBe(200);
    expect((r.body.data as any[]).filter((t) => t.provider_name === "Zafra de arroz")).toEqual([]);
  });

  it("aunque mande el id a mano, no puede salir de viaje", async () => {
    const [primera] = await filasDeLaZafra();
    const r = await pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), "/api/trips", {
      method: "POST",
      json: {
        template_id: primera.id,
        origin: "B. Brum",
        destino: "Saman T.G",
        truck_id: ids.camionDeLaZafra,
        field_values: { remito_carga: "1" },
      },
    });
    expect(r.status).toBe(404);
  });

  it("la oficina sí las ve, inactivas y en el orden de Rodrigo", async () => {
    const r = await pedir(await tokenOficina(), "/api/templates");
    const zafra = (r.body.data as any[]).filter((t) => t.provider_name === "Zafra de arroz");
    expect(zafra.map((t) => t.name)).toEqual(VIAJES.map((v) => v.nombre));
    expect(zafra.every((t) => t.active === false)).toBe(true);
  });
});

describe("el orden de las plantillas", () => {
  it("las que no tienen orden quedan exactamente como estaban: por cliente y por nombre", async () => {
    const r = await pedir(await tokenOficina(), "/api/templates");
    const existentes = (r.body.data as any[]).filter((t) => t.provider_name !== "Zafra de arroz");
    const comoAntes = (
      await base.db
        .prepare(
          `SELECT tt.id FROM trip_templates tt JOIN providers p ON p.id = tt.provider_id
            WHERE p.name != 'Zafra de arroz' ORDER BY p.name, tt.name`,
        )
        .all<{ id: number }>()
    ).results.map((x) => x.id);
    expect(existentes.map((t) => t.id)).toEqual(comoAntes);
    expect(existentes.every((t) => t.orden === null && t.km_fijos === null)).toBe(true);
  });

  it("adentro de un cliente, primero las que tienen orden y después las demás por nombre", () => {
    const lista = [
      { provider_name: "X", name: "Zeta", orden: null },
      { provider_name: "X", name: "Beta", orden: 2 },
      { provider_name: "X", name: "Alfa", orden: null },
      { provider_name: "X", name: "Gamma", orden: 1 },
      { provider_name: "A", name: "Última", orden: null },
    ];
    expect([...lista].sort(compararPlantillas).map((t) => t.name)).toEqual(["Última", "Gamma", "Beta", "Alfa", "Zeta"]);
  });

  it("el orden de la API sale igual que el de la comparación compartida", async () => {
    const r = await pedir(await tokenOficina(), "/api/templates");
    const api = (r.body.data as any[]).map((t) => t.id);
    const compartido = [...(r.body.data as any[])].sort(compararPlantillas).map((t) => t.id);
    expect(api).toEqual(compartido);
  });
});

describe("prenderla desde la oficina, sin programar", () => {
  it("tildar «Activa» en Plantillas la deja visible para el camión asignado y para ningún otro", async () => {
    const oficina = await tokenOficina();
    const { body } = await pedir(oficina, "/api/templates");
    const primera = (body.data as any[]).find((t) => t.name === VIAJES[0].nombre);
    expect(primera.truck_ids).toEqual([ids.camionDeLaZafra]);
    // Se prenden las 7 igual que lo haría la oficina: una por una, tildando «Activa» y guardando.
    for (const t of (body.data as any[]).filter((x) => x.provider_name === "Zafra de arroz")) {
      const guardada = await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: { ...t, active: true } });
      expect(guardada.status, JSON.stringify(guardada.body)).toBe(200);
    }

    const delAsignado = await pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), "/api/templates");
    expect((delAsignado.body.data as any[]).map((t) => t.name)).toContain(VIAJES[0].nombre);
    const deOtro = await pedir(await tokenChofer(ids.otroChofer, ids.otroCamion), "/api/templates");
    expect((deOtro.body.data as any[]).map((t) => t.name)).not.toContain(VIAJES[0].nombre);
  });

  it("guardar la plantilla sin km_fijos ni orden en el pedido (una pantalla vieja) no los borra", async () => {
    const oficina = await tokenOficina();
    const { body } = await pedir(oficina, "/api/templates");
    const primera = (body.data as any[]).find((t) => t.name === VIAJES[0].nombre);
    const { km_fijos, orden, ...sinEsosCampos } = primera;
    await pedir(oficina, `/api/templates/${primera.id}`, { method: "PUT", json: sinEsosCampos });
    const despues = await base.db.prepare("SELECT km_fijos, orden FROM trip_templates WHERE id = ?").bind(primera.id).first<any>();
    expect(despues).toEqual({ km_fijos: 45, orden: 1 });
  });

  it("vaciar los campos en la pantalla (null) sí los saca, y un valor que no es entero positivo se descarta", async () => {
    const oficina = await tokenOficina();
    const { body } = await pedir(oficina, "/api/templates");
    const ultima = (body.data as any[]).find((t) => t.name === VIAJES[6].nombre);
    await pedir(oficina, `/api/templates/${ultima.id}`, { method: "PUT", json: { ...ultima, km_fijos: null, orden: "abc" } });
    const despues = await base.db.prepare("SELECT km_fijos, orden FROM trip_templates WHERE id = ?").bind(ultima.id).first<any>();
    expect(despues).toEqual({ km_fijos: null, orden: null });
    // Se lo devolvemos como estaba para no tocar los demás tests.
    await pedir(oficina, `/api/templates/${ultima.id}`, { method: "PUT", json: { ...ultima, km_fijos: 72, orden: 7 } });
  });

  it("el editor guarda el tipo Sí/No", async () => {
    const oficina = await tokenOficina();
    const { body } = await pedir(oficina, "/api/templates");
    const plantilla = (body.data as any[]).find((t) => t.name === VIAJES[1].nombre);
    const r = await pedir(oficina, `/api/templates/${plantilla.id}`, { method: "PUT", json: plantilla });
    expect((r.body.data.fields as any[]).find((f) => f.label === "Sobrepeso").type).toBe("si_no");
  });
});

describe("un viaje de la zafra, de punta a punta", () => {
  const descarga = { kilos: "28500", sobrepeso: SI_NO.NO, remito_boleta: "B-1234" };
  let tripId = 0;

  const salir = async (nombre: string, origen: string, destino: string) => {
    const oficina = await tokenOficina();
    const plantilla = ((await pedir(oficina, "/api/templates")).body.data as any[]).find((t) => t.name === nombre);
    return pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), "/api/trips", {
      method: "POST",
      json: {
        template_id: plantilla.id,
        origin: origen,
        destino,
        truck_id: ids.camionDeLaZafra,
        field_values: { remito_carga: "4567" },
      },
    });
  };
  const cerrar = async (id: number, extra: Record<string, unknown>) =>
    pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), `/api/trips/${id}/finish`, { method: "POST", json: extra });
  const kmDe = async (id: number) =>
    (await base.db.prepare("SELECT kilometros FROM trips WHERE id = ?").bind(id).first<{ kilometros: number | null }>())?.kilometros;

  it("sale con el número de remito de la carga (obligatorio)", async () => {
    const oficina = await tokenOficina();
    const plantilla = ((await pedir(oficina, "/api/templates")).body.data as any[]).find((t) => t.name === VIAJES[0].nombre);
    const sinRemito = await pedir(await tokenChofer(ids.choferZafra, ids.camionDeLaZafra), "/api/trips", {
      method: "POST",
      json: { template_id: plantilla.id, origin: "B. Brum", destino: "Saman T.G", truck_id: ids.camionDeLaZafra, field_values: {} },
    });
    expect(sinRemito.status).toBe(400);
    expect(sinRemito.body.error).toContain("Número de remito");

    const r = await salir(VIAJES[0].nombre, "B. Brum", "Saman T.G");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    tripId = r.body.data.id;
  });

  it("no cierra sin elegir Sobrepeso: Sí o No es obligatorio", async () => {
    const r = await cerrar(tripId, { field_values: { kilos: "28500", remito_boleta: "B-1234" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Falta: Sobrepeso");
  });

  it("tampoco con algo que no sea Sí ni No", async () => {
    const r = await cerrar(tripId, { field_values: { ...descarga, sobrepeso: "true" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("elegí Sí o No");
  });

  it("falta cualquiera de los otros obligatorios de la descarga y no cierra", async () => {
    for (const falta of ["kilos", "remito_boleta"]) {
      const valores: Record<string, string> = { ...descarga };
      delete valores[falta];
      const r = await cerrar(tripId, { field_values: valores });
      expect(r.status, falta).toBe(400);
    }
    expect((await base.db.prepare("SELECT status FROM trips WHERE id = ?").bind(tripId).first<any>()).status).toBe("EN_CURSO");
  });

  it("cierra con todo y toma los km fijos de la plantilla (45), con «Sí» o «No» legibles", async () => {
    const r = await cerrar(tripId, { field_values: descarga });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await kmDe(tripId)).toBe(45);
    const guardado = await base.db.prepare("SELECT field_values, kilos FROM trips WHERE id = ?").bind(tripId).first<any>();
    expect(JSON.parse(guardado.field_values)).toMatchObject({ sobrepeso: "No", remito_boleta: "B-1234", kilos: "28500" });
    expect(guardado.kilos).toBe(28500);
  });

  it("si el chofer cargó los km reales, mandan ellos y no los fijos", async () => {
    const salida = await salir(VIAJES[2].nombre, "Patitas", "Salto");
    expect(salida.status, JSON.stringify(salida.body)).toBe(200);
    const r = await cerrar(salida.body.data.id, { field_values: { ...descarga, sobrepeso: SI_NO.SI }, kilometros: 118 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await kmDe(salida.body.data.id)).toBe(118);
  });

  it("los km que ya tenía el viaje tampoco se pisan con los fijos", async () => {
    const salida = await salir(VIAJES[3].nombre, "Puesto", "Salto");
    await base.db.prepare("UPDATE trips SET kilometros = 171 WHERE id = ?").bind(salida.body.data.id).run();
    const r = await cerrar(salida.body.data.id, { field_values: descarga });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await kmDe(salida.body.data.id)).toBe(171);
  });

  it("una plantilla sin km fijos sigue estimando por ciudades, como siempre", async () => {
    const oficina = await tokenOficina();
    const casarone = ((await pedir(oficina, "/api/templates")).body.data as any[]).find((t) => t.name === "Carga Casarone");
    const chofer = await tokenChofer(ids.choferZafra, ids.camionDeLaZafra);
    const alta = await pedir(chofer, "/api/trips", {
      method: "POST",
      json: {
        template_id: casarone.id,
        origin: "Artigas",
        destino: "Montevideo",
        destinatario: "Tifecom",
        truck_id: ids.camionDeLaZafra,
        field_values: { remito_carga: "9", toneladas: "28000" },
      },
    });
    expect(alta.status, JSON.stringify(alta.body)).toBe(200);
    const r = await cerrar(alta.body.data.id, { field_values: {} });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await kmDe(alta.body.data.id)).toBe(kmEstimados("Artigas", "Montevideo"));
  });
});
