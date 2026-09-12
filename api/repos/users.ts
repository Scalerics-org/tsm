import type { AuthUser, Role } from "../../shared/domain";

export interface UserRow extends AuthUser {
  password_hash: string;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare(
      "SELECT id, email, name, role, driver_id, NULL AS truck_id, password_hash FROM users WHERE email = ?",
    )
    .bind(email.toLowerCase().trim())
    .first<UserRow>();
  return row ?? null;
}

/**
 * ¿El usuario de oficina sigue existiendo?
 *
 * Se pregunta en cada pedido por lo mismo que el chofer: el token dura una semana, así que
 * borrar al encargado que se fue de la empresa no le cortaba nada —seguía leyendo y cambiando
 * todo desde su teléfono— hasta que venciera.
 *
 * Sólo la existencia, no el rol: el rol sigue saliendo del token hasta que vuelva a entrar.
 * Cambiarlo acá haría que un permiso dependa de dos fuentes a la vez, y lo que resuelve el
 * agujero es la baja, que es lo que la oficina realmente hace.
 */
export async function existeUsuario(db: D1Database, id: number): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first<{ id: number }>();
  return row != null;
}

export async function listUsers(db: D1Database): Promise<AuthUser[]> {
  const { results } = await db
    .prepare("SELECT id, email, name, role, driver_id, NULL AS truck_id FROM users ORDER BY id")
    .all<AuthUser>();
  return results ?? [];
}

export interface NewUser {
  email: string;
  name: string;
  role: Role;
  password_hash: string;
}

export async function createUser(db: D1Database, u: NewUser): Promise<number> {
  const res = await db
    .prepare("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)")
    .bind(u.email.toLowerCase().trim(), u.name, u.role, u.password_hash)
    .run();
  return res.meta.last_row_id as number;
}

export interface UserPatch {
  email?: string;
  name?: string;
  role?: Role;
  /** Sólo si se está cambiando la clave: sin esto, la anterior queda. */
  password_hash?: string;
}

export async function updateUser(db: D1Database, id: number, p: UserPatch): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (p.email != null) {
    sets.push("email = ?");
    binds.push(p.email.toLowerCase().trim());
  }
  if (p.name != null) {
    sets.push("name = ?");
    binds.push(p.name);
  }
  if (p.role != null) {
    sets.push("role = ?");
    binds.push(p.role);
  }
  if (p.password_hash != null) {
    sets.push("password_hash = ?");
    binds.push(p.password_hash);
  }
  if (!sets.length) return;
  await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
}

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
}
