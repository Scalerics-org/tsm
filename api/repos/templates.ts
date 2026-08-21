import type {
  CamposUbicacion,
  DestOption,
  TemplateField,
  RenglonFijo,
  TripTemplate,
} from "../../shared/domain";

interface TemplateRow {
  id: number;
  provider_id: number;
  provider_name: string;
  name: string;
  origin: string;
  remite: string | null;
  cargo_type: string;
  dest_options: string; // JSON
  fields: string; // JSON
  arrival_photo_label: string | null;
  carga_photo_label: string | null;
  campos_ubicacion: string | null; // JSON
  multi_renglon: number;
  renglon_pide_ubicacion: number;
  renglon_pide_departamento: number;
  renglones_fijos: string | null; // JSON
  pide_kilometros: number;
  viaje_vacio: number;
  foto_carga_requerida: number;
  active: number;
  truck_ids?: string; // group_concat de template_trucks
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s || "");
  } catch {
    return fallback;
  }
}

function toTemplate(r: TemplateRow): TripTemplate {
  return {
    id: r.id,
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    name: r.name,
    origin: r.origin,
    remite: r.remite,
    cargo_type: r.cargo_type,
    dest_options: parseJson<DestOption[]>(r.dest_options, []),
    fields: parseJson<TemplateField[]>(r.fields, []),
    arrival_photo_label: r.arrival_photo_label,
    carga_photo_label: r.carga_photo_label,
    campos_ubicacion: r.campos_ubicacion ? parseJson<CamposUbicacion | null>(r.campos_ubicacion, null) : null,
    multi_renglon: !!r.multi_renglon,
    renglon_pide_ubicacion: !!r.renglon_pide_ubicacion,
    renglon_pide_departamento: !!r.renglon_pide_departamento,
    renglones_fijos: r.renglones_fijos ? parseJson<RenglonFijo[]>(r.renglones_fijos, []) : null,
    pide_kilometros: !!r.pide_kilometros,
    viaje_vacio: !!r.viaje_vacio,
    foto_carga_requerida: !!r.foto_carga_requerida,
    truck_ids: r.truck_ids ? r.truck_ids.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    active: !!r.active,
  };
}

const SELECT = `
  SELECT tt.id, tt.provider_id, tt.name, tt.origin, tt.remite, tt.cargo_type,
         tt.dest_options, tt.fields, tt.arrival_photo_label, tt.carga_photo_label, tt.campos_ubicacion,
         tt.multi_renglon, tt.renglon_pide_ubicacion, tt.renglon_pide_departamento, tt.renglones_fijos, tt.pide_kilometros, tt.viaje_vacio, tt.foto_carga_requerida, tt.active,
         p.name AS provider_name,
         (SELECT group_concat(truck_id) FROM template_trucks WHERE template_id = tt.id) AS truck_ids
  FROM trip_templates tt JOIN providers p ON p.id = tt.provider_id
`;

export async function listTemplates(db: D1Database, onlyActive = false): Promise<TripTemplate[]> {
  const sql = SELECT + (onlyActive ? " WHERE tt.active = 1" : "") + " ORDER BY p.name, tt.name";
  const { results } = await db.prepare(sql).all<TemplateRow>();
  return (results ?? []).map(toTemplate);
}

export async function getTemplate(db: D1Database, id: number): Promise<TripTemplate | null> {
  const r = await db.prepare(`${SELECT} WHERE tt.id = ?`).bind(id).first<TemplateRow>();
  return r ? toTemplate(r) : null;
}

export interface TemplateInput {
  provider_id: number;
  name: string;
  origin: string;
  remite: string | null;
  cargo_type: string;
  dest_options: DestOption[];
  fields: TemplateField[];
  arrival_photo_label: string | null;
  carga_photo_label: string | null;
  campos_ubicacion: CamposUbicacion | null;
  multi_renglon: boolean;
  renglon_pide_ubicacion: boolean;
  renglon_pide_departamento: boolean;
  renglones_fijos: RenglonFijo[] | null;
  pide_kilometros: boolean;
  viaje_vacio: boolean;
  foto_carga_requerida: boolean;
  /** Camiones que ven la plantilla. `null` = el pedido no trajo el campo: no tocar. */
  truck_ids: number[] | null;
  active: boolean;
}

/**
 * Las columnas que se graban y su valor, en un solo lugar.
 *
 * Los tres tenían que coincidir a mano: la lista de columnas del INSERT, la fila de signos de
 * pregunta y el orden del array de binds. Agregar un campo y olvidarse de uno de los tres es
 * invisible para TypeScript —`.bind(...array)` acepta cualquier cantidad— y ya pasó: faltaba
 * `carga_photo_label` y toda la pantalla de plantillas tiraba 500 al guardar.
 *
 * Con los pares nombre/valor el SQL se arma solo y no se pueden desincronizar.
 */
function columnasYValores(t: TemplateInput): [string, unknown][] {
  return [
    ["provider_id", t.provider_id],
    ["name", t.name],
    ["origin", t.origin],
    ["remite", t.remite || null],
    ["cargo_type", t.cargo_type],
    ["dest_options", JSON.stringify(t.dest_options ?? [])],
    ["fields", JSON.stringify(t.fields ?? [])],
    ["arrival_photo_label", t.arrival_photo_label || null],
    ["carga_photo_label", t.carga_photo_label || null],
    ["campos_ubicacion", t.campos_ubicacion ? JSON.stringify(t.campos_ubicacion) : null],
    ["multi_renglon", t.multi_renglon ? 1 : 0],
    ["renglon_pide_ubicacion", t.renglon_pide_ubicacion ? 1 : 0],
    ["renglon_pide_departamento", t.renglon_pide_departamento ? 1 : 0],
    ["renglones_fijos", t.renglones_fijos?.length ? JSON.stringify(t.renglones_fijos) : null],
    ["pide_kilometros", t.pide_kilometros ? 1 : 0],
    ["viaje_vacio", t.viaje_vacio ? 1 : 0],
    ["foto_carga_requerida", t.foto_carga_requerida ? 1 : 0],
    ["active", t.active ? 1 : 0],
  ];
}

/** Expuesto sólo para el test que fija que el SQL y los binds no se puedan desincronizar. */
export function sqlDeAlta(t: TemplateInput): { sql: string; binds: unknown[] } {
  const pares = columnasYValores(t);
  return {
    sql: `INSERT INTO trip_templates (${pares.map(([c]) => c).join(", ")})
       VALUES (${pares.map(() => "?").join(", ")})`,
    binds: pares.map(([, v]) => v),
  };
}

export function sqlDeEdicion(t: TemplateInput): { sql: string; binds: unknown[] } {
  const pares = columnasYValores(t);
  return {
    sql: `UPDATE trip_templates SET ${pares.map(([c]) => `${c}=?`).join(", ")} WHERE id=?`,
    binds: pares.map(([, v]) => v),
  };
}

export async function createTemplate(db: D1Database, t: TemplateInput): Promise<number> {
  const { sql, binds } = sqlDeAlta(t);
  const res = await db.prepare(sql).bind(...binds).run();
  return res.meta.last_row_id as number;
}

export async function updateTemplate(db: D1Database, id: number, t: TemplateInput): Promise<void> {
  const { sql, binds } = sqlDeEdicion(t);
  await db.prepare(sql).bind(...binds, id).run();
}

/** Camiones que ven la plantilla. Lista vacía = la ven todos. */
export async function setTemplateTrucks(db: D1Database, id: number, truckIds: number[]): Promise<void> {
  const stmts = [db.prepare("DELETE FROM template_trucks WHERE template_id = ?").bind(id)];
  for (const t of truckIds) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO template_trucks (template_id, truck_id) VALUES (?, ?)").bind(id, t));
  }
  await db.batch(stmts);
}

export async function deleteTemplate(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trip_templates WHERE id=?").bind(id).run();
}
