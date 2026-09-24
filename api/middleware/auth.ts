import type { MiddlewareHandler } from "hono";
import type { Env, Vars } from "../env";
import { DRIVER_STATUS, ROLES, type Role } from "../../shared/domain";
import { verifyToken } from "../lib/crypto";
import { sesionDelChofer } from "../repos/drivers";
import { usuarioDeOficina } from "../repos/users";
import { fail } from "../lib/response";
import { lectorPuede } from "../lib/permisos-lector";

type Ctx = { Bindings: Env; Variables: Vars };

/** Exige un token válido y cuelga el usuario en el contexto. */
export const requireAuth: MiddlewareHandler<Ctx> = async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(c, "No autenticado", 401);
  const user = await verifyToken(token, c.env.JWT_SECRET);
  if (!user) return fail(c, "Token inválido o expirado", 401);

  // El chofer se relee de `drivers` en cada pedido —un SELECT, y sólo para choferes— por dos
  // motivos. El camión, porque vive ahí y no en el token: si la oficina lo reasigna, el token
  // viejo seguiría diciendo el anterior durante una semana. Y el estado, porque si no, darlo
  // de baja no le cortaba nada: el token dura 7 días y seguía usando la app todo ese tiempo,
  // sólo que sin camión. Lo mismo el chofer borrado, que ya no tiene fila.
  if (user.role === ROLES.CHOFER && user.driver_id != null) {
    const chofer = await sesionDelChofer(c.env.DB, user.driver_id);
    if (!chofer || chofer.status !== DRIVER_STATUS.ACTIVO) {
      return fail(c, "Tu usuario está dado de baja. Hablá con la oficina.", 401);
    }
    c.set("user", { ...user, truck_id: chofer.default_truck_id });
  } else {
    // Y la oficina igual: borrar a alguien que se fue de la empresa le cortaba el acceso recién
    // cuando venciera su token, hasta una semana después, con permiso para leer y cambiar todo.
    // El rol también se relee acá y no sale del token: bajarle el rol a alguien —a lector, sobre
    // todo— tiene que cortarle la escritura ya, no hasta que el token de una semana venza.
    const fila = await usuarioDeOficina(c.env.DB, user.id);
    if (!fila) {
      return fail(c, "Tu usuario ya no existe. Hablá con la oficina.", 401);
    }
    c.set("user", { ...user, role: fila.role });
  }

  /**
   * El "solo mirar" se frena acá, en el único lugar por el que pasan todas las rutas.
   *
   * No alcanza con `requireRole` ruta por ruta: varias no lo llevan —`POST /api/trips`,
   * `POST /api/trips/:id/cancel`, `DELETE /api/photos/:id`— porque se apoyan en la diferencia
   * chofer/oficina, y un lector cae del lado de la oficina, que es el lado que borra. Acá es
   * al revés: lo que no está en la lista blanca no existe para él.
   */
  if (c.get("user").role === ROLES.LECTOR && !lectorPuede(c.req.method, c.req.path)) {
    return fail(c, "Tu usuario es de solo mirar", 403);
  }
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
