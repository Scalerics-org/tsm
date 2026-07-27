import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, type Role } from "../../shared/domain";
import { hashPassword } from "../lib/crypto";
import * as repo from "../repos/users";

const users = new Hono<{ Bindings: Env; Variables: Vars }>();
users.use("*", requireAuth, requireRole(ROLES.ADMIN));

users.get("/", async (c) => ok(c, await repo.listUsers(c.env.DB)));

// Sólo usuarios de oficina; los choferes se crean como "choferes" con PIN.
const VALID_ROLES: Role[] = [ROLES.ENCARGADO, ROLES.ADMIN];

users.post("/", async (c) => {
  const b = await c.req.json<any>().catch(() => null);
  if (!b || !b.email || !b.password || !b.name) {
    return fail(c, "Email, nombre y contraseña son obligatorios", 400);
  }
  if (!VALID_ROLES.includes(b.role)) return fail(c, "Rol inválido (encargado o admin)", 400);
  if (String(b.password).length < 6) return fail(c, "La contraseña debe tener al menos 6 caracteres", 400);

  const existing = await repo.findUserByEmail(c.env.DB, b.email);
  if (existing) return fail(c, "Ya existe un usuario con ese email", 409);

  const id = await repo.createUser(c.env.DB, {
    email: b.email,
    name: b.name,
    role: b.role,
    password_hash: await hashPassword(String(b.password)),
  });
  return ok(c, { id }, 201);
});

users.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("user").id) return fail(c, "No podés eliminar tu propio usuario", 400);
  await repo.deleteUser(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default users;
