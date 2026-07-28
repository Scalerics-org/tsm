import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRIP_STATUS, fuelSummary, monthlyConsumption, type Trip } from "../../shared/domain";
import { listTrips } from "../repos/trips";
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
      tons: roundTo(tTrips.reduce((s, x) => s + (x.weight_tons ?? 0), 0)),
      km: Math.round(fs.km),
      liters: Math.round(fs.liters),
      consumption_l100: fs.consumption_l100 != null ? roundTo(fs.consumption_l100) : null,
    };
  });

  // Por cliente (proveedor)
  const provMap = new Map<string, { trips: number; completed: number; tons: number }>();
  for (const t of trips) {
    const p = provMap.get(t.provider_name) ?? { trips: 0, completed: 0, tons: 0 };
    p.trips += 1;
    if (t.status === TRIP_STATUS.COMPLETADO) p.completed += 1;
    p.tons += t.weight_tons ?? 0;
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
          l100: m.l100 != null ? roundTo(m.l100) : null,
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

  const ANOMALY = 1.15; // 15% por encima del rendimiento esperado
  const fuelAnomalies = trucks
    .map((t) => {
      const months = monthlyConsumption(
        allFuel
          .filter((f) => f.truck_id === t.id)
          .map((f) => ({ odometer_km: f.odometer_km, liters: f.liters, is_full: !!f.is_full, logged_at: f.logged_at })),
      );
      const lastClosed = months.find((m) => m.closed && m.l100 != null);
      if (!lastClosed || lastClosed.l100 == null || t.avg_consumption_l100 <= 0) return null;
      const over = lastClosed.l100 > t.avg_consumption_l100 * ANOMALY;
      return over
        ? {
            truck_id: t.id,
            plate: t.plate,
            month: lastClosed.month,
            expected: t.avg_consumption_l100,
            actual: roundTo(lastClosed.l100),
            pct: Math.round((lastClosed.l100 / t.avg_consumption_l100 - 1) * 100),
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
    l100: m.l100 != null ? roundTo(m.l100) : null,
    closed: m.closed,
  }));
  return ok(c, {
    truck,
    trips: trips.slice(0, 20),
    monthly,
    fuel: fuel.slice(0, 20),
    tons: roundTo(trips.reduce((s, t) => s + (t.weight_tons ?? 0), 0)),
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
      tons: roundTo(trips.reduce((s, t) => s + (t.weight_tons ?? 0), 0)),
      withPhoto,
      withoutPhoto,
    },
  });
});

// ── Exports CSV ──
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
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
function flattenFields(t: Trip): string {
  return Object.entries(t.field_values ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

reports.get("/trips.csv", async (c) => {
  const q = c.req.query();
  const trips = await listTrips(c.env.DB, { from: q.from, to: q.to, provider: q.provider || undefined });
  const header = [
    "ID", "Proveedor", "Origen", "Destino", "Destinatario", "Chofer", "Camión", "Carga",
    "Toneladas", "Campos", "Estado", "Inicio", "Fin", "Observaciones",
  ];
  const rows = trips.map((t) => [
    t.id, t.provider_name, t.origin, t.destination, t.destinatario ?? "", t.driver_name ?? "", t.truck_plate ?? "",
    t.cargo_type, t.weight_tons ?? "", flattenFields(t), t.status, t.started_at, t.finished_at ?? "", t.notes ?? "",
  ]);
  return csvResponse(q.provider ? `viajes-${q.provider}.csv` : "viajes.csv", [header, ...rows]);
});

reports.get("/fuel.csv", async (c) => {
  const q = c.req.query();
  const fuel = await listFuelLogs(c.env.DB, { from: q.from, to: q.to, truckId: q.truck ? Number(q.truck) : undefined });
  const header = ["ID", "Camión", "Chofer", "Odómetro", "Litros", "Llenado completo", "Fecha"];
  const rows = fuel.map((f) => [
    f.id, f.truck_plate ?? "", f.driver_name ?? "", f.odometer_km, f.liters, f.is_full ? "Sí" : "No", f.logged_at,
  ]);
  return csvResponse("surtidas.csv", [header, ...rows]);
});

export default reports;
