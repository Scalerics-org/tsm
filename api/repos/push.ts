export interface PushSub {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function saveSubscription(
  db: D1Database,
  userId: number,
  s: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
    )
    .bind(userId, s.endpoint, s.p256dh, s.auth)
    .run();
}

export async function subsForUsers(db: D1Database, userIds: number[]): Promise<PushSub[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<PushSub>();
  return results ?? [];
}

export async function subsForRole(db: D1Database, role: string): Promise<PushSub[]> {
  const { results } = await db
    .prepare(
      `SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id WHERE u.role = ?`,
    )
    .bind(role)
    .all<PushSub>();
  return results ?? [];
}

export async function userIdForDriver(db: D1Database, driverId: number): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM users WHERE driver_id = ? LIMIT 1")
    .bind(driverId)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function deleteByEndpoint(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}
