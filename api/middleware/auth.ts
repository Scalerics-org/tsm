import type { MiddlewareHandler } from "hono";
import type { Env, Vars } from "../env";
import { ROLES, type Role } from "../../shared/domain";
import { verifyToken } from "../lib/crypto";
import { currentTruckId } from "../repos/drivers";
import { fail } from "../lib/response";

type Ctx = { Bindings: Env; Variables: Vars };

/** Exige un token válido y cuelga el usuario en el contexto. */
export const requireAuth: MiddlewareHandler<Ctx> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(c, "No autenticado", 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return fail(c, "Token inválido o expirado", 401);
  // El camión del chofer vive en `drivers`, no en el token: si la oficina lo reasigna, el
  // token viejo seguiría diciendo el anterior durante una semana. Se relee en cada pedido —
  // un SELECT, y sólo para choferes. Copia nueva, sin tocar lo que vino firmado.
  c.set(
    "user",
    user.role === ROLES.CHOFER && user.driver_id != null
      ? { ...user, truck_id: await currentTruckId(c.env.DB, user.driver_id) }
      : user,
  );
  await next();
};

/** Exige que el usuario tenga uno de los roles indicados. Usar después de requireAuth. */
export function requireRole(...roles: Role[]): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      return fail(c, "No tenés permisos para esta acción", 403);
    }
    await next();
  };
}
