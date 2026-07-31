import type { CamposUbicacion, DestOption, TemplateField, TripTemplate } from "../../shared/domain";

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
  active: number;
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
    active: !!r.active,
  };
}

const SELECT = `
  SELECT tt.id, tt.provider_id, tt.name, tt.origin, tt.remite, tt.cargo_type,
         tt.dest_options, tt.fields, tt.arrival_photo_label, tt.campos_ubicacion, tt.active,
         p.name AS provider_name
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
    t.active ? 1 : 0,
  ];
}

export async function createTemplate(db: D1Database, t: TemplateInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trip_templates (provider_id, name, origin, remite, cargo_type, dest_options, fields, arrival_photo_label, campos_ubicacion, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(...bindArgs(t))
    .run();
  return res.meta.last_row_id as number;
}

export async function updateTemplate(db: D1Database, id: number, t: TemplateInput): Promise<void> {
  await db
    .prepare(
      `UPDATE trip_templates SET provider_id=?, name=?, origin=?, remite=?, cargo_type=?, dest_options=?, fields=?, arrival_photo_label=?, campos_ubicacion=?, active=?
       WHERE id=?`,
    )
    .bind(...bindArgs(t), id)
    .run();
}

export async function deleteTemplate(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trip_templates WHERE id=?").bind(id).run();
}
