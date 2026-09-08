import type { Provider } from "../../shared/domain";
import type { AtadoAlProveedor } from "../lib/proveedores";

/** Un proveedor con lo que tiene colgando: es lo que la pantalla necesita para decidir. */
export interface ProviderConUso extends Provider {
  viajes: number;
  plantillas: number;
}

export async function listProviders(db: D1Database): Promise<Provider[]> {
  const { results } = await db.prepare("SELECT * FROM providers ORDER BY name").all<Provider>();
  return results ?? [];
}

/**
 * Los proveedores con cuántos viajes y plantillas tiene cada uno.
 *
 * Los viajes se cuentan por `provider_name` y no por id: la columna es texto, copiada al
 * crear el viaje. Es la misma clave con la que filtra el resumen para facturar.
 */
export async function listProvidersConUso(db: D1Database): Promise<ProviderConUso[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM trips t WHERE t.provider_name = p.name) AS viajes,
              (SELECT COUNT(*) FROM trip_templates tt WHERE tt.provider_id = p.id) AS plantillas
         FROM providers p
        ORDER BY p.name`,
    )
    .all<ProviderConUso>();
  return results ?? [];
}

export async function getProvider(db: D1Database, id: number): Promise<Provider | null> {
  return (
    (await db.prepare("SELECT * FROM providers WHERE id=?").bind(id).first<Provider>()) ?? null
  );
}

/** Todo lo que quedaría huérfano —o borrado— si este proveedor se va. */
export async function loAtadoAlProveedor(
  db: D1Database,
  id: number,
  name: string,
): Promise<AtadoAlProveedor> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM trips WHERE provider_name = ?)        AS viajes,
              (SELECT COUNT(*) FROM trip_templates WHERE provider_id = ?) AS plantillas,
              (SELECT COUNT(*) FROM libreta WHERE provider_id = ?)        AS libreta`,
    )
    .bind(name, id, id)
    .first<AtadoAlProveedor>();
  return row ?? { viajes: 0, plantillas: 0, libreta: 0 };
}

export async function createProvider(db: D1Database, name: string): Promise<number> {
  const res = await db.prepare("INSERT INTO providers (name) VALUES (?)").bind(name).run();
  return res.meta.last_row_id as number;
}

/**
 * Renombrar arrastra los viajes.
 *
 * `trips.provider_name` es una copia de texto, no una referencia. Renombrando sólo la fila de
 * `providers`, los viajes ya cargados se quedaban con el nombre viejo: desaparecían del
 * filtro por cliente y del resumen con el que se factura, sin que nada avisara. No se notó
 * nunca porque no había pantalla para renombrar; ahora que la hay, el rastro sigue al nombre.
 */
export async function updateProvider(db: D1Database, id: number, name: string): Promise<void> {
  const previo = await getProvider(db, id);
  const renombra = !!previo && previo.name !== name;
  const fila = db.prepare("UPDATE providers SET name=? WHERE id=?").bind(name, id);
  if (!renombra) {
    await fila.run();
    return;
  }

  // Los dos UPDATE van en un `batch`, que D1 corre como una transacción. Sueltos, si el
  // segundo fallaba quedaba el rename a medias: el proveedor con el nombre nuevo y sus viajes
  // con el viejo, o sea los viajes fuera del filtro por cliente y fuera del resumen con el
  // que se factura, sin que nada avise. Es el mismo estado roto que esto venía a evitar.
  await db.batch([
    fila,
    db
      .prepare("UPDATE trips SET provider_name=? WHERE provider_name=?")
      .bind(name, previo!.name),
  ]);
}

export async function deleteProvider(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM providers WHERE id=?").bind(id).run();
}
