import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRIP_STATUS, fuelSummary, type Trip } from "../../shared/domain";
import { listTrips } from "../repos/trips";
import { listFuelLogs } from "../repos/fuel";
import { listTrucks } from "../repos/trucks";

const reports = new Hono<{ Bindings: Env; Variables: Vars }>();
reports.use("*", requireAuth, requireRole(ROLES.ENCARGADO, ROLES.ADMIN));

// GET /api/reports/summary?from&to — resumen general + por camión
reports.get("/summary", async (c) => {
  const q = c.req.query();
  const range = { from: q.from, to: q.to };
  const [trucks, trips, fuel] = await Promise.all([
    listTrucks(c.env.DB),
    listTrips(c.env.DB, { from: range.from, to: range.to }),
    listFuelLogs(c.env.DB, { from: range.from, to: range.to }),
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
      tons: Math.round((tTrips.reduce((s, x) => s + (x.kilos ?? 0), 0) / 1000) * 10) / 10,
      km: Math.round(fs.km),
      liters: Math.round(fs.liters),
      consumption_l100: fs.consumption_l100 != null ? Math.round(fs.consumption_l100 * 10) / 10 : null,
    };
  });

  return ok(c, {
    totals: {
      trips: trips.length,
      en_curso: trips.filter((x) => x.status === TRIP_STATUS.EN_CURSO).length,
      completados: trips.filter((x) => x.status === TRIP_STATUS.COMPLETADO).length,
      surtidas: fuel.length,
    },
    byTruck,
  });
});

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvResponse(c: any, filename: string, rows: (string | number | null)[][]): Response {
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// GET /api/reports/trips.csv — export de viajes
reports.get("/trips.csv", async (c) => {
  const q = c.req.query();
  const trips = await listTrips(c.env.DB, { from: q.from, to: q.to });
  const header = [
    "ID", "Proveedor", "Origen", "Destino", "Chofer", "Camión", "Carga",
    "Kilos", "Campo extra", "Valor", "Estado", "Inicio", "Fin",
  ];
  const rows = trips.map((t: Trip) => [
    t.id, t.provider_name, t.origin, t.destination, t.driver_name ?? "", t.truck_plate ?? "",
    t.cargo_type, t.kilos ?? "", t.extra_label ?? "", t.extra_value ?? "", t.status, t.started_at, t.finished_at ?? "",
  ]);
  return csvResponse(c, "viajes.csv", [header, ...rows]);
});

// GET /api/reports/fuel.csv — export de surtidas
reports.get("/fuel.csv", async (c) => {
  const q = c.req.query();
  const fuel = await listFuelLogs(c.env.DB, { from: q.from, to: q.to, truckId: q.truck ? Number(q.truck) : undefined });
  const header = ["ID", "Camión", "Chofer", "Odómetro", "Litros", "Llenado completo", "Fecha"];
  const rows = fuel.map((f) => [
    f.id, f.truck_plate ?? "", f.driver_name ?? "", f.odometer_km, f.liters, f.is_full ? "Sí" : "No", f.logged_at,
  ]);
  return csvResponse(c, "surtidas.csv", [header, ...rows]);
});

export default reports;
