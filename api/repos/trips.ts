import {
  TRIP_STATUS,
  aplicarCobro,
  completarPendientes,
  type CobroRegla,
  type Trip,
  type Descarga,
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
  factura_quitada: string | null;
  factura_quitada_at: string | null;
  /** Cuándo se cobró (migración 0032). `null` = todavía no pagó. Sólo tiene sentido con factura. */
  pago_at: string | null;
  pago_by: number | null;
  /** Lo calcula `NUMERADOS` con ROW_NUMBER; no es una columna de la tabla. */
  numero_mes: number;
  driver_name?: string;
  truck_plate?: string;
  edited_by_name?: string | null;
  template_name?: string | null;
  descarga_por_carga?: number | null;
  /** JSON con las descargas por lugar (migración 0051). `null` = modelo anterior. */
  descargas?: string | null;
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
  /**
   * El número que TUVO y le sacaron (migración 0043).
   *
   * Desmarcar devuelve el viaje al resumen para volver a facturarlo, y antes borraba el número
   * sin dejar nada: si se facturaba de nuevo con otro número, en DGI quedaban las dos facturas
   * y la app no tenía con qué darse cuenta. Esto es lo que la oficina ve al volver a facturarlo.
   */
  factura_quitada: string | null;
  factura_quitada_at: string | null;
  /** Cuándo se cobró (migración 0032). `null` = todavía no pagó. Sólo tiene sentido con factura. */
  pago_at: string | null;
  pago_by: number | null;
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
         t.segments, t.descargas, t.kilometros, t.edited_by, t.edited_at,
         t.factura_numero, t.facturado_at, t.facturado_by,
         t.factura_quitada, t.factura_quitada_at, t.pago_at, t.pago_by, t.numero_mes,
         d.name AS driver_name, tr.plate AS truck_plate,
         -- Quién fue el último en corregirlo. El LEFT es porque el usuario puede haberse
         -- borrado, y un viaje no puede desaparecer de la lista por eso.
         e.name AS edited_by_name,
         -- El tipo de viaje: "Internacional TYCSUR" adentro del cliente Internacional. Para
         -- ver de cuál es cada viaje sin entrar (Rodrigo, 18/9).
         tp.name AS template_name,
         -- Las cargas de esa plantilla dicen sólo dónde cargó y la descarga se pregunta al cerrar
         -- (Otros Viajes): la lista lo necesita para marcar lo que quedó sin descargar.
         tp.renglon_pide_ubicacion AS descarga_por_carga
  FROM (${NUMERADOS}) t
  JOIN drivers d ON d.id = t.driver_id
  JOIN trucks tr ON tr.id = t.truck_id
  LEFT JOIN users e ON e.id = t.edited_by
  LEFT JOIN trip_templates tp ON tp.id = t.template_id
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
    edited_by_name: r.edited_by_name ?? null,
    template_name: r.template_name ?? null,
    descarga_por_carga: !!r.descarga_por_carga,
    descargas: parseDescargas(r.descargas),
  };
}

function parseDescargas(raw: string | null | undefined): Descarga[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Descarga[]) : null;
  } catch {
    return null;
  }
}

/**
 * Las descargas por lugar del viaje, que se escriben juntas al cerrar. Con `editor` es una
 * corrección de la oficina y queda registrado quién y cuándo, como el resto de las correcciones.
 */
export async function setDescargas(
  db: D1Database,
  id: number,
  descargas: Descarga[],
  editor?: { userId: number; when: string },
): Promise<void> {
  const json = descargas.length ? JSON.stringify(descargas) : null;
  if (editor) {
    await db
      .prepare("UPDATE trips SET descargas=?, edited_by=?, edited_at=? WHERE id=?")
      .bind(json, editor.userId, editor.when, id)
      .run();
    return;
  }
  await db.prepare("UPDATE trips SET descargas=? WHERE id=?").bind(json, id).run();
}

export interface TripFilters {
  driverId?: number;
  truckId?: number;
  status?: TripStatus;
  onlyDriverId?: number;
  provider?: string;
  /**
   * Cliente de alguna carga del viaje: para quién va (`clientes`) o a quién se le cobra
   * (`cobro_a`). Distinto de `provider`, que es el nombre del viaje ("Montevideo - BU").
   *
   * Va aparte a propósito y no ensancha `provider`: ése lo usa también el resumen de
   * facturación, que se arma por viaje, y cambiarlo movería lo que se factura.
   */
  cliente?: string;
  /**
   * "si" = ya tienen número de factura; "no" = completados que todavía no. Para que en Viajes,
   * filtrando por mes y camión, se vea cuál está facturado y cuál no.
   */
  facturado?: "si" | "no";
  /**
   * "si" = ya se cobró; "no" = facturado y todavía sin cobrar (el rojo del Excel de Rodrigo).
   * Un viaje sin facturar no está "sin pagar": no hay nada que cobrar todavía.
   */
  pago?: "si" | "no";
  /**
   * La factura o la referencia exacta que tiene puesta: 6029, o SAMAN cuando el viaje se arregla
   * sin factura y el campo dice a quién le corresponde pagarlo. Sin distinguir mayúsculas.
   */
  factura?: string;
  /** El tipo de viaje (plantilla) adentro del cliente: TYCSUR, Minabel o Valvis en Internacional. */
  templateId?: number;
  from?: string;
  to?: string;
}

/**
 * Una carga coincide si el cliente está en sus `clientes` o es a quien se le cobra. Sin
 * distinguir mayúsculas ni espacios de más: `cobro_a` se escribe a mano ("Armco" / "ARMCO").
 */
const SQL_CLIENTE_DE_CARGA = `EXISTS (
    SELECT 1 FROM json_each(COALESCE(t.segments, '[]')) s
     WHERE lower(trim(COALESCE(json_extract(s.value, '$.cobro_a'), ''))) = lower(trim(?))
        -- El lugar de carga también: en "Otros Viajes" todos dicen Montevideo → Artigas y lo que
        -- distingue a cada uno es dónde cargó (Maccio, ISUSA, Cargill). Rodrigo, 19/9.
        OR lower(trim(COALESCE(json_extract(s.value, '$.remitente'), ''))) = lower(trim(?))
        OR EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(s.value, '$.clientes'), '[]')) c
                    WHERE lower(trim(c.value)) = lower(trim(?))))`;

/** El WHERE de los filtros, compartido por las dos lecturas de la lista. Exportado para los tests. */
export function sqlFiltros(f: TripFilters): { sql: string; binds: unknown[] } {
  return filtrar(f);
}

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
  if (f.templateId != null) {
    where.push("t.template_id = ?");
    binds.push(f.templateId);
  }
  if (f.cliente) {
    where.push(SQL_CLIENTE_DE_CARGA);
    binds.push(f.cliente, f.cliente, f.cliente);
  }
  if (f.facturado === "si") where.push("t.factura_numero IS NOT NULL");
  // Un viaje en curso o cancelado no está "sin facturar": no hay nada que facturar todavía.
  if (f.facturado === "no") where.push("t.factura_numero IS NULL AND t.status = 'COMPLETADO'");
  if (f.pago === "si") where.push("t.pago_at IS NOT NULL");
  if (f.pago === "no") where.push("t.factura_numero IS NOT NULL AND t.pago_at IS NULL");
  if (f.factura) {
    where.push("lower(trim(t.factura_numero)) = lower(trim(?))");
    binds.push(f.factura);
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

/**
 * Los clientes que aparecen en alguna carga —para quién va o a quién se cobra—, para el
 * desplegable de Viajes. Sólo los que están en viajes: una opción que no trae nada confunde.
 */
export async function listClientesDeCarga(db: D1Database): Promise<ClienteDeCarga[]> {
  const { results } = await db
    .prepare(
      `SELECT json_extract(s.value, '$.cobro_a') AS nombre, 1 AS cobra, 0 AS remite
         FROM trips t, json_each(COALESCE(t.segments, '[]')) s
       UNION ALL
       SELECT c.value AS nombre, 0 AS cobra, 0 AS remite
         FROM trips t, json_each(COALESCE(t.segments, '[]')) s,
              json_each(COALESCE(json_extract(s.value, '$.clientes'), '[]')) c
       UNION ALL
       SELECT json_extract(s.value, '$.remitente') AS nombre, 0 AS cobra, 1 AS remite
         FROM trips t, json_each(COALESCE(t.segments, '[]')) s`,
    )
    .all<{ nombre: string | null; cobra: number; remite?: number }>();
  return clientesDeCarga(results ?? []);
}

export interface ClienteDeCarga {
  nombre: string;
  /** Alguna carga se le cobra a este cliente. */
  cobra: boolean;
  /** Sólo aparece como lugar de carga, nunca como cliente ni como cobro. */
  soloCarga: boolean;
}

/**
 * Junta los nombres sin repetir. SQLite no sabe pasar a minúsculas "Á" ni "Ñ", así que la
 * deduplicación se hace acá. Queda la primera forma en que apareció escrito.
 */
export function clientesDeCarga(
  rows: { nombre: string | null; cobra: number; remite?: number }[],
): ClienteDeCarga[] {
  const porClave = new Map<string, ClienteDeCarga>();
  for (const r of rows) {
    const nombre = (r.nombre ?? "").trim();
    if (!nombre) continue;
    const clave = nombre.toLocaleLowerCase("es");
    const previo = porClave.get(clave);
    porClave.set(clave, {
      nombre: previo?.nombre ?? nombre,
      cobra: !!previo?.cobra || !!r.cobra,
      // Deja de ser "sólo carga" en cuanto aparece una vez como cliente o como cobro.
      soloCarga: (previo?.soloCarga ?? true) && !!r.remite,
    });
  }
  return [...porClave.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
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
    factura_quitada: r.factura_quitada,
    factura_quitada_at: r.factura_quitada_at,
    pago_at: r.pago_at,
    pago_by: r.pago_by,
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
      `INSERT INTO trips (template_id, provider_name, origin, remite, destination, destinatario, driver_id, truck_id, cargo_type, kilos, field_values, segments, kilometros, status, started_at, finished_at, edited_by, edited_at, cargado_por_oficina)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?)`,
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
      // La marca de verdad, y no inferida de "salida igual a llegada": eso deja de valer en
      // cuanto se le corrige la llegada. De acá sale que no se le pidan fotos que no puede tener.
      cargadoPorOficina ? 1 : 0,
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
/**
 * Vuelve a resolver el cobro de las cargas de un lugar de carga, con las reglas de ahora.
 *
 * `completarCobrosPendientes` sólo rellena las cargas vacías, y está bien que así sea: una
 * regla nueva no tiene por qué reescribir lo que ya estaba resuelto. Pero CORREGIR una regla sí
 * es eso — la oficina está diciendo "esto se le cobra a otro"—, y sin esto arreglaba la fila de
 * la regla y las cargas seguían saliendo en el resumen con el pagador viejo.
 *
 * No toca lo facturado (esas cargas respaldan una factura emitida) ni lo que la oficina fijó a
 * mano (`cobro_manual`), que es una decisión más fuerte que cualquier regla.
 */
export async function restamparCobros(
  db: D1Database,
  reglas: CobroRegla[],
  remitenteId: number,
): Promise<number> {
  const trips = await listTripsFacturables(db, {});
  let cambiadas = 0;

  for (const t of trips) {
    if (t.factura_numero || t.status === TRIP_STATUS.CANCELADO) continue;
    if (!t.segments.some((s) => s.remitente_id === remitenteId && !s.cobro_manual)) continue;

    const actualizados = t.segments.map((s) =>
      s.remitente_id === remitenteId && !s.cobro_manual ? aplicarCobro(reglas, [s])[0] : s,
    );
    const distintas = actualizados.filter(
      (s, i) => s.cobro_a !== t.segments[i].cobro_a || s.cobro_tipo !== t.segments[i].cobro_tipo,
    ).length;
    if (!distintas) continue;

    await updateSegments(db, t.id, actualizados);
    cambiadas += distintas;
  }
  return cambiadas;
}

export async function completarCobrosPendientes(
  db: D1Database,
  reglas: CobroRegla[],
): Promise<number> {
  // Con la marca de factura, y los facturados se saltean: una regla nueva no puede reescribir
  // una factura ya emitida. Antes recorría TODOS los viajes, y a una carga que había salido
  // pendiente en un viaje facturado le escribía hoy el cobro, sin dejar rastro.
  const trips = await listTripsFacturables(db, {});
  let destrabadas = 0;

  for (const t of trips) {
    if (t.factura_numero) continue;
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
  return {
    ...toTrip(r),
    factura_numero: r.factura_numero,
    facturado_at: r.facturado_at,
    facturado_by: r.facturado_by,
    factura_quitada: r.factura_quitada,
    factura_quitada_at: r.factura_quitada_at,
    pago_at: r.pago_at,
    pago_by: r.pago_by,
  };
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

/**
 * El destino que el chofer elige al cerrar (los internacionales: "cuando lleguen:
 * departamento, donde descargo…").
 *
 * `setRecorrido` no sirve: toca el origen y no el destinatario, y acá el origen ya lo eligió
 * al salir. Sólo mientras está en curso, igual que el resto de lo que escribe el chofer.
 */
export async function setDestino(
  db: D1Database,
  id: number,
  destination: string,
  destinatario: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE trips SET destination=?, destinatario=? WHERE id=? AND status='EN_CURSO'")
    .bind(destination, destinatario, id)
    .run();
}

/**
 * Los campos del viaje, completados en el camino (el N° de MIC en el puente).
 *
 * Se reescribe el JSON entero, como en `finishTrip`: quien llama ya mezcló lo nuevo con lo que
 * había. Sólo mientras está en curso: un viaje cerrado lo corrige la oficina por la cabecera.
 */
export async function setFieldValues(
  db: D1Database,
  id: number,
  fieldValues: Record<string, string>,
): Promise<void> {
  await db
    .prepare("UPDATE trips SET field_values=? WHERE id=? AND status='EN_CURSO'")
    .bind(JSON.stringify(fieldValues ?? {}), id)
    .run();
}

/** El peso en kilos, cuando llega después de salir (en el cierre). */
export async function setKilos(db: D1Database, id: number, kilos: number | null): Promise<void> {
  await db.prepare("UPDATE trips SET kilos=? WHERE id=?").bind(kilos, id).run();
}

export async function setKilometros(db: D1Database, id: number, km: number | null): Promise<void> {
  await db.prepare("UPDATE trips SET kilometros=? WHERE id=?").bind(km, id).run();
}

/**
 * Cancelar NO borra lo que el chofer escribió.
 *
 * Las dos pantallas cancelan sin pedir motivo —mandan el cuerpo vacío— y esto guardaba esa
 * cadena vacía en `notes`: se perdían las observaciones del viaje. Si viene un motivo, se
 * agrega debajo de lo que ya había.
 */
export async function cancelTrip(db: D1Database, id: number, notes: string): Promise<void> {
  if (notes.trim() === "") {
    await db.prepare("UPDATE trips SET status='CANCELADO' WHERE id=?").bind(id).run();
    return;
  }
  await db
    .prepare(
      `UPDATE trips
          SET status='CANCELADO',
              notes = TRIM(COALESCE(notes,'') || CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE char(10) END || ?)
        WHERE id=?`,
    )
    .bind(notes, id)
    .run();
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
            AND factura_numero IS NULL AND status = 'COMPLETADO'`,
      )
      .bind(numero, quien.when, quien.userId, ...tanda),
  );
  return cambios(await db.batch(stmts));
}

/**
 * Cuántos viajes de ese cliente quedaron sin facturar ANTES de la fecha desde la que se está
 * mirando. La pantalla abre en el 1° del mes; sin este número, el trabajo viejo sin facturar no
 * aparece en ningún lado y nadie se acuerda de que existe.
 */
export async function sinFacturarAntesDe(
  db: D1Database,
  provider: string,
  desde: string,
  templateId?: number,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM trips
        WHERE provider_name = ? AND status = 'COMPLETADO' AND factura_numero IS NULL
          AND date(started_at) < date(?)
          AND (? IS NULL OR template_id = ?)`,
    )
    .bind(provider, desde, templateId ?? null, templateId ?? null)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Saca la marca: "se va a equivocar alguna vez" y el viaje tiene que poder volver al resumen. */
export async function desmarcarFacturados(db: D1Database, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const stmts = enTandas(ids).map((tanda) =>
    db
      .prepare(
        `UPDATE trips SET factura_quitada = factura_numero,
                          factura_quitada_at = datetime('now'),
                          factura_numero=NULL, facturado_at=NULL, facturado_by=NULL,
                          pago_at=NULL, pago_by=NULL
          WHERE id IN (${tanda.map(() => "?").join(",")}) AND factura_numero IS NOT NULL`,
      )
      .bind(...tanda),
  );
  return cambios(await db.batch(stmts));
}

/**
 * Anota que el viaje se cobró.
 *
 * SÓLO AGREGA información: no toca la factura ni saca al viaje de ningún resumen. Y sólo a los que
 * ya tienen factura o referencia: sin eso no hay nada que cobrar, y un pago sin factura es un
 * viaje verde que nadie facturó. Los que ya figuran pagos no se pisan (se conserva quién y cuándo).
 *
 * Devuelve cuántos se marcaron de verdad, para poder avisarle de los que quedaron afuera.
 */
export async function marcarPagos(
  db: D1Database,
  ids: number[],
  quien: { userId: number; when: string },
): Promise<number> {
  if (!ids.length) return 0;
  const stmts = enTandas(ids).map((tanda) =>
    db
      .prepare(
        `UPDATE trips SET pago_at=?, pago_by=?
          WHERE id IN (${tanda.map(() => "?").join(",")})
            AND factura_numero IS NOT NULL AND pago_at IS NULL`,
      )
      .bind(quien.when, quien.userId, ...tanda),
  );
  return cambios(await db.batch(stmts));
}

/** Saca la marca de pago: "se va a equivocar alguna vez". La factura queda como estaba. */
export async function desmarcarPagos(db: D1Database, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const stmts = enTandas(ids).map((tanda) =>
    db
      .prepare(
        `UPDATE trips SET pago_at=NULL, pago_by=NULL
          WHERE id IN (${tanda.map(() => "?").join(",")}) AND pago_at IS NOT NULL`,
      )
      .bind(...tanda),
  );
  return cambios(await db.batch(stmts));
}

/**
 * Las facturas y referencias que tienen los viajes, para el desplegable de Viajes: 6029, 5566,
 * SAMAN… Sólo las que existen: una opción que no trae nada confunde. Se resuelve igual que los
 * clientes de las cargas (`listClientesDeCarga`).
 */
export async function listReferenciasDeFactura(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT factura_numero AS nombre FROM trips WHERE factura_numero IS NOT NULL")
    .all<{ nombre: string | null }>();
  return referenciasDeFactura(results ?? []);
}

/**
 * Junta las referencias sin repetir —"saman" y "SAMAN " son la misma— y las ordena como las
 * lee una persona: 5566 antes que 6029, y los números antes que los nombres. Queda la primera
 * forma en que apareció escrita.
 */
export function referenciasDeFactura(rows: { nombre: string | null }[]): string[] {
  const porClave = new Map<string, string>();
  for (const r of rows) {
    const nombre = (r.nombre ?? "").trim();
    if (!nombre) continue;
    const clave = nombre.toLocaleLowerCase("es");
    if (!porClave.has(clave)) porClave.set(clave, nombre);
  }
  return [...porClave.values()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base", numeric: true }),
  );
}

export async function activeTripForDriver(db: D1Database, driverId: number): Promise<Trip | null> {
  const r = await db
    .prepare(`${SELECT} WHERE t.driver_id = ? AND t.status = 'EN_CURSO' ORDER BY t.started_at DESC LIMIT 1`)
    .bind(driverId)
    .first<TripRow>();
  return r ? toTrip(r) : null;
}

/**
 * Corrige sólo la llegada de un viaje cerrado.
 *
 * `correrFecha` mueve salida y llegada juntas, que es lo que se quiere para un viaje cargado
 * con el día equivocado. Pero cuando el chofer se olvidó de cerrarlo, la salida está bien y la
 * llegada es la de cuando por fin tocó el botón: el viaje quedaba de varios días.
 */
export async function corregirLlegada(
  db: D1Database,
  id: number,
  finishedAt: string,
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare("UPDATE trips SET finished_at = ?, edited_by = ?, edited_at = ? WHERE id = ? AND status = 'COMPLETADO'")
    .bind(finishedAt, editor.userId, editor.when, id)
    .run();
}
