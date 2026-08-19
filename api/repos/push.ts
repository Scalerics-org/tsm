import type { Suscripcion } from "../lib/webpush";

export interface SuscripcionGuardada extends Suscripcion {
  id: number;
  user_id: number;
}

/**
 * Alta idempotente. El `endpoint` es único: si el mismo celular vuelve a suscribirse
 * —pasa al reinstalar la app o al limpiar datos— se actualiza en vez de duplicar, porque
 * si no le llegarían dos avisos por viaje.
 */
export async function guardarSuscripcion(
  db: D1Database,
  userId: number,
  s: Suscripcion,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
                                           p256dh = excluded.p256dh,
                                           auth   = excluded.auth`,
    )
    .bind(userId, s.endpoint, s.p256dh, s.auth)
    .run();
}

export async function borrarSuscripcion(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

/** Todas las suscripciones activas. Los avisos van a la oficina, no a los choferes. */
export async function suscripcionesDeOficina(db: D1Database): Promise<SuscripcionGuardada[]> {
  const { results } = await db
    .prepare(
      `SELECT ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.role IN ('encargado','admin')`,
    )
    .all<SuscripcionGuardada>();
  return results ?? [];
}

export async function suscripcionesDeUsuario(db: D1Database, userId: number): Promise<SuscripcionGuardada[]> {
  const { results } = await db
    .prepare("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .bind(userId)
    .all<SuscripcionGuardada>();
  return results ?? [];
}
