import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRUCK_STATUS, type TruckStatus } from "../../shared/domain";
import * as repo from "../repos/trucks";
import { motivoParaNoBorrarCamion } from "../lib/frenos-de-borrado";
import { CLASE_VEHICULO, esClaseDeVehiculo } from "../../shared/clase-vehiculo";
import { CAMPOS_NUEVOS_DEL_CAMION, ETIQUETAS_CAMION, parseVencimientos } from "../../shared/vencimientos";

const trucks = new Hono<{ Bindings: Env; Variables: Vars }>();
trucks.use("*", requireAuth);

// El lector la ve entera: sirve para el filtro por camión de Viajes y para la pantalla de Camiones,
// que mira en solo lectura (odómetro, rendimiento y vencimientos incluidos, por pedido del 7/10).
trucks.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN, ROLES.LECTOR), async (c) =>
  ok(c, await repo.listTrucks(c.env.DB)),
);

// Lista mínima (id + patente) para que el chofer elija con qué camión viaja. SÓLO camiones: un
// remolque en esta lista le aparecía al chofer para elegir al salir de viaje.
trucks.get("/options", async (c) =>
  ok(c, (await repo.listCamiones(c.env.DB)).map((t) => ({ id: t.id, plate: t.plate }))),
);

const STATUSES: TruckStatus[] = [
  TRUCK_STATUS.DISPONIBLE,
  TRUCK_STATUS.EN_VIAJE,
  TRUCK_STATUS.MANTENIMIENTO,
];

/**
 * Lo que manda el formulario. `null` = falta la patente; `{ error }` = la clase no es una de las tres.
 * Sin `clase` en el pedido no se inventa una: el alta usa 'camion' y la edición deja la que tenía.
 */
function parseTruck(b: any): repo.TruckInput | { error: string } | null {
  if (!b || !b.plate) return null;
  if (b.clase != null && !esClaseDeVehiculo(b.clase)) {
    return { error: "La clase tiene que ser camión, remolque o montacargas" };
  }
  return {
    ...(b.clase != null ? { clase: b.clase } : {}),
    plate: String(b.plate).toUpperCase().trim(),
    brand: String(b.brand ?? ""),
    model: String(b.model ?? ""),
    year: Number(b.year ?? 0),
    type: String(b.type ?? ""),
    capacity_kg: Number(b.capacity_kg ?? 0),
    odometer_km: Number(b.odometer_km ?? 0),
    avg_km_litro: Number(b.avg_km_litro ?? 0),
    status: STATUSES.includes(b.status) ? b.status : TRUCK_STATUS.DISPONIBLE,
    // Si lleva cámara de frío: habilita la surtida de la cámara en el celular del chofer.
    camara_frio: !!b.camara_frio,
  };
}

trucks.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const b = await c.req.json().catch(() => null);
  const input = parseTruck(b);
  if (!input) return fail(c, "La patente es obligatoria", 400);
  if ("error" in input) return fail(c, input.error, 400);
  // Los vencimientos se validan ANTES de escribir nada: una fecha mal escrita no crea el camión.
  const venc = parseVencimientos(b, CAMPOS_NUEVOS_DEL_CAMION, ETIQUETAS_CAMION);
  if ("error" in venc) return fail(c, venc.error, 400);
  const id = await repo.createTruck(c.env.DB, input);
  await repo.setVencimientosCamion(c.env.DB, id, venc.values);
  return ok(c, await repo.getTruck(c.env.DB, id), 201);
});

trucks.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => null);
  const input = parseTruck(b);
  if (!input) return fail(c, "La patente es obligatoria", 400);
  if ("error" in input) return fail(c, input.error, 400);
  const venc = parseVencimientos(b, CAMPOS_NUEVOS_DEL_CAMION, ETIQUETAS_CAMION);
  if ("error" in venc) return fail(c, venc.error, 400);
  // Un camión con chofer asignado no pasa a remolque: el chofer se quedaría con un vehículo que no
  // puede manejar y sin forma de salir de viaje.
  if (input.clase && input.clase !== CLASE_VEHICULO.CAMION && (await repo.loAtadoAlCamion(c.env.DB, id)).choferes > 0) {
    return fail(c, "Tiene un chofer asignado: sacale el camión al chofer antes de cambiarle la clase.", 409);
  }
  await repo.updateTruck(c.env.DB, id, input);
  // Sólo los que vinieron: ver `setVencimientosCamion`.
  await repo.setVencimientosCamion(c.env.DB, id, venc.values);
  return ok(c, await repo.getTruck(c.env.DB, id));
});

// GET /api/trucks/:id/plantillas — los viajes que ve este camión. [] = ve lo de siempre.
trucks.get("/:id/plantillas", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.plantillasDelCamion(c.env.DB, Number(c.req.param("id")))),
);

// PUT /api/trucks/:id/plantillas { template_ids } — "el 4383 hace solo eso" (Rodrigo, 16/9).
trucks.put("/:id/plantillas", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await repo.getTruck(c.env.DB, id))) return fail(c, "Camión no encontrado", 404);
  const b = (await c.req.json().catch(() => null)) as { template_ids?: unknown } | null;
  if (!b || !Array.isArray(b.template_ids)) return fail(c, "Faltan los viajes", 400);
  const ids = [...new Set(b.template_ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length !== b.template_ids.length) return fail(c, "La lista de viajes vino mal armada", 400);
  // Un id que no existe haría fallar el guardado entero por la clave foránea, con un error 500.
  if (ids.length) {
    const { results } = await c.env.DB
      .prepare(`SELECT id FROM trip_templates WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: number }>();
    if ((results ?? []).length !== ids.length) return fail(c, "Hay un viaje que ya no existe: recargá la página", 400);
  }
  await repo.guardarPlantillasDelCamion(c.env.DB, id, ids);
  return ok(c, ids);
});

trucks.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const motivo = motivoParaNoBorrarCamion(await repo.loAtadoAlCamion(c.env.DB, id));
  if (motivo) return fail(c, motivo, 409);
  await repo.deleteTruck(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default trucks;
