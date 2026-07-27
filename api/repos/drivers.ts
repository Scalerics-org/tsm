import type { Driver } from "../../shared/domain";

const SELECT = `
  SELECT d.*, t.plate AS default_truck_plate
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

/** Busca al chofer por la patente de su camión habitual (para login). */
export async function findDriverByPlate(
  db: D1Database,
  plate: string,
): Promise<DriverRowWithPin | null> {
  const row = await db
    .prepare(
      `SELECT d.*, t.plate AS default_truck_plate
       FROM drivers d JOIN trucks t ON t.id = d.default_truck_id
       WHERE UPPER(REPLACE(t.plate,' ','')) = UPPER(REPLACE(?,' ','')) AND d.status = 'activo'`,
    )
    .bind(plate)
    .first<DriverRowWithPin>();
  return row ?? null;
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

export async function deleteDriver(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM drivers WHERE id = ?").bind(id).run();
}
