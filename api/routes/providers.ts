import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../../shared/domain";
import { motivoParaNoBorrar } from "../lib/proveedores";
import * as repo from "../repos/providers";

const providers = new Hono<{ Bindings: Env; Variables: Vars }>();
providers.use("*", requireAuth);

providers.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listProviders(c.env.DB)),
);

/**
 * La lista que usa la pantalla de Proveedores: cada uno con lo que tiene colgando.
 *
 * Va aparte de `GET /` porque esa la piden todos los desplegables de la app y no necesitan
 * las dos subconsultas por fila.
 */
providers.get("/uso", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listProvidersConUso(c.env.DB)),
);

providers.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = String(b.name ?? "").trim();
  if (!name) return fail(c, "El nombre es obligatorio", 400);

  // Dos proveedores con el mismo nombre parten los viajes en dos y el resumen para facturar
  // muestra la mitad en cada uno. Es exactamente lo que pasó con "Viaje VACIO" y "Viaje
  // vacío", que convivieron meses porque nadie tenía dónde verlos juntos.
  const yaEsta = (await repo.listProviders(c.env.DB)).find(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (yaEsta) return fail(c, `"${yaEsta.name}" ya está en la lista.`, 409);

  const id = await repo.createProvider(c.env.DB, name);
  return ok(c, { id }, 201);
});

providers.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = String(b.name ?? "").trim();
  if (!name) return fail(c, "El nombre es obligatorio", 400);
  if (!(await repo.getProvider(c.env.DB, id))) return fail(c, "Ese proveedor no existe", 404);

  const choque = (await repo.listProviders(c.env.DB)).find(
    (p) => p.id !== id && p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (choque) return fail(c, `"${choque.name}" ya está en la lista.`, 409);

  // El repo arrastra `trips.provider_name`: si no, los viajes viejos se quedan con el nombre
  // anterior y salen del resumen con el que se factura.
  await repo.updateProvider(c.env.DB, id, name);
  return ok(c, { updated: true });
});

/**
 * DELETE /api/providers/:id — sólo si no tiene nada colgando.
 *
 * `trip_templates.provider_id` y `libreta.provider_id` son ON DELETE CASCADE. Sin este freno,
 * borrar "Casarone" se llevaba puesta su plantilla —y con ella la posibilidad de que el
 * chofer saliera a hacer ese viaje— sin preguntar y sin vuelta atrás. El backend estuvo así
 * desde el primer día; no se notó porque nunca hubo pantalla que lo llamara.
 */
providers.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const prov = await repo.getProvider(c.env.DB, id);
  if (!prov) return fail(c, "Ese proveedor no existe", 404);

  const motivo = motivoParaNoBorrar(await repo.loAtadoAlProveedor(c.env.DB, id, prov.name));
  if (motivo) return fail(c, motivo, 409);

  await repo.deleteProvider(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default providers;
