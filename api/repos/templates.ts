import type { ExtraType, TripTemplate } from "../../shared/domain";

interface TemplateRow {
  id: number;
  provider_id: number;
  provider_name: string;
  name: string;
  origin: string;
  destinations: string; // JSON text
  cargo_type: string;
  requires_kilos: number;
  extra_label: string | null;
  extra_type: ExtraType;
  extra_required: number;
  active: number;
}

function toTemplate(r: TemplateRow): TripTemplate {
  let destinations: string[] = [];
  try {
    destinations = JSON.parse(r.destinations || "[]");
  } catch {
    destinations = [];
  }
  return {
    id: r.id,
    provider_id: r.provider_id,
    provider_name: r.provider_name,
    name: r.name,
    origin: r.origin,
    destinations,
    cargo_type: r.cargo_type,
    requires_kilos: !!r.requires_kilos,
    extra_label: r.extra_label,
    extra_type: r.extra_type,
    extra_required: !!r.extra_required,
    active: !!r.active,
  };
}

const SELECT = `
  SELECT tt.*, p.name AS provider_name
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
  destinations: string[];
  cargo_type: string;
  requires_kilos: boolean;
  extra_label: string | null;
  extra_type: ExtraType;
  extra_required: boolean;
  active: boolean;
}

function bindArgs(t: TemplateInput) {
  return [
    t.provider_id,
    t.name,
    t.origin,
    JSON.stringify(t.destinations ?? []),
    t.cargo_type,
    t.requires_kilos ? 1 : 0,
    t.extra_label || null,
    t.extra_type,
    t.extra_required ? 1 : 0,
    t.active ? 1 : 0,
  ];
}

export async function createTemplate(db: D1Database, t: TemplateInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trip_templates (provider_id, name, origin, destinations, cargo_type, requires_kilos, extra_label, extra_type, extra_required, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(...bindArgs(t))
    .run();
  return res.meta.last_row_id as number;
}

export async function updateTemplate(db: D1Database, id: number, t: TemplateInput): Promise<void> {
  await db
    .prepare(
      `UPDATE trip_templates SET provider_id=?, name=?, origin=?, destinations=?, cargo_type=?, requires_kilos=?, extra_label=?, extra_type=?, extra_required=?, active=?
       WHERE id=?`,
    )
    .bind(...bindArgs(t), id)
    .run();
}

export async function deleteTemplate(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trip_templates WHERE id=?").bind(id).run();
}
