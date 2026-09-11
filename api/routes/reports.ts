import { fotoQueFalta, leFaltaCarga } from "../lib/fotos-faltantes";
import { surtidasARevisar, surtidasParaLaFicha } from "../lib/surtidas-a-revisar";
import { viajesAFacturar } from "../lib/resumen-cliente";
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  ROLES,
  TRIP_STATUS,
  consumoDelPeriodo,
  monthlyConsumption,
  type PendienteCobro,
  type Trip,
} from "../../shared/domain";
import { listTrips, listTripsFacturables } from "../repos/trips";
import { columnasDeCampos, encabezado, filasDeViaje, resumenParaElCliente } from "../lib/export-viajes";
import { csvResponse } from "../lib/csv";
import { vaciosEntreViajes, kmVacios, vaciosDelPeriodo } from "../../shared/vacios";
import { resumenCliente } from "../lib/resumen-cliente";
import { listTemplates } from "../repos/templates";
import { listFuelLogs } from "../repos/fuel";
import { listTrucks, getTruck } from "../repos/trucks";
import { listDrivers, getDriver } from "../repos/drivers";
import { tripPhotoStatus } from "../repos/photos";

const reports = new Hono<{ Bindings: Env; Variables: Vars }>();
reports.use("*", requireAuth, requireRole(ROLES.ENCARGADO, ROLES.ADMIN));

function roundTo(n: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ── Resumen: totales, por camión, por cliente ──
reports.get("/summary", async (c) => {
  const q = c.req.query();
  const range = { from: q.from, to: q.to };
  const [trucks, trips, fuel, allFuel, todosLosViajes] = await Promise.all([
    listTrucks(c.env.DB),
    listTrips(c.env.DB, { from: range.from, to: range.to }),
    listFuelLogs(c.env.DB, { from: range.from, to: range.to }),
    listFuelLogs(c.env.DB, {}),
    // Los vacíos se calculan sobre TODOS los viajes y se filtran después (`vaciosDelPeriodo`):
    // con los del rango solos se pierde el tramo del borde de mes.
    listTrips(c.env.DB, {}),
  ]);

  const vaciosDelCamion = (truckId: number) => {
    const v = vaciosDelPeriodo(
      todosLosViajes
        .filter((x) => x.truck_id === truckId && x.status !== TRIP_STATUS.CANCELADO)
        .map((x) => ({
          id: x.id,
          started_at: x.started_at,
          origin: x.origin,
          destination: x.destination,
          kilometros: Number.isFinite(x.kilometros as number) ? (x.kilometros as number) : null,
        })),
      range.from,
      range.to,
    );
    return {
      km_retorno: Math.round(v.km_retorno),
      km_reposicion: Math.round(v.km_reposicion),
      tramos_vacios: v.tramos,
      vacios_sin_km: v.sin_km,
    };
  };

  const byTruck = trucks.map((t) => {
    const tTrips = trips.filter((x) => x.truck_id === t.id);
    // Con TODAS las surtidas del camión, no con `fuel` que ya viene recortado por el período.
    // La línea de base tiene que salir de ANTES del rango: recortando primero, el arranque del
    // período quedaba sin contra qué medirse. Es el mismo corte de mes que reportó el cliente,
    // y por eso esta tarjeta y la de consumo mensual decían cosas distintas del mismo camión
    // (10.816 km / 2,74 acá contra 11.197 / 2,77 abajo).
    const tFuel = allFuel.filter((x) => x.truck_id === t.id);
    const fs = consumoDelPeriodo(tFuel, range.from ?? "0000-01-01", range.to ?? "9999-12-31");
    return {
      truck_id: t.id,
      plate: t.plate,
      trips: tTrips.length,
      completed: tTrips.filter((x) => x.status === TRIP_STATUS.COMPLETADO).length,
      // Sin los cancelados, igual que en la ficha del camión: un viaje que no se hizo no cargó.
      tons: roundTo(
        tTrips.filter((x) => x.status !== TRIP_STATUS.CANCELADO).reduce((s, x) => s + (x.kilos_carga ?? 0), 0),
      ),
      km: Math.round(fs.km),
      liters: Math.round(fs.liters),
      consumption_kml: fs.kml != null ? roundTo(fs.kml, 2) : null,
      // "No veo bien dónde quedó el resumen, identificado por camión." Estaba repartido entre
      // la ficha de cada camión y la letra chica de Control; acá queda en la tabla de todos.
      ...vaciosDelCamion(t.id),
    };
  });

  // Por cliente (proveedor)
  const provMap = new Map<string, { trips: number; completed: number; tons: number }>();
  for (const t of trips) {
    const p = provMap.get(t.provider_name) ?? { trips: 0, completed: 0, tons: 0 };
    p.trips += 1;
    if (t.status === TRIP_STATUS.COMPLETADO) p.completed += 1;
    p.tons += t.kilos_carga ?? 0;
    provMap.set(t.provider_name, p);
  }
  const byProvider = [...provMap.entries()]
    .map(([name, v]) => ({ name, trips: v.trips, completed: v.completed, tons: roundTo(v.tons) }))
    .sort((a, b) => b.trips - a.trips);

  const monthlyByTruck = trucks
    .map((t) => ({
      truck_id: t.id,
      plate: t.plate,
      months: monthlyConsumption(
        allFuel
          .filter((f) => f.truck_id === t.id)
          .map((f) => ({ odometer_km: f.odometer_km, liters: f.liters, is_full: !!f.is_full, logged_at: f.logged_at })),
      )
        .slice(0, 6)
        .map((m) => ({
          month: m.month,
          km: Math.round(m.km),
          liters: Math.round(m.liters),
          kml: m.kml != null ? roundTo(m.kml, 2) : null,
          closed: m.closed,
        })),
    }))
    .filter((t) => t.months.length > 0);

  return ok(c, {
    totals: {
      trips: trips.length,
      en_curso: trips.filter((x) => x.status === TRIP_STATUS.EN_CURSO).length,
      completados: trips.filter((x) => x.status === TRIP_STATUS.COMPLETADO).length,
      surtidas: fuel.length,
    },
    byTruck,
    byProvider,
    monthlyByTruck,
  });
});

// ── Alertas de control ──
reports.get("/alerts", async (c) => {
  const now = Date.now();
  const [trips, photoStatus, drivers, trucks, allFuel] = await Promise.all([
    listTrips(c.env.DB, { status: TRIP_STATUS.EN_CURSO }),
    tripPhotoStatus(c.env.DB, { status: TRIP_STATUS.COMPLETADO }),
    listDrivers(c.env.DB),
    listTrucks(c.env.DB),
    listFuelLogs(c.env.DB, {}),
  ]);

  const OVERDUE_HOURS = 24;
  const overdue = trips
    .map((t) => {
      const started = Date.parse(t.started_at.replace(" ", "T") + "Z") || now;
      const hours = Math.floor((now - started) / 3_600_000);
      return { ...t, hours };
    })
    .filter((t) => t.hours >= OVERDUE_HOURS)
    .map((t) => ({
      id: t.id,
      provider_name: t.provider_name,
      origin: t.origin,
      destination: t.destination,
      driver_name: t.driver_name,
      truck_plate: t.truck_plate,
      hours: t.hours,
    }));

  // Sólo las fotos que se le tenían que pedir: no a un viaje vacío, ni a una plantilla que no
  // pide foto, ni a un viaje cargado desde oficina, ni sin R2. Ver `api/lib/fotos-faltantes.ts`.
  const conR2 = !!c.env.FOTOS;
  const missingPhotos = photoStatus
    .map((p) => ({ ...p, missing: fotoQueFalta(p, conR2) ?? "" }))
    .filter((p) => p.missing)
    .map((p) => ({
      id: p.id,
      provider_name: p.provider_name,
      origin: p.origin,
      destination: p.destination,
      driver_name: p.driver_name,
      missing: p.missing,
    }));

  const DAY = 86_400_000;
  const expiringLicenses = drivers
    .filter((d) => d.license_expiry)
    .map((d) => {
      const exp = Date.parse(d.license_expiry + "T00:00:00Z");
      const days = isNaN(exp) ? 999 : Math.floor((exp - now) / DAY);
      return { driver_id: d.id, name: d.name, license_expiry: d.license_expiry, days };
    })
    .filter((d) => d.days <= 60)
    .sort((a, b) => a.days - b.days);

  // 15% POR DEBAJO del rendimiento esperado. En km/L más es mejor, así que la comparación
  // va al revés que cuando esto se medía en L/100 km: rendir menos es la señal de problema.
  const ANOMALY = 0.85;
  const fuelAnomalies = trucks
    .map((t) => {
      const months = monthlyConsumption(
        allFuel
          .filter((f) => f.truck_id === t.id)
          .map((f) => ({ odometer_km: f.odometer_km, liters: f.liters, is_full: !!f.is_full, logged_at: f.logged_at })),
      );
      const lastClosed = months.find((m) => m.closed && m.kml != null);
      if (!lastClosed || lastClosed.kml == null || t.avg_km_litro <= 0) return null;
      const rindeMenos = lastClosed.kml < t.avg_km_litro * ANOMALY;
      return rindeMenos
        ? {
            truck_id: t.id,
            plate: t.plate,
            month: lastClosed.month,
            expected: t.avg_km_litro,
            actual: roundTo(lastClosed.kml, 2),
            // Negativo: cuánto por debajo del esperado quedó.
            pct: Math.round((lastClosed.kml / t.avg_km_litro - 1) * 100),
          }
        : null;
    })
    .filter(Boolean);

  return ok(c, { overdue, missingPhotos, expiringLicenses, fuelAnomalies });
});

// ── Ficha por camión ──
reports.get("/truck/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const truck = await getTruck(c.env.DB, id);
  if (!truck) return fail(c, "Camión no encontrado", 404);
  const [trips, fuel] = await Promise.all([
    listTrips(c.env.DB, { truckId: id }),
    listFuelLogs(c.env.DB, { truckId: id }),
  ]);
  const monthly = monthlyConsumption(
    fuel.map((f) => ({ odometer_km: f.odometer_km, liters: f.liters, is_full: !!f.is_full, logged_at: f.logged_at })),
  ).map((m) => ({
    month: m.month,
    km: Math.round(m.km),
    liters: Math.round(m.liters),
    kml: m.kml != null ? roundTo(m.kml, 2) : null,
    closed: m.closed,
  }));
  // Los tramos vacíos, deducidos de la seguidilla de viajes de ESTE camión. Se calculan
  // sobre todos sus viajes y no sobre los 20 que se muestran: el hueco entre dos viajes
  // necesita a los dos, y recortar la lista primero inventaría vacíos donde no los hay.
  //
  // SIN LOS CANCELADOS. Un viaje cancelado no se hizo, así que el camión nunca estuvo en
  // ese destino: dejarlo adentro parte la cadena en dos y aparecen tramos que no existieron.
  // Lo encontró el cliente probando: arrancó tres viajes, los canceló, y le quedaron
  // figurando como vacíos en la ficha. Control ya los filtraba; esta pantalla no.
  const hechos = trips.filter((t) => t.status !== TRIP_STATUS.CANCELADO);
  const vacios = vaciosEntreViajes(
    hechos
      .map((t) => ({
        id: t.id,
        started_at: t.started_at,
        origin: t.origin,
        destination: t.destination,
        kilometros: Number.isFinite(t.kilometros as number) ? (t.kilometros as number) : null,
      })),
  );

  // El aviso de litros se calcula con TODAS las surtidas y con la misma función que Control
  // (`surtidasARevisar`). Antes lo recalculaba la pantalla con las 20 que le llegaban: con más
  // de 20, la mediana salía de otra muestra y las dos pantallas marcaban surtidas distintas.
  const aRevisar = surtidasARevisar(fuel);
  const marcadas = new Set(aRevisar.sospechosas.map((s) => s.id));

  return ok(c, {
    truck,
    trips: trips.slice(0, 20),
    monthly,
    fuel: surtidasParaLaFicha(fuel, marcadas),
    surtidas_a_revisar: Object.fromEntries(aRevisar.sospechosas.map((s) => [s.id, s.motivo])),
    vacios: vacios.slice(-20).reverse(),
    km_vacios: kmVacios(vacios),
    // Mismo criterio que los vacíos: un viaje cancelado no cargó nada, así que sus kilos
    // no son toneladas transportadas. La lista de arriba SÍ los sigue mostrando — la
    // oficina tiene que poder ver que existieron—, pero no entran en el total.
    tons: roundTo(hechos.reduce((s, t) => s + (t.kilos_carga ?? 0), 0)),
  });
});

// ── Ficha por chofer ──
reports.get("/driver/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const driver = await getDriver(c.env.DB, id);
  if (!driver) return fail(c, "Chofer no encontrado", 404);
  const [trips, photoStatus] = await Promise.all([
    listTrips(c.env.DB, { driverId: id }),
    tripPhotoStatus(c.env.DB, { status: TRIP_STATUS.COMPLETADO, driverId: id }),
  ]);
  const withPhoto = photoStatus.filter((p) => p.has_carga > 0).length;
  // "Sin foto" son los que la tenían que tener y no la tienen. Un viaje cargado desde oficina
  // no cuenta en ninguno de los dos: no es cumplimiento del chofer, pasó sin la app.
  const withoutPhoto = photoStatus.filter((p) => leFaltaCarga(p, !!c.env.FOTOS)).length;
  return ok(c, {
    driver,
    trips: trips.slice(0, 30),
    stats: {
      total: trips.length,
      completed: trips.filter((t) => t.status === TRIP_STATUS.COMPLETADO).length,
      tons: roundTo(trips.reduce((s, t) => s + (t.kilos_carga ?? 0), 0)),
      withPhoto,
      withoutPhoto,
    },
  });
});

// ── Exports CSV ──
// El armado del archivo vive en `api/lib/csv.ts`: acá adentro no se podía probar, y las
// reglas de escapado son justo las que rompen en silencio.
// Una fila por carga: es la unidad facturable. Los viajes de un solo tramo
// exportan una fila, igual que antes.
reports.get("/trips.csv", async (c) => {
  const q = c.req.query();
  // La pantalla ya mandaba chofer, camión y estado —es el mismo `query` con el que pide la
  // lista—, pero acá se leían sólo las fechas: el Excel bajaba TODO y no lo que se estaba
  // mirando. Los nombres de los parámetros son los mismos que en GET /api/trips.
  const filtros = {
    from: q.from,
    to: q.to,
    provider: q.provider || undefined,
    driverId: q.driver ? Number(q.driver) : undefined,
    truckId: q.truck ? Number(q.truck) : undefined,
    status: (q.status as Trip["status"]) || undefined,
  };
  // Desde el resumen por cliente se pide SÓLO lo facturable, que es lo que esa pantalla
  // muestra. Antes el botón bajaba todo —ya facturados y cancelados incluidos, sin ninguna
  // columna que los distinguiera—, así que el total del Excel no coincidía con el de la
  // pantalla, y facturando desde el Excel se podía cobrar dos veces un viaje.
  const soloFacturables = q.facturables === "1";
  const [trips, templates] = await Promise.all([
    soloFacturables
      ? listTripsFacturables(c.env.DB, filtros).then((ts) =>
          viajesAFacturar(ts, { incluirFacturados: q.incluirFacturados === "1" }),
        )
      : listTrips(c.env.DB, filtros),
    listTemplates(c.env.DB),
  ]);
  // El remito, la boleta y el número de orden salen cada uno en su columna, no apelmazados
  // en una sola celda: así se ordena, se filtra y se suma por cualquiera de ellos.
  const campos = columnasDeCampos(trips, templates);
  const rows = trips.flatMap((t) => filasDeViaje(t, campos));
  return csvResponse(q.provider ? `viajes-${q.provider}.csv` : "viajes.csv", [encabezado(campos), ...rows]);
});

/**
 * GET /api/reports/cliente.csv?provider=…&from=…&to=… — el resumen para mandarle al cliente.
 *
 * Las mismas filas que /trips.csv con las columnas que le sirven al cliente: fecha, destino,
 * clientes de la carga y los datos propios de su viaje. Sin cobro, sin chofer ni camión, y
 * sin los cancelados. Las reglas viven en `resumenParaElCliente`, donde se pueden probar.
 *
 * El cliente es obligatorio: un "resumen para el cliente" de todos los clientes mezclados no
 * se le puede mandar a nadie.
 */
reports.get("/cliente.csv", async (c) => {
  const q = c.req.query();
  if (!q.provider) return fail(c, "Falta el cliente", 400);
  const [trips, templates] = await Promise.all([
    listTrips(c.env.DB, { from: q.from, to: q.to, provider: q.provider }),
    listTemplates(c.env.DB),
  ]);
  const campos = columnasDeCampos(trips, templates);
  return csvResponse(`resumen-${q.provider}.csv`, resumenParaElCliente(trips, campos));
});

// Cargas sin regla de facturación: el único trabajo manual que queda, y es una vez
// por combinación nueva, no por viaje.
reports.get("/pendientes-cobro", async (c) => {
  const trips = await listTrips(c.env.DB, {});
  const pendientes: PendienteCobro[] = trips.flatMap((t) =>
    t.segments
      .map((s, idx) => ({ ...s, idx, trip_id: t.id, fecha: t.started_at.slice(0, 10), cliente: t.provider_name }))
      .filter((s) => !s.cobro_tipo),
  );
  return ok(c, pendientes);
});

// Consumo por tramo (L/100km): se asigna a la surtida que CIERRA el tramo (la de llenado).
// Un tramo va de un llenado al siguiente; los litros = todo lo cargado en el medio + el llenado final.
function segmentConsumption(
  logs: { id: number; truck_id: number; odometer_km: number; liters: number; is_full: number; logged_at: string }[],
): Map<number, number> {
  const out = new Map<number, number>();
  const byTruck = new Map<number, typeof logs>();
  for (const l of logs) {
    const arr = byTruck.get(l.truck_id) ?? [];
    arr.push(l);
    byTruck.set(l.truck_id, arr);
  }
  for (const arr of byTruck.values()) {
    arr.sort((a, b) => (a.logged_at < b.logged_at ? -1 : a.logged_at > b.logged_at ? 1 : 0));
    let accum = 0;
    let prevFullOdo: number | null = null;
    for (const e of arr) {
      accum += e.liters;
      if (e.is_full) {
        if (prevFullOdo != null && e.odometer_km > prevFullOdo) {
          out.set(e.id, (accum / (e.odometer_km - prevFullOdo)) * 100);
        }
        prevFullOdo = e.odometer_km;
        accum = 0;
      }
    }
  }
  return out;
}

reports.get("/fuel.csv", async (c) => {
  const q = c.req.query();
  const fuel = await listFuelLogs(c.env.DB, { from: q.from, to: q.to, truckId: q.truck ? Number(q.truck) : undefined });
  const cons = segmentConsumption(fuel.map((f) => ({ ...f, is_full: f.is_full ? 1 : 0 })));
  const header = ["ID", "Camión", "Chofer", "Odómetro", "Litros", "Llenado completo", "Consumo L/100km", "Fecha"];
  const rows = fuel.map((f) => [
    f.id, f.truck_plate ?? "", f.driver_name ?? "", f.odometer_km, f.liters, f.is_full ? "Sí" : "No",
    cons.has(f.id) ? roundTo(cons.get(f.id)!) : "", f.logged_at,
  ]);
  return csvResponse("surtidas.csv", [header, ...rows]);
});

/**
 * GET /api/reports/cliente?provider=X&from=&to=&porDestino=1
 *
 * El resumen que la oficina usa para facturarle a un cliente. Las columnas salen de los
 * campos que ese cliente pide en sus plantillas, así que no hay una pantalla por cliente:
 * Casarone muestra remito y toneladas, TYCSUR el MIC, Cañuelas la hoja de ruta.
 */
reports.get("/cliente", async (c) => {
  const q = c.req.query();
  const provider = q.provider?.trim();
  if (!provider) return fail(c, "Elegí el cliente", 400);

  // Se leen con la marca de factura, no con listTrips a secas: es lo que permite que un
  // viaje ya facturado no vuelva a aparecer en el próximo corte. "Al mes que viene, yo ya sé
  // que todo lo que está con el número de factura, esos viajes quedan afuera."
  const [trips, templates] = await Promise.all([
    listTripsFacturables(c.env.DB, { provider, from: q.from, to: q.to }),
    listTemplates(c.env.DB),
  ]);

  return ok(c, {
    provider,
    desde: q.from ?? null,
    hasta: q.to ?? null,
    ...resumenCliente(trips, templates.filter((t) => t.provider_name === provider), {
      porDestino: q.porDestino === "1",
      incluirFacturados: q.incluirFacturados === "1",
    }),
  });
});

export default reports;
