import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import type { Departamento } from "../../shared/domain";

const departamentos = new Hono<{ Bindings: Env; Variables: Vars }>();
departamentos.use("*", requireAuth);

/**
 * Los 19, para elegir ciudad de carga y destino en el viaje ocasional.
 *
 * No salen de la libreta a propósito: ahí el tipo "lugar" son los orígenes de los
 * internacionales (Arg. Rosario, Concordia…), que no tienen nada que ver con un
 * viaje dentro del país.
 */
departamentos.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nombre FROM departamentos ORDER BY nombre",
  ).all<Departamento>();
  return ok(c, results ?? []);
});

export default departamentos;
