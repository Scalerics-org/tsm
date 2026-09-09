import type { LecturaOdometro } from "../../shared/domain";

const SELECT = `
  SELECT l.*, tr.plate AS truck_plate, d.name AS driver_name
  FROM lecturas_odometro l
  JOIN trucks tr ON tr.id = l.truck_id
  LEFT JOIN drivers d ON d.id = l.driver_id
`;

export async function listLecturas(
  db: D1Database,
  opts: { truckId?: number; periodo?: string } = {},
): Promise<LecturaOdometro[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.truckId != null) {
    where.push("l.truck_id = ?");
    binds.push(opts.truckId);
  }
  if (opts.periodo) {
    where.push("l.periodo = ?");
    binds.push(opts.periodo);
  }
  const sql =
    SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY l.periodo DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<LecturaOdometro>();
  return results ?? [];
}

export async function getLectura(
  db: D1Database,
  truckId: number,
  periodo: string,
): Promise<LecturaOdometro | null> {
  return (
    (await db
      .prepare(`${SELECT} WHERE l.truck_id = ? AND l.periodo = ?`)
      .bind(truckId, periodo)
      .first<LecturaOdometro>()) ?? null
  );
}

export async function getLecturaPorId(db: D1Database, id: number): Promise<LecturaOdometro | null> {
  return (await db.prepare(`${SELECT} WHERE l.id = ?`).bind(id).first<LecturaOdometro>()) ?? null;
}

export interface LecturaInput {
  truck_id: number;
  periodo: string;
  kilometraje: number;
  /** Null cuando R2 no está bindeado: se guarda el número igual. */
  r2_key: string | null;
  driver_id: number | null;
}

export async function createLectura(db: D1Database, l: LecturaInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje, r2_key, driver_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(l.truck_id, l.periodo, l.kilometraje, l.r2_key, l.driver_id)
    .run();
  // El odómetro del camión sólo sube, igual que al registrar una surtida: una lectura nueva
  // no puede saber menos que lo que ya quedó anotado por otro lado.
  //
  // Y si lo sube, se borra la marca de "lo puso la oficina": el número pasó a ser el de la
  // foto del tacógrafo, y dejar la fecha vieja hacía que la pantalla del chofer dijera
  // "cargado por la oficina el 21/8" mostrando el kilometraje de una foto de setiembre.
  await db
    .prepare(
      `UPDATE trucks
          SET odometer_at = CASE WHEN ? > odometer_km THEN NULL ELSE odometer_at END,
              odometer_km = MAX(odometer_km, ?)
        WHERE id = ?`,
    )
    .bind(l.kilometraje, l.kilometraje, l.truck_id)
    .run();
  return res.meta.last_row_id as number;
}

/**
 * La oficina corrige una lectura: el kilometraje, el mes al que pertenece, o los dos.
 *
 * La foto NO se toca, ni tampoco `tomada_at`: son la evidencia, y si se pudieran cambiar
 * dejarían de servir para eso — la misma regla que en las surtidas. La pantalla muestra el
 * día real de la foto aparte del mes, justo para que se vea la ventana que se comparó.
 *
 * Se corrige el número tipeado, porque un dígito de más descuadra este mes y el siguiente
 * (los dos usan esta lectura como extremo) y el chofer no puede volver a cargarla: hay una
 * sola por mes. Y se corrige el MES, porque la foto que cierra agosto se saca casi siempre
 * en setiembre, y anotada contra setiembre corre la cuenta de los dos meses.
 *
 * El mes llega ya validado contra los vecinos por `moverLectura`: acá sólo se escribe.
 */
export async function updateLectura(
  db: D1Database,
  id: number,
  cambios: { kilometraje?: number; periodo?: string; r2_key?: string; tomada_at?: string },
  editor: { userId: number; when: string },
): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (cambios.kilometraje != null) {
    sets.push("kilometraje = ?");
    binds.push(cambios.kilometraje);
  }
  if (cambios.periodo != null) {
    sets.push("periodo = ?");
    binds.push(cambios.periodo);
  }
  // Sólo cuando la foto se pudo mudar de verdad en R2. La clave lleva el mes adentro, así que
  // dejarla en el mes viejo hace que la próxima lectura de ese mes la pise.
  if (cambios.r2_key != null) {
    sets.push("r2_key = ?");
    binds.push(cambios.r2_key);
  }
  // La fecha de la foto. Con la oficina cargando el atraso, `datetime('now')` guardaba el
  // día en que se subió el archivo y no el del tacógrafo — y es la fecha con la que la
  // auditoría arma la ventana que compara.
  if (cambios.tomada_at != null) {
    sets.push("tomada_at = ?");
    binds.push(cambios.tomada_at);
  }
  if (sets.length === 0) return;

  sets.push("edited_by = ?", "edited_at = ?");
  binds.push(editor.userId, editor.when, id);

  await db
    .prepare(`UPDATE lecturas_odometro SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
}
