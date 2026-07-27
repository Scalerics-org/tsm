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

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
}
