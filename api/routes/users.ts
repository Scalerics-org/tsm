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

/**
 * Editar un usuario: nombre, rol y —si viene— la contraseña.
 *
 * Sin esto, cambiarle la clave a alguien obligaba a borrarlo y crearlo de nuevo. Es lo que
 * pasó al dar de alta a Rodrigo en la reunión: quedó con una contraseña provisoria y no
 * hubo forma de cambiársela.
 */
users.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<any>().catch(() => null);
  if (!b) return fail(c, "Faltan datos", 400);
  if (b.role != null && !VALID_ROLES.includes(b.role)) {
    return fail(c, "Rol inválido (encargado o admin)", 400);
  }
  if (b.password != null && String(b.password).length < 6) {
    return fail(c, "La contraseña debe tener al menos 6 caracteres", 400);
  }
  // El email identifica al usuario: si se repite, quedan dos que entran igual y uno pisa
  // al otro sin aviso.
  if (b.email) {
    const otro = await repo.findUserByEmail(c.env.DB, b.email);
    if (otro && otro.id !== id) return fail(c, "Ya existe un usuario con ese email", 409);
  }
  // Nadie se saca a sí mismo el admin: dejaría el sistema sin quien administre.
  if (id === c.get("user").id && b.role === ROLES.ENCARGADO) {
    return fail(c, "No podés quitarte a vos mismo el rol de administrador", 400);
  }

  await repo.updateUser(c.env.DB, id, {
    email: b.email,
    name: b.name,
    role: b.role,
    password_hash: b.password ? await hashPassword(String(b.password)) : undefined,
  });
  return ok(c, { updated: true });
});

users.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("user").id) return fail(c, "No podés eliminar tu propio usuario", 400);
  await repo.deleteUser(c.env.DB, id);
  return ok(c, { deleted: true });
});

export default users;
