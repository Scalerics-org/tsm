import type { Provider } from "../../shared/domain";

export async function listProviders(db: D1Database): Promise<Provider[]> {
  const { results } = await db.prepare("SELECT * FROM providers ORDER BY name").all<Provider>();
  return results ?? [];
}

export async function createProvider(db: D1Database, name: string): Promise<number> {
  const res = await db.prepare("INSERT INTO providers (name) VALUES (?)").bind(name).run();
  return res.meta.last_row_id as number;
}

export async function updateProvider(db: D1Database, id: number, name: string): Promise<void> {
  await db.prepare("UPDATE providers SET name=? WHERE id=?").bind(name, id).run();
}

export async function deleteProvider(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM providers WHERE id=?").bind(id).run();
}
