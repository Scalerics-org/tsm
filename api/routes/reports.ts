import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRIP_STATUS, estimateFuelLiters } from "../../shared/domain";

const reports = new Hono<{ Bindings: Env; Variables: Vars }>();
reports.use("*", requireAuth, requireRole(ROLES.ENCARGADO, ROLES.ADMIN));

// GET /api/reports/summary — métricas para el panel del encargado
reports.get("/summary", async (c) => {
  const db = c.env.DB;

  const statusRows = await db
    .prepare("SELECT status, COUNT(*) AS n FROM trips GROUP BY status")
    .all<{ status: string; n: number }>();
  const byStatus: Record<string, number> = {};
  for (const r of statusRows.results ?? []) byStatus[r.status] = r.n;

  // km por camión + estimado de combustible (km * L/100 / 100)
  const truckRows = await db
    .prepare(
      `SELECT tr.id, tr.plate, tr.avg_consumption_l100 AS cons,
              COALESCE(SUM(t.distance_km), 0) AS km
       FROM trucks tr
       LEFT JOIN trips t ON t.truck_id = tr.id AND t.status = 'COMPLETADO'
       GROUP BY tr.id ORDER BY km DESC`,
    )
    .all<{ id: number; plate: string; cons: number; km: number }>();
  const byTruck = (truckRows.results ?? []).map((r) => ({
    truck_id: r.id,
    plate: r.plate,
    km: Math.round(r.km * 10) / 10,
    estimated_liters: Math.round(estimateFuelLiters(r.km, r.cons) * 10) / 10,
  }));

  // km por chofer
  const driverRows = await db
    .prepare(
      `SELECT d.id, d.name, COALESCE(SUM(t.distance_km), 0) AS km,
              COUNT(CASE WHEN t.status='COMPLETADO' THEN 1 END) AS viajes
       FROM drivers d
       LEFT JOIN trips t ON t.driver_id = d.id
       GROUP BY d.id ORDER BY km DESC`,
    )
    .all<{ id: number; name: string; km: number; viajes: number }>();
  const byDriver = (driverRows.results ?? []).map((r) => ({
    driver_id: r.id,
    name: r.name,
    km: Math.round(r.km * 10) / 10,
    trips: r.viajes,
  }));

  // Viajes atrasados: EN_RUTA sin llegada cuya fecha programada ya pasó,
  // o PENDIENTE cuya fecha programada ya pasó.
  const nowIso = new Date().toISOString().replace("T", " ").slice(0, 19);
  const delayed = await db
    .prepare(
      `SELECT t.id, t.origin, t.destination, t.scheduled_at, t.status, d.name AS driver_name
       FROM trips t JOIN drivers d ON d.id = t.driver_id
       WHERE t.status IN ('PENDIENTE','EN_RUTA') AND t.scheduled_at < ?
       ORDER BY t.scheduled_at ASC`,
    )
    .bind(nowIso)
    .all();

  return ok(c, {
    byStatus: {
      pendiente: byStatus[TRIP_STATUS.PENDIENTE] ?? 0,
      en_ruta: byStatus[TRIP_STATUS.EN_RUTA] ?? 0,
      completado: byStatus[TRIP_STATUS.COMPLETADO] ?? 0,
      cancelado: byStatus[TRIP_STATUS.CANCELADO] ?? 0,
      con_incidencia: byStatus[TRIP_STATUS.CON_INCIDENCIA] ?? 0,
    },
    byTruck,
    byDriver,
    delayed: delayed.results ?? [],
  });
});

export default reports;
