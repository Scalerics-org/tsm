import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../api/app";
import { signToken } from "../api/lib/crypto";
import { periodoDeHoy } from "../api/lib/periodo";
import { ROLES, esDiaIso, plantillaParaChofer, plantillaVisibleParaChofer } from "@shared/domain";
import { hoyEnUruguay } from "@shared/vencimientos";
import { baseReal } from "./helpers/d1-real";

/**
 * Plantillas que le aparecen solas a los choferes desde una fecha (la zafra de arroz, el 15/1/2027).
 *
 * La regla: el chofer la ve si está activa Y (no tiene fecha O la fecha ya llegó, en el día de Uruguay) Y su camión la puede
 * hacer. Se aplica en la lista del celular y en el alta del viaje; la oficina la ve y la edita siempre. Una plantilla sin
 * fecha —todas las que existen— se comporta exactamente como hasta ahora.
 */

describe("la regla (pura)", () => {
  const HOY = "2027-01-15";
  const plantilla = (visible_desde: string | null, active = true) => ({ active, visible_desde });

  it("sin fecha, como siempre: la ven", () => {
    expect(plantillaVisibleParaChofer(plantilla(null), HOY)).toBe(true);
    expect(plantillaVisibleParaChofer({ active: true }, HOY)).toBe(true);
  });

  it("con fecha pasada, la ven", () => {
    expect(plantillaVisibleParaChofer(plantilla("2027-01-14"), HOY)).toBe(true);
  });

  it("el día de la fecha, ya la ven", () => {
    expect(plantillaVisibleParaChofer(plantilla("2027-01-15"), HOY)).toBe(true);
  });

  it("con fecha de mañana, todavía no", () => {
    expect(plantillaVisibleParaChofer(plantilla("2027-01-16"), HOY)).toBe(false);
  });

  it("inactiva no la ve nadie, ni con la fecha pasada ni sin fecha", () => {
    expect(plantillaVisibleParaChofer(plantilla("2027-01-01", false), HOY)).toBe(false);
    expect(plantillaVisibleParaChofer(plantilla(null, false), HOY)).toBe(false);
  });

  it("una fecha ilegible no la muestra: mejor que aparezca tarde y no antes de lo que pidió el cliente", () => {
    for (const rara of ["15/01/2027", "2027-02-31", "mañana", "2027-1-5"]) {
      expect(plantillaVisibleParaChofer(plantilla(rara), HOY), rara).toBe(false);
    }
  });

  it("el borde es la medianoche de Uruguay: las 02:59 UTC del 15/1 todavía son 14/1, y las 03:00 ya son 15/1", () => {
    const antes = hoyEnUruguay(new Date("2027-01-15T02:59:59Z"));
    const despues = hoyEnUruguay(new Date("2027-01-15T03:00:00Z"));
    expect([antes, despues]).toEqual(["2027-01-14", "2027-01-15"]);
    expect(plantillaVisibleParaChofer(plantilla("2027-01-15"), antes)).toBe(false);
    expect(plantillaVisibleParaChofer(plantilla("2027-01-15"), despues)).toBe(true);
  });

  it("además tiene que cumplirse lo de los camiones asignados", () => {
    const zafra = { id: 7, active: true, visible_desde: "2027-01-15", truck_ids: [22] };
    // La fecha llegó: la ve sólo el camión asignado.
    expect(plantillaParaChofer(zafra, 22, [], HOY)).toBe(true);
    expect(plantillaParaChofer(zafra, 5, [], HOY)).toBe(false);
    // La fecha no llegó: ni siquiera el asignado.
    expect(plantillaParaChofer(zafra, 22, [], "2027-01-14")).toBe(false);
    // Sin asignación la ven todos (como siempre), pero igual hace falta que llegue la fecha.
    expect(plantillaParaChofer({ ...zafra, truck_ids: [] }, 5, [], HOY)).toBe(true);
    expect(plantillaParaChofer({ ...zafra, truck_ids: [] }, 5, [], "2027-01-14")).toBe(false);
  });

  it("esDiaIso reconoce sólo días reales escritos AAAA-MM-DD", () => {
    expect(esDiaIso("2027-01-15")).toBe(true);
    expect(esDiaIso("2028-02-29")).toBe(true);
    for (const x of ["2027-02-29", "2027-13-01", "2027-1-15", "15/01/2027", "", null, undefined, 20270115]) {
      expect(esDiaIso(x), String(x)).toBe(false);
    }
  });
});

describe("contra la base de verdad", () => {
  const SECRET = "test-secret-tsm";
  let base: Awaited<ReturnType<typeof baseReal>>;
  const ids = { camion: 0, chofer: 0, oficina: 0, proveedor: 0, conFecha: 0, sinFecha: 0 };

  const tokenOficina = () =>
    signToken({ id: ids.oficina, name: "Oficina", role: ROLES.ADMIN, driver_id: null, truck_id: null, email: null } as any, SECRET);
  const tokenChofer = () =>
    signToken({ id: ids.chofer, name: "Chofer", role: ROLES.CHOFER, driver_id: ids.chofer, truck_id: ids.camion, email: null } as any, SECRET);

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

  const cuerpoDePlantilla = (nombre: string, extra: Record<string, unknown> = {}) => ({
    provider_id: ids.proveedor,
    name: nombre,
    origin: "Artigas",
    cargo_type: "Carga",
    dest_options: [{ destino: "Montevideo", destinatario: "Tifecom" }],
    fields: [],
    active: true,
    ...extra,
  });
  const nombresDelChofer = async (query = "") =>
    ((await pedir(await tokenChofer(), `/api/templates${query}`)).body.data as any[]).map((t) => t.name);
  const salir = async (templateId: number) =>
    pedir(await tokenChofer(), "/api/trips", {
      method: "POST",
      json: { template_id: templateId, origin: "Artigas", destino: "Montevideo", destinatario: "Tifecom", truck_id: ids.camion, field_values: {} },
    });

  beforeAll(async () => {
    // Reloj de octubre de 2026: la fecha futura de estas pruebas es el 15/1/2027. Sólo se falsea Date.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
    base = await baseReal();
    ids.camion = (
      await base.db
        .prepare(
          "INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, clase) VALUES ('ZZV 0001', '', '', 0, 'Tractor', 0, 0, 0, 'disponible', 'camion')",
        )
        .run()
    ).meta.last_row_id as number;
    ids.chofer = (
      await base.db
        .prepare(
          "INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id) VALUES ('Chofer Fecha', 'VF1', '', '', '', '', 'activo', ?)",
        )
        .bind(ids.camion)
        .run()
    ).meta.last_row_id as number;
    ids.oficina = (
      await base.db
        .prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('fecha@prueba.test', 'x', 'Oficina', 'admin')")
        .run()
    ).meta.last_row_id as number;
    await base.db
      .prepare("INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje) VALUES (?, ?, 1000)")
      .bind(ids.camion, periodoDeHoy())
      .run();
    ids.proveedor = (await base.db.prepare("SELECT id FROM providers ORDER BY id LIMIT 1").first<{ id: number }>())!.id;

    const oficina = await tokenOficina();
    ids.conFecha = (
      await pedir(oficina, "/api/templates", { method: "POST", json: cuerpoDePlantilla("Con fecha", { visible_desde: "2027-01-15" }) })
    ).body.data.id;
    ids.sinFecha = (await pedir(oficina, "/api/templates", { method: "POST", json: cuerpoDePlantilla("Sin fecha") })).body.data.id;
  }, 180_000);

  afterAll(async () => {
    vi.useRealTimers();
    await base?.cerrar();
  });

  it("la lista del chofer no trae la de fecha futura, y sí la que no tiene fecha", async () => {
    const nombres = await nombresDelChofer();
    expect(nombres).toContain("Sin fecha");
    expect(nombres).not.toContain("Con fecha");
  });

  it("tampoco cuando el chofer pide la lista de otro camión (?truck=)", async () => {
    const nombres = await nombresDelChofer(`?truck=${ids.camion}`);
    expect(nombres).toContain("Sin fecha");
    expect(nombres).not.toContain("Con fecha");
  });

  it("el alta del viaje la rechaza, aunque el id llegue a mano", async () => {
    const r = await salir(ids.conFecha);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe("Plantilla de viaje no disponible");
    const n = await base.db.prepare("SELECT COUNT(*) AS n FROM trips WHERE template_id = ?").bind(ids.conFecha).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("la oficina la ve igual, con su fecha, y la puede editar", async () => {
    const oficina = await tokenOficina();
    const lista = (await pedir(oficina, "/api/templates")).body.data as any[];
    const t = lista.find((x) => x.name === "Con fecha");
    expect(t).toMatchObject({ active: true, visible_desde: "2027-01-15" });
    const editada = await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: { ...t, cargo_type: "Arroz" } });
    expect(editada.status).toBe(200);
    expect(editada.body.data).toMatchObject({ cargo_type: "Arroz", visible_desde: "2027-01-15" });
  });

  it("la que no tiene fecha se comporta como siempre: el chofer puede salir", async () => {
    const r = await salir(ids.sinFecha);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // Se cierra para poder probar el alta de la otra después.
    const cierre = await pedir(await tokenChofer(), `/api/trips/${r.body.data.id}/finish`, { method: "POST", json: { field_values: {} } });
    expect(cierre.status, JSON.stringify(cierre.body)).toBe(200);
  });

  it("las plantillas que ya existían (sin fecha) se ven igual que antes: la lista del chofer no cambia con la fecha de hoy", async () => {
    const hoy = await nombresDelChofer();
    vi.setSystemTime(new Date("2030-06-01T12:00:00Z"));
    const muchoDespues = await nombresDelChofer();
    vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
    // Lo único que aparece con el tiempo es la que tiene fecha.
    expect(muchoDespues.filter((n) => n !== "Con fecha")).toEqual(hoy);
    const todas = await base.db.prepare("SELECT COUNT(*) AS n FROM trip_templates WHERE visible_desde IS NOT NULL").first<{ n: number }>();
    expect(todas?.n).toBe(1);
  });

  it("a las 02:59 UTC del 15/1 todavía no (es el 14 en Uruguay); a las 03:00 le aparece sola, en la lista y en el alta", async () => {
    vi.setSystemTime(new Date("2027-01-15T02:59:59Z"));
    // Cambia el mes, así que el chofer necesita la foto del tacógrafo de enero para poder salir de viaje.
    await base.db.prepare("INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje) VALUES (?, ?, 2000)").bind(ids.camion, periodoDeHoy()).run();
    expect(await nombresDelChofer()).not.toContain("Con fecha");
    expect((await salir(ids.conFecha)).status).toBe(404);

    vi.setSystemTime(new Date("2027-01-15T03:00:00Z"));
    expect(await nombresDelChofer()).toContain("Con fecha");
    expect(await nombresDelChofer(`?truck=${ids.camion}`)).toContain("Con fecha");
    const r = await salir(ids.conFecha);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  });

  it("una fecha mal escrita se rechaza y no se toma por «sin fecha»", async () => {
    const oficina = await tokenOficina();
    const t = ((await pedir(oficina, "/api/templates")).body.data as any[]).find((x) => x.name === "Con fecha");
    for (const mala of ["15/01/2027", "2027-02-31", "mañana"]) {
      const r = await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: { ...t, visible_desde: mala } });
      expect(r.status, mala).toBe(400);
    }
    const alta = await pedir(oficina, "/api/templates", { method: "POST", json: cuerpoDePlantilla("Mala", { visible_desde: "31/12/2026" }) });
    expect(alta.status).toBe(400);
    const fila = await base.db.prepare("SELECT visible_desde FROM trip_templates WHERE id = ?").bind(t.id).first<any>();
    expect(fila.visible_desde).toBe("2027-01-15");
  });

  it("guardar sin el campo (una pantalla vieja) no la borra; vacío o null sí la saca", async () => {
    const oficina = await tokenOficina();
    const t = ((await pedir(oficina, "/api/templates")).body.data as any[]).find((x) => x.name === "Con fecha");
    const { visible_desde, ...sinElCampo } = t;
    await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: sinElCampo });
    expect((await base.db.prepare("SELECT visible_desde FROM trip_templates WHERE id = ?").bind(t.id).first<any>()).visible_desde).toBe("2027-01-15");

    await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: { ...t, visible_desde: "" } });
    expect((await base.db.prepare("SELECT visible_desde FROM trip_templates WHERE id = ?").bind(t.id).first<any>()).visible_desde).toBeNull();
    // Y sin fecha, el chofer la ve ya (hay que volver a ponerla para no tocar los otros tests).
    expect(await nombresDelChofer()).toContain("Con fecha");
    await pedir(oficina, `/api/templates/${t.id}`, { method: "PUT", json: { ...t, visible_desde: "2027-01-15" } });
    expect(await nombresDelChofer()).not.toContain("Con fecha");
  });
});
