import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { verifyPassword, signToken } from "../lib/crypto";
import { findUserByEmail } from "../repos/users";
import { findDriverByPlate } from "../repos/drivers";
import { requireAuth } from "../middleware/auth";
import { ROLES, type AuthUser } from "../../shared/domain";
import {
  MAX_FALLOS_CUENTA,
  MAX_FALLOS_IP,
  claveEmail,
  claveIp,
  clavePatente,
  mensajeDeBloqueo,
} from "../lib/intentos-login";
import { anotarFallo, minutosBloqueado, olvidarFallos } from "../repos/intentos-login";

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Las claves que cuentan un intento: la cuenta (patente o email) y, si Cloudflare la manda, la
 * IP. Ver `api/lib/intentos-login.ts` para el porqué de cada una.
 */
function clavesDelIntento(c: any, cuenta: string): [string, number][] {
  const ip = c.req.header("CF-Connecting-IP");
  return [[cuenta, MAX_FALLOS_CUENTA], ...(ip ? [[claveIp(ip), MAX_FALLOS_IP] as [string, number]] : [])];
}

// Login de oficina (encargado / admin) por email + contraseña.
auth.post("/login", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!b.email || !b.password) return fail(c, "Email y contraseña son obligatorios", 400);

  const claves = clavesDelIntento(c, claveEmail(b.email));
  const ahora = new Date();
  const espera = await minutosBloqueado(c.env.DB, claves, ahora);
  if (espera) return fail(c, mensajeDeBloqueo(espera), 429);

  const user = await findUserByEmail(c.env.DB, b.email);
  if (!user || !(await verifyPassword(b.password, user.password_hash))) {
    await anotarFallo(c.env.DB, claves, ahora);
    return fail(c, "Credenciales inválidas", 401);
  }
  await olvidarFallos(c.env.DB, claves[0][0]);
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    driver_id: null,
    truck_id: null,
  };
  return ok(c, { token: await signToken(authUser, c.env.JWT_SECRET), user: authUser });
});

// Login del chofer por patente + PIN.
auth.post("/driver-login", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { plate?: string; pin?: string };
  if (!b.plate || !b.pin) return fail(c, "Patente y PIN son obligatorios", 400);

  // Se frena ANTES de verificar el PIN: mientras dura el bloqueo, ni el PIN correcto entra —
  // si entrara, el bloqueo le diría al atacante justo cuál es.
  const claves = clavesDelIntento(c, clavePatente(b.plate));
  const ahora = new Date();
  const espera = await minutosBloqueado(c.env.DB, claves, ahora);
  if (espera) return fail(c, mensajeDeBloqueo(espera), 429);

  const driver = await findDriverByPlate(c.env.DB, b.plate);
  if (!driver || !driver.pin_hash || !(await verifyPassword(b.pin, driver.pin_hash))) {
    await anotarFallo(c.env.DB, claves, ahora);
    return fail(c, "Patente o PIN incorrectos", 401);
  }
  await olvidarFallos(c.env.DB, claves[0][0]);
  const authUser: AuthUser = {
    id: driver.id,
    name: driver.name,
    role: ROLES.CHOFER,
    driver_id: driver.id,
    truck_id: driver.default_truck_id,
    email: null,
  };
  return ok(c, { token: await signToken(authUser, c.env.JWT_SECRET), user: authUser });
});

auth.get("/me", requireAuth, (c) => ok(c, c.get("user")));

export default auth;
