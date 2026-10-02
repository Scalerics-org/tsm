import type { FacturaDeCliente } from "../../shared/facturacion-por-cliente";

/**
 * La factura y el pago por cliente dentro del viaje (migración 0055). Ver docs/FACTURACION-POR-CLIENTE.md.
 *
 * Una fila por (viaje, cliente) facturado. Cada escritura cierra su condición en el propio UPDATE o
 * INSERT…ON CONFLICT, sin leer y después escribir: dos pedidos a la vez no pisan una factura puesta.
 */

const TANDA = 50;

/** Las marcas de varios viajes de una vez, por viaje. Un solo JOIN por tanda: no una consulta por viaje. */
export async function marcasDeViajes(db: D1Database, tripIds: number[]): Promise<Map<number, FacturaDeCliente[]>> {
  const porViaje = new Map<number, FacturaDeCliente[]>();
  for (let i = 0; i < tripIds.length; i += TANDA) {
    const tanda = tripIds.slice(i, i + TANDA);
    const { results } = await db
      .prepare(
        `SELECT v.*, u.name AS pago_by_name
           FROM viaje_cliente_facturacion v
           LEFT JOIN users u ON u.id = v.pago_by
          WHERE v.trip_id IN (${tanda.map(() => "?").join(",")})
          ORDER BY v.id`,
      )
      .bind(...tanda)
      .all<FacturaDeCliente & { trip_id: number }>();
    for (const r of results ?? []) {
      const lista = porViaje.get(r.trip_id) ?? [];
      lista.push(r);
      porViaje.set(r.trip_id, lista);
    }
  }
  return porViaje;
}

export interface ClienteAMarcar {
  trip_id: number;
  cliente_clave: string;
  cliente_nombre: string;
}

type Quien = { userId: number; when: string };

/**
 * Le pone el número de factura al cliente de un viaje. No pisa una factura puesta: si ya la tiene no
 * cambia nada y devuelve false. Si la fila existía sólo por el rastro (factura sacada), la reactiva.
 */
export async function marcarClientes(
  db: D1Database,
  items: ClienteAMarcar[],
  numero: string,
  quien: Quien,
): Promise<boolean[]> {
  if (!items.length) return [];
  const res = await db.batch(
    items.map((i) =>
      db
        .prepare(
          `INSERT INTO viaje_cliente_facturacion
             (trip_id, cliente_clave, cliente_nombre, factura_numero, facturado_at, facturado_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (trip_id, cliente_clave) DO UPDATE SET
             cliente_nombre = excluded.cliente_nombre,
             factura_numero = excluded.factura_numero,
             facturado_at   = excluded.facturado_at,
             facturado_by   = excluded.facturado_by,
             pago_at = NULL, pago_by = NULL
           WHERE viaje_cliente_facturacion.factura_numero IS NULL`,
        )
        .bind(i.trip_id, i.cliente_clave, i.cliente_nombre, numero, quien.when, quien.userId),
    ),
  );
  return res.map((r) => (r.meta?.changes ?? 0) > 0);
}

/**
 * Saca la factura (y con ella el pago) y deja el número viejo en `factura_quitada`, igual que en el
 * viaje entero: el viaje puede volver a facturarse y la oficina ve que ya salió una vez.
 */
export async function desmarcarClientes(
  db: D1Database,
  items: { trip_id: number; cliente_clave: string }[],
  cuando: string,
): Promise<boolean[]> {
  if (!items.length) return [];
  const res = await db.batch(
    items.map((i) =>
      db
        .prepare(
          `UPDATE viaje_cliente_facturacion
              SET factura_quitada = factura_numero, factura_quitada_at = ?,
                  factura_numero = NULL, facturado_at = NULL, facturado_by = NULL,
                  pago_at = NULL, pago_by = NULL
            WHERE trip_id = ? AND cliente_clave = ? AND factura_numero IS NOT NULL`,
        )
        .bind(cuando, i.trip_id, i.cliente_clave),
    ),
  );
  return res.map((r) => (r.meta?.changes ?? 0) > 0);
}

/** Anota el pago del cliente. Sólo con factura, y no pisa un pago ya marcado (se conserva quién y cuándo). */
export async function marcarPagosClientes(
  db: D1Database,
  items: { trip_id: number; cliente_clave: string }[],
  quien: Quien,
): Promise<boolean[]> {
  if (!items.length) return [];
  const res = await db.batch(
    items.map((i) =>
      db
        .prepare(
          `UPDATE viaje_cliente_facturacion SET pago_at = ?, pago_by = ?
            WHERE trip_id = ? AND cliente_clave = ? AND factura_numero IS NOT NULL AND pago_at IS NULL`,
        )
        .bind(quien.when, quien.userId, i.trip_id, i.cliente_clave),
    ),
  );
  return res.map((r) => (r.meta?.changes ?? 0) > 0);
}

/** Saca el pago y nada más: el cliente sigue facturado. */
export async function desmarcarPagosClientes(
  db: D1Database,
  items: { trip_id: number; cliente_clave: string }[],
): Promise<boolean[]> {
  if (!items.length) return [];
  const res = await db.batch(
    items.map((i) =>
      db
        .prepare(
          `UPDATE viaje_cliente_facturacion SET pago_at = NULL, pago_by = NULL
            WHERE trip_id = ? AND cliente_clave = ? AND pago_at IS NOT NULL`,
        )
        .bind(i.trip_id, i.cliente_clave),
    ),
  );
  return res.map((r) => (r.meta?.changes ?? 0) > 0);
}
