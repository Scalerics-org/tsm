import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  ROLES,
  TRIP_STATUS,
  fuelSummary,
  monthlyConsumption,
  type PendienteCobro,
  type Trip,
} from "../../shared/domain";
import { listTrips, listTripsFacturables } from "../repos/trips";
import { columnasDeCampos, encabezado, filasDeViaje } from "../lib/export-viajes";
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
  const [trucks, trips, fuel, allFuel] = await Promise.all([
    listTrucks(c.env.DB),
    listTrips(c.env.DB, { from: range.from, to: range.to }),
    listFuelLogs(c.env.DB, { from: range.from, to: range.to }),
    listFuelLogs(c.env.DB, {}),
  ]);

  const byTruck = trucks.map((t) => {
    const tTrips = trips.filter((x) => x.truck_id === t.id);
    const tFuel = fuel.filter((x) => x.truck_id === t.id);
    const fs = fuelSummary(tFuel.map((f) => ({ odometer_km: f.odometer_km, liters: f.liters })));
    return {
      truck_id: t.id,
      plate: t.plate,
      trips: tTrips.length,
      completed: tTrips.filter((x) => x.status === TRIP_STATUS.COMPLETADO).length,
      tons: roundTo(tTrips.reduce((s, x) => s + (x.kilos_carga ?? 0), 0)),
      km: Math.round(fs.km),
      liters: Math.round(fs.liters),
      consumption_kml: fs.consumption_kml != null ? roundTo(fs.consumption_kml, 2) : null,
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

  const missingPhotos = photoStatus
    .map((p) => {
      const needCarga = p.has_carga === 0;
      const needDescarga = p.arrival_photo_label != null && p.has_descarga === 0;
      let missing = "";
      if (needCarga && needDescarga) missing = "carga y descarga";
      else if (needCarga) missing = "carga";
      else if (needDescarga) missing = p.arrival_photo_label ?? "descarga";
      return { ...p, missing, flagged: needCarga || needDescarga };
    })
    .filter((p) => p.flagged)
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
  return ok(c, {
    truck,
    trips: trips.slice(0, 20),
    monthly,
    fuel: fuel.slice(0, 20),
    tons: roundTo(trips.reduce((s, t) => s + (t.kilos_carga ?? 0), 0)),
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
  const withoutPhoto = photoStatus.length - withPhoto;
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
function csvCell(v: unknown): string {
  // Un número sale con coma decimal. El separador de columnas ya es `;` porque el Excel de
  // acá está en español, y en ese mismo Excel "28.07" con punto entra como texto (o peor,
  // como fecha): la columna no se puede sumar ni ordenar. Con coma entra como número.
  const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvResponse(filename: string, rows: (string | number | null)[][]): Response {
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
// Una fila por carga: es la unidad facturable. Los viajes de un solo tramo
// exportan una fila, igual que antes.
reports.get("/trips.csv", async (c) => {
  const q = c.req.query();
  // La pantalla ya mandaba chofer, camión y estado —es el mismo `query` con el que pide la
  // lista—, pero acá se leían sólo las fechas: el Excel bajaba TODO y no lo que se estaba
  // mirando. Los nombres de los parámetros son los mismos que en GET /api/trips.
  const [trips, templates] = await Promise.all([
    listTrips(c.env.DB, {
      from: q.from,
      to: q.to,
      provider: q.provider || undefined,
      driverId: q.driver ? Number(q.driver) : undefined,
      truckId: q.truck ? Number(q.truck) : undefined,
      status: (q.status as Trip["status"]) || undefined,
    }),
    listTemplates(c.env.DB),
  ]);
  // El remito, la boleta y el número de orden salen cada uno en su columna, no apelmazados
  // en una sola celda: así se ordena, se filtra y se suma por cualquiera de ellos.
  const campos = columnasDeCampos(trips, templates);
  const rows = trips.flatMap((t) => filasDeViaje(t, campos));
  return csvResponse(q.provider ? `viajes-${q.provider}.csv` : "viajes.csv", [encabezado(campos), ...rows]);
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
