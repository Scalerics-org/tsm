import type {
  CamposUbicacion,
  DestOption,
  TemplateField,
  TripSegmentInput,
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
  campos_ubicacion: string | null; // JSON
  multi_renglon: number;
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
    campos_ubicacion: r.campos_ubicacion ? parseJson<CamposUbicacion | null>(r.campos_ubicacion, null) : null,
    multi_renglon: !!r.multi_renglon,
    renglones_fijos: r.renglones_fijos ? parseJson<TripSegmentInput[]>(r.renglones_fijos, []) : null,
    pide_kilometros: !!r.pide_kilometros,
    viaje_vacio: !!r.viaje_vacio,
    foto_carga_requerida: !!r.foto_carga_requerida,
    truck_ids: r.truck_ids ? r.truck_ids.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    active: !!r.active,
  };
}

const SELECT = `
  SELECT tt.id, tt.provider_id, tt.name, tt.origin, tt.remite, tt.cargo_type,
         tt.dest_options, tt.fields, tt.arrival_photo_label, tt.campos_ubicacion,
         tt.multi_renglon, tt.renglones_fijos, tt.pide_kilometros, tt.viaje_vacio, tt.foto_carga_requerida, tt.active,
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
  campos_ubicacion: CamposUbicacion | null;
  multi_renglon: boolean;
  renglones_fijos: TripSegmentInput[] | null;
  pide_kilometros: boolean;
  viaje_vacio: boolean;
  foto_carga_requerida: boolean;
  truck_ids: number[];
  active: boolean;
}

function bindArgs(t: TemplateInput) {
  return [
    t.provider_id,
    t.name,
    t.origin,
    t.remite || null,
    t.cargo_type,
    JSON.stringify(t.dest_options ?? []),
    JSON.stringify(t.fields ?? []),
    t.arrival_photo_label || null,
    t.campos_ubicacion ? JSON.stringify(t.campos_ubicacion) : null,
    t.multi_renglon ? 1 : 0,
    t.renglones_fijos?.length ? JSON.stringify(t.renglones_fijos) : null,
    t.pide_kilometros ? 1 : 0,
    t.viaje_vacio ? 1 : 0,
    t.foto_carga_requerida ? 1 : 0,
    t.active ? 1 : 0,
  ];
}

export async function createTemplate(db: D1Database, t: TemplateInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trip_templates (provider_id, name, origin, remite, cargo_type, dest_options, fields, arrival_photo_label, campos_ubicacion, multi_renglon, renglones_fijos, pide_kilometros, viaje_vacio, foto_carga_requerida, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(...bindArgs(t))
    .run();
  return res.meta.last_row_id as number;
}

export async function updateTemplate(db: D1Database, id: number, t: TemplateInput): Promise<void> {
  await db
    .prepare(
      `UPDATE trip_templates SET provider_id=?, name=?, origin=?, remite=?, cargo_type=?, dest_options=?, fields=?, arrival_photo_label=?, campos_ubicacion=?, multi_renglon=?, renglones_fijos=?, pide_kilometros=?, viaje_vacio=?, foto_carga_requerida=?, active=?
       WHERE id=?`,
    )
    .bind(...bindArgs(t), id)
    .run();
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
