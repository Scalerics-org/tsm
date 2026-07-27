import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { verifyPassword, signToken } from "../lib/crypto";
import { findUserByEmail } from "../repos/users";
import { requireAuth } from "../middleware/auth";
import type { AuthUser } from "../../shared/domain";

const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) return fail(c, "Email y contraseña son obligatorios", 400);

  const user = await findUserByEmail(c.env.DB, body.email);
  if (!user) return fail(c, "Credenciales inválidas", 401);

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return fail(c, "Credenciales inválidas", 401);

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    driver_id: user.driver_id,
  };
  const token = await signToken(authUser, c.env.JWT_SECRET);
  return ok(c, { token, user: authUser });
});

auth.get("/me", requireAuth, (c) => ok(c, c.get("user")));

export default auth;
