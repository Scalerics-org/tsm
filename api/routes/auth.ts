import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { verifyPassword, signToken } from "../lib/crypto";
import { findUserByEmail } from "../repos/users";
import { findDriverByPlate } from "../repos/drivers";
import { requireAuth } from "../middleware/auth";
import { ROLES, type AuthUser } from "../../shared/domain";

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

// Login de oficina (encargado / admin) por email + contraseña.
auth.post("/login", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!b.email || !b.password) return fail(c, "Email y contraseña son obligatorios", 400);

  const user = await findUserByEmail(c.env.DB, b.email);
  if (!user || !(await verifyPassword(b.password, user.password_hash))) {
    return fail(c, "Credenciales inválidas", 401);
  }
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

  const driver = await findDriverByPlate(c.env.DB, b.plate);
  if (!driver || !driver.pin_hash || !(await verifyPassword(b.pin, driver.pin_hash))) {
    return fail(c, "Patente o PIN incorrectos", 401);
  }
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
