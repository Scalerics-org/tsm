import {
  completarPendientes,
  type CobroRegla,
  type Trip,
  type TripSegment,
  type TripStatus,
} from "../../shared/domain";

interface TripRow {
  id: number;
  template_id: number | null;
  provider_name: string;
  origin: string;
  remite: string | null;
  destination: string;
  destinatario: string | null;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  kilos: number | null;
  field_values: string; // JSON
  status: TripStatus;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  segments: string | null; // JSON
  kilometros: number | null;
  edited_by: number | null;
  edited_at: string | null;
  factura_numero: string | null;
  facturado_at: string | null;
  facturado_by: number | null;
  /** Lo calcula `NUMERADOS` con ROW_NUMBER; no es una columna de la tabla. */
  numero_mes: number;
  driver_name?: string;
  truck_plate?: string;
}

/**
 * La marca de facturación del viaje (migración 0032).
 *
 * Va aparte de `Trip` A PROPÓSITO: `Trip` es lo que viaja al celular del chofer, y el chofer
 * no ve nada de facturación. Por eso `listTrips` sigue devolviendo `Trip` pelado y el número
 * de factura sólo sale por `listTripsFacturables`, que usan las rutas de oficina. Así el
 * invariante no depende de acordarse de borrar un campo en cada ruta.
 */
export interface TripFacturacion {
  /** El número que él copia de su sistema de DGI. `null` = todavía no se facturó. */
  factura_numero: string | null;
  facturado_at: string | null;
  facturado_by: number | null;
}

export type TripFacturable = Trip & TripFacturacion;

/**
 * El número de viaje del mes: 1, 2, 3… arrancando de nuevo cada mes.
 *
 * NO se guarda en una columna, se calcula acá, y es a propósito. La oficina puede correr la
 * fecha de un viaje y puede borrarlo; un número guardado quedaría viejo apenas se hace
 * cualquiera de las dos cosas —un viaje que se pasa de agosto a julio se llevaría puesto su
 * número de agosto— y la serie tendría huecos. Calculado siempre da 1, 2, 3 sin saltos.
 *
 * A cambio, el número no es una identidad: si se carga un viaje con fecha retroactiva, los
 * que quedan abajo se corren uno. Para identificar un viaje sin ambigüedad está `id`, que no
 * se mueve nunca y es el que sigue yendo en la primera columna del Excel.
 *
 * Va en una subconsulta y no en el SELECT de afuera porque en SQL el WHERE corre ANTES que la
 * función de ventana: numerando arriba, filtrar por chofer o por camión renumeraba desde 1 y
 * el mismo viaje mostraba números distintos según cómo estuviera filtrada la pantalla.
 *
 * El desempate por `id` no es decorativo: los viajes que carga la oficina nacen a las
 * 00:00:00, así que dos del mismo día tienen `started_at` idéntico y sin él el orden —y por
 * lo tanto el número— cambiaba de una consulta a la otra.
 */
const NUMERADOS = `
  SELECT t.*, ROW_NUMBER() OVER (
           PARTITION BY substr(t.started_at, 1, 7)
           ORDER BY t.started_at, t.id
         ) AS numero_mes
  FROM trips t
`;

const SELECT = `
  SELECT t.id, t.template_id, t.provider_name, t.origin, t.remite, t.destination, t.destinatario,
         t.driver_id, t.truck_id, t.cargo_type, t.kilos, t.field_values, t.status,
         t.started_at, t.finished_at, t.notes, t.created_at,
         t.segments, t.kilometros, t.edited_by, t.edited_at,
         t.factura_numero, t.facturado_at, t.facturado_by, t.numero_mes,
         d.name AS driver_name, tr.plate AS truck_plate
  FROM (${NUMERADOS}) t
  JOIN drivers d ON d.id = t.driver_id
  JOIN trucks tr ON tr.id = t.truck_id
`;

function parseSegments(raw: string | null): TripSegment[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // Las cargas guardadas antes del `sid` no tienen ninguna foto colgada, así que
    // alcanza con darles uno estable por posición para no dejar el campo vacío.
    return v.map((s: TripSegment, i: number) => (s?.sid ? s : { ...s, sid: `legacy-${i}` }));
  } catch {
    return [];
  }
}

function toTrip(r: TripRow): Trip {
  let field_values: Record<string, string> = {};
  try {
    field_values = JSON.parse(r.field_values || "{}");
  } catch {
    field_values = {};
  }
  return {
    id: r.id,
    template_id: r.template_id,
    provider_name: r.provider_name,
    origin: r.origin,
    remite: r.remite,
    destination: r.destination,
    destinatario: r.destinatario,
    driver_id: r.driver_id,
    truck_id: r.truck_id,
    cargo_type: r.cargo_type,
    kilos_carga: r.kilos,
    field_values,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    notes: r.notes,
    created_at: r.created_at,
    segments: parseSegments(r.segments),
    kilometros: r.kilometros,
    edited_by: r.edited_by,
    edited_at: r.edited_at,
    numero_mes: r.numero_mes,
    driver_name: r.driver_name,
    truck_plate: r.truck_plate,
  };
}

export interface TripFilters {
  driverId?: number;
  truckId?: number;
  status?: TripStatus;
  onlyDriverId?: number;
  provider?: string;
  from?: string;
  to?: string;
}

/** El WHERE de los filtros, compartido por las dos lecturas de la lista. */
function filtrar(f: TripFilters): { sql: string; binds: unknown[] } {
  const where: string[] = [];
  const binds: unknown[] = [];
  const scope = f.onlyDriverId ?? f.driverId;
  if (scope != null) {
    where.push("t.driver_id = ?");
    binds.push(scope);
  }
  if (f.truckId != null) {
    where.push("t.truck_id = ?");
    binds.push(f.truckId);
  }
  if (f.status) {
    where.push("t.status = ?");
    binds.push(f.status);
  }
  if (f.provider) {
    where.push("t.provider_name = ?");
    binds.push(f.provider);
  }
  if (f.from) {
    where.push("substr(t.started_at,1,10) >= ?");
    binds.push(f.from);
  }
  if (f.to) {
    where.push("substr(t.started_at,1,10) <= ?");
    binds.push(f.to);
  }
  return {
    sql: SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY t.started_at DESC, t.id DESC",
    binds,
  };
}

export async function listTrips(db: D1Database, f: TripFilters): Promise<Trip[]> {
  const { sql, binds } = filtrar(f);
  const { results } = await db.prepare(sql).bind(...binds).all<TripRow>();
  return (results ?? []).map(toTrip);
}

/**
 * Lo mismo, pero con la marca de facturación colgada. Sólo para oficina: es el número de
 * factura, y eso no baja al celular del chofer.
 */
export async function listTripsFacturables(db: D1Database, f: TripFilters): Promise<TripFacturable[]> {
  const { sql, binds } = filtrar(f);
  const { results } = await db.prepare(sql).bind(...binds).all<TripRow>();
  return (results ?? []).map((r) => ({
    ...toTrip(r),
    factura_numero: r.factura_numero,
    facturado_at: r.facturado_at,
    facturado_by: r.facturado_by,
  }));
}

export async function getTrip(db: D1Database, id: number): Promise<Trip | null> {
  const r = await db.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<TripRow>();
  return r ? toTrip(r) : null;
}

export interface StartTripInput {
  template_id: number | null;
  provider_name: string;
  origin: string;
  remite: string | null;
  destination: string;
  destinatario: string | null;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  kilos_carga: number | null;
  field_values: Record<string, string>;
  segments?: TripSegment[];
  kilometros?: number | null;
}

export async function startTrip(
  db: D1Database,
  t: StartTripInput,
  /**
   * Un viaje que la oficina carga a mano ya pasó: nace COMPLETADO, con su fecha y con quién
   * lo cargó. El del chofer sigue naciendo EN_CURSO, que es lo que lo pone en su pantalla.
   */
  cargadoPorOficina?: { userId: number; when: string; startedAt: string },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trips (template_id, provider_name, origin, remite, destination, destinatario, driver_id, truck_id, cargo_type, kilos, field_values, segments, kilometros, status, started_at, finished_at, edited_by, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)`,
    )
    .bind(
      t.template_id, t.provider_name, t.origin, t.remite, t.destination, t.destinatario, t.driver_id, t.truck_id,
      t.cargo_type, t.kilos_carga, JSON.stringify(t.field_values ?? {}),
      t.segments?.length ? JSON.stringify(t.segments) : null, t.kilometros ?? null,
      cargadoPorOficina ? "COMPLETADO" : "EN_CURSO",
      cargadoPorOficina?.startedAt ?? null,
      // La LLEGADA es la del viaje, no la de hoy. Con `when` acá, un viaje de mayo cargado en
      // agosto quedaba "salió en mayo, llegó en agosto" en la ficha y en el Excel.
      cargadoPorOficina?.startedAt ?? cargadoPorOficina?.when ?? null,
      cargadoPorOficina?.userId ?? null,
      // `edited_at` sí es hoy: es cuándo la oficina lo cargó, no cuándo pasó el viaje.
      cargadoPorOficina?.when ?? null,
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function finishTrip(
  db: D1Database,
  id: number,
  when: string,
  fieldValues: Record<string, string>,
  notes: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE trips SET status='COMPLETADO', finished_at=?, field_values=?, notes=? WHERE id=? AND status='EN_CURSO'",
    )
    .bind(when, JSON.stringify(fieldValues ?? {}), notes, id)
    .run();
}

/** Reemplaza los renglones del viaje. Lo usa el chofer al agregar cargas y la oficina al corregir. */
export async function updateSegments(
  db: D1Database,
  id: number,
  segments: TripSegment[],
  editor?: { userId: number; when: string },
): Promise<void> {
  const json = segments.length ? JSON.stringify(segments) : null;
  if (editor) {
    await db
      .prepare("UPDATE trips SET segments=?, edited_by=?, edited_at=? WHERE id=?")
      .bind(json, editor.userId, editor.when, id)
      .run();
    return;
  }
  await db.prepare("UPDATE trips SET segments=? WHERE id=?").bind(json, id).run();
}

/**
 * Aplica las reglas a las cargas que habían quedado sin cobro y devuelve cuántas se destrabaron.
 *
 * Corre cuando la oficina define una regla: es lo que hace que definirla una vez alcance para
 * todas las cargas que ya la estaban esperando. No toca las que ya tenían cobro ni las manuales.
 */
export async function completarCobrosPendientes(
  db: D1Database,
  reglas: CobroRegla[],
): Promise<number> {
  const trips = await listTrips(db, {});
  let destrabadas = 0;

  for (const t of trips) {
    if (!t.segments.some((s) => !s.cobro_tipo && !s.cobro_manual)) continue;

    const actualizados = completarPendientes(reglas, t.segments);
    const resueltas = actualizados.filter((s, i) => s.cobro_tipo && !t.segments[i].cobro_tipo).length;
    if (!resueltas) continue;

    await updateSegments(db, t.id, actualizados);
    destrabadas += resueltas;
  }
  return destrabadas;
}

/**
 * La cabecera de un viaje que la oficina corrige.
 *
 * `provider_name` NO está: es una copia denormalizada y es la clave con la que se filtra el
 * resumen de facturación, así que cambiarla mueve el viaje de cliente sin que nada más se
 * entere. Si alguna vez hace falta, se hace aparte y con cuidado.
 */
export interface CabeceraPatch {
  origin: string;
  remite: string | null;
  destination: string;
  destinatario: string | null;
  cargo_type: string;
  kilos_carga: number | null;
  kilometros: number | null;
  notes: string | null;
  driver_id: number;
  truck_id: number;
  /**
   * Los campos de plantilla van enteros porque los kilos viven en dos lados: la columna
   * `kilos` (con la que se suman los reportes) y el campo `is_weight` de la plantilla (que
   * es el que sale en el Excel). Corregir uno solo los deja diciendo cosas distintas.
   */
  field_values: Record<string, string>;
}

export async function updateCabecera(
  db: D1Database,
  id: number,
  p: CabeceraPatch,
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE trips
          SET origin=?, remite=?, destination=?, destinatario=?, cargo_type=?,
              kilos=?, kilometros=?, notes=?, driver_id=?, truck_id=?, field_values=?,
              edited_by=?, edited_at=?
        WHERE id=?`,
    )
    .bind(
      p.origin, p.remite, p.destination, p.destinatario, p.cargo_type,
      p.kilos_carga, p.kilometros, p.notes, p.driver_id, p.truck_id,
      JSON.stringify(p.field_values ?? {}),
      editor.userId, editor.when, id,
    )
    .run();
}

/** El viaje con su marca de facturación. Lo que hace falta para saber si se puede tocar. */
export async function getTripFacturable(db: D1Database, id: number): Promise<TripFacturable | null> {
  const r = await db.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<TripRow>();
  if (!r) return null;
  return { ...toTrip(r), factura_numero: r.factura_numero, facturado_at: r.facturado_at, facturado_by: r.facturado_by };
}

export async function deleteTrip(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trips WHERE id = ?").bind(id).run();
}

/**
 * Corre el viaje entero la cantidad de días que haga falta.
 *
 * Salida y llegada se mueven juntas y conservan la hora: un viaje que duró dos días sigue
 * durando dos días después de corregirle la fecha. Queda el rastro de quién lo movió, igual
 * que en los renglones: mover un viaje de mes cambia la auditoría de kilómetros de DOS meses
 * a la vez, y alguien va a preguntar por qué.
 */
export async function correrFecha(
  db: D1Database,
  id: number,
  dias: number,
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE trips
          SET started_at  = datetime(started_at, ? || ' days'),
              finished_at = CASE WHEN finished_at IS NULL THEN NULL
                                 ELSE datetime(finished_at, ? || ' days') END,
              edited_by = ?, edited_at = ?
        WHERE id = ?`,
    )
    .bind(dias, dias, editor.userId, editor.when, id)
    .run();
}

/** El recorrido del viaje, cuando lo arman las cargas y no la plantilla. */
export async function setRecorrido(
  db: D1Database,
  id: number,
  origin: string,
  destination: string,
): Promise<void> {
  await db
    .prepare("UPDATE trips SET origin=?, destination=? WHERE id=?")
    .bind(origin, destination, id)
    .run();
}

export async function setKilometros(db: D1Database, id: number, km: number | null): Promise<void> {
  await db.prepare("UPDATE trips SET kilometros=? WHERE id=?").bind(km, id).run();
}

export async function cancelTrip(db: D1Database, id: number, notes: string): Promise<void> {
  await db.prepare("UPDATE trips SET status='CANCELADO', notes=? WHERE id=?").bind(notes, id).run();
}

/**
 * D1 no acepta más de 100 parámetros por consulta, y un corte de un mes de los cuatro camiones
 * los pasa tranquilo. Se marca de a tandas, todas en el mismo `batch` (una sola transacción):
 * o quedan facturados todos los que punteó o no queda facturado ninguno.
 */
const TANDA = 40;

function enTandas(ids: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += TANDA) out.push(ids.slice(i, i + TANDA));
  return out;
}

function cambios(res: D1Result[]): number {
  return res.reduce((s, r) => s + (r.meta?.changes ?? 0), 0);
}

/**
 * Le pone el número de factura a los viajes que él punteó.
 *
 * El número NO se genera acá: sale de su sistema de facturación electrónica de DGI y él lo
 * copia. Lo único que hace esto es dejar registrado cuál es, para que esos viajes no vuelvan
 * a aparecer en el próximo resumen.
 *
 * Los que ya tenían factura NO se pisan: si se equivocó, primero desmarca. Pisar en silencio
 * el número de una factura ya emitida deja dos facturas distintas cobrando el mismo viaje y
 * nadie se entera. Los CANCELADO tampoco se facturan.
 *
 * Devuelve cuántos se marcaron de verdad, para poder avisarle de los que quedaron afuera.
 */
export async function marcarFacturados(
  db: D1Database,
  ids: number[],
  numero: string,
  quien: { userId: number; when: string },
): Promise<number> {
  if (!ids.length) return 0;
  const stmts = enTandas(ids).map((tanda) =>
    db
      .prepare(
        `UPDATE trips SET factura_numero=?, facturado_at=?, facturado_by=?
          WHERE id IN (${tanda.map(() => "?").join(",")})
            AND factura_numero IS NULL AND status <> 'CANCELADO'`,
      )
      .bind(numero, quien.when, quien.userId, ...tanda),
  );
  return cambios(await db.batch(stmts));
}

/** Saca la marca: "se va a equivocar alguna vez" y el viaje tiene que poder volver al resumen. */
export async function desmarcarFacturados(db: D1Database, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const stmts = enTandas(ids).map((tanda) =>
    db
      .prepare(
        `UPDATE trips SET factura_numero=NULL, facturado_at=NULL, facturado_by=NULL
          WHERE id IN (${tanda.map(() => "?").join(",")}) AND factura_numero IS NOT NULL`,
      )
      .bind(...tanda),
  );
  return cambios(await db.batch(stmts));
}

export async function activeTripForDriver(db: D1Database, driverId: number): Promise<Trip | null> {
  const r = await db
    .prepare(`${SELECT} WHERE t.driver_id = ? AND t.status = 'EN_CURSO' ORDER BY t.started_at DESC LIMIT 1`)
    .bind(driverId)
    .first<TripRow>();
  return r ? toTrip(r) : null;
}
