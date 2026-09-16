import type { Driver } from "../../shared/domain";
import type { AtadoAlChofer } from "../lib/frenos-de-borrado";

// Las columnas, una por una: `d.*` mandaba `pin_hash` al navegador en cada GET /api/drivers.
// Es el hash del PIN de cada chofer, y la pantalla de Choferes lo tenía a mano en el JSON.
const SELECT = `
  SELECT d.id, d.name, d.document, d.license_number, d.license_category, d.license_expiry,
         d.phone, d.status, d.default_truck_id,
         t.plate AS default_truck_plate,
         (SELECT tr.id FROM trips tr
           WHERE tr.driver_id = d.id AND tr.status = 'EN_CURSO'
           ORDER BY tr.started_at LIMIT 1) AS viaje_en_curso
  FROM drivers d LEFT JOIN trucks t ON t.id = d.default_truck_id
`;

export async function listDrivers(db: D1Database): Promise<Driver[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY d.name`).all<Driver>();
  return results ?? [];
}

export async function getDriver(db: D1Database, id: number): Promise<Driver | null> {
  return (await db.prepare(`${SELECT} WHERE d.id = ?`).bind(id).first<Driver>()) ?? null;
}

export interface DriverRowWithPin extends Driver {
  pin_hash: string | null;
}

/**
 * Todos los choferes que cuelgan de esa patente, los activos primero.
 *
 * Antes esto traía UNA fila y sólo de los activos. La patente no identifica a una persona sino
 * a un camión, así que con dos choferes en el mismo camión entraba el que la base devolviera
 * primero —no hay ORDER BY que lo decida— y el otro leía "PIN incorrecto" con su PIN bien
 * puesto. Y el dado de baja leía lo mismo, sin enterarse de que lo dieron de baja.
 *
 * `status` ordena solo: 'activo' va antes que 'inactivo' por alfabeto.
 */
export async function choferesDeLaPatente(
  db: D1Database,
  plate: string,
): Promise<DriverRowWithPin[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, t.plate AS default_truck_plate
       FROM drivers d JOIN trucks t ON t.id = d.default_truck_id
       WHERE UPPER(REPLACE(t.plate,' ','')) = UPPER(REPLACE(?,' ',''))
       ORDER BY d.status, d.id`,
    )
    .bind(plate)
    .all<DriverRowWithPin>();
  return results ?? [];
}

/**
 * El estado del chofer y su camión, para cada pedido que llega con su token.
 *
 * El token dura una semana, así que sin esto la baja de un chofer no le cortaba nada: seguía
 * usando la app hasta que el token venciera. Es el mismo SELECT que ya se hacía para releer el
 * camión, con una columna más.
 */
export async function sesionDelChofer(
  db: D1Database,
  driverId: number,
): Promise<{ status: string; default_truck_id: number | null } | null> {
  return (
    (await db
      .prepare("SELECT status, default_truck_id FROM drivers WHERE id = ?")
      .bind(driverId)
      .first<{ status: string; default_truck_id: number | null }>()) ?? null
  );
}

export interface DriverInput {
  name: string;
  document: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  phone: string;
  status: Driver["status"];
  default_truck_id: number | null;
}

export async function createDriver(
  db: D1Database,
  d: DriverInput,
  pinHash: string | null,
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status, default_truck_id, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(d.name, d.document, d.license_number, d.license_category, d.license_expiry, d.phone, d.status, d.default_truck_id, pinHash)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateDriver(db: D1Database, id: number, d: DriverInput): Promise<void> {
  await db
    .prepare(
      `UPDATE drivers SET name=?, document=?, license_number=?, license_category=?, license_expiry=?, phone=?, status=?, default_truck_id=?
       WHERE id=?`,
    )
    .bind(d.name, d.document, d.license_number, d.license_category, d.license_expiry, d.phone, d.status, d.default_truck_id, id)
    .run();
}

export async function setPin(db: D1Database, id: number, pinHash: string): Promise<void> {
  await db.prepare("UPDATE drivers SET pin_hash=? WHERE id=?").bind(pinHash, id).run();
}

/** Lo que frenaría el borrado de este chofer. */
export async function loAtadoAlChofer(db: D1Database, id: number): Promise<AtadoAlChofer> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM trips WHERE driver_id = ?)     AS viajes,
              (SELECT COUNT(*) FROM fuel_logs WHERE driver_id = ?)
                + (SELECT COUNT(*) FROM surtidas_frio WHERE driver_id = ?) AS surtidas,
              (SELECT COUNT(*) FROM libreta WHERE created_by = ?)  AS libreta`,
    )
    .bind(id, id, id, id)
    .first<AtadoAlChofer>();
  return row ?? { viajes: 0, surtidas: 0, libreta: 0 };
}

export async function deleteDriver(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM drivers WHERE id = ?").bind(id).run();
}
