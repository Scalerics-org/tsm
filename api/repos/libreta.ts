import {
  normalizeNombre,
  type CobroRegla,
  type CobroTipo,
  type LibretaEntry,
  type LibretaEstado,
  type LibretaTipo,
} from "../../shared/domain";

interface LibretaRow {
  id: number;
  tipo: LibretaTipo;
  nombre: string;
  provider_id: number | null;
  agrupador: number;
  estado: LibretaEstado;
  usos: number;
  created_by: number | null;
}

function toEntry(r: LibretaRow): LibretaEntry {
  return {
    id: r.id,
    tipo: r.tipo,
    nombre: r.nombre,
    provider_id: r.provider_id,
    agrupador: !!r.agrupador,
    estado: r.estado,
    usos: r.usos,
    created_by: r.created_by,
  };
}

export interface LibretaFilters {
  tipo?: LibretaTipo;
  providerId?: number;
  /** Excluye agrupadores ("Varios"): se usa al listar opciones de un renglón. */
  soloSeleccionables?: boolean;
  /** Deja los lugares de ese departamento y los que todavía no tienen ninguno. */
  departamentoId?: number;
  estado?: LibretaEstado;
}

/** Entradas del cliente + las globales, más usadas primero. */
export async function listLibreta(db: D1Database, f: LibretaFilters = {}): Promise<LibretaEntry[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.tipo) {
    where.push("tipo = ?");
    binds.push(f.tipo);
  }
  if (f.providerId != null) {
    where.push("(provider_id = ? OR provider_id IS NULL)");
    binds.push(f.providerId);
  }
  // Filtro por departamento, con los SIN CLASIFICAR incluidos a propósito.
  //
  // "Cuando pones agregar carga tiene que aparecer los departamentos y dónde cargó." Sin
  // esto, el chofer que carga en Artigas veía igual los 17 proveedores de Montevideo.
  //
  // El `IS NULL` es la red: los lugares que todavía no tienen departamento siguen
  // apareciendo, así el selector no le queda vacío a nadie mientras el dato se completa.
  if (f.departamentoId != null) {
    where.push("(departamento_id = ? OR departamento_id IS NULL)");
    binds.push(f.departamentoId);
  }
  if (f.soloSeleccionables) where.push("agrupador = 0");
  if (f.estado) {
    where.push("estado = ?");
    binds.push(f.estado);
  }
  const sql =
    "SELECT id, tipo, nombre, provider_id, agrupador, estado, usos, created_by FROM libreta" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY usos DESC, nombre";
  const { results } = await db.prepare(sql).bind(...binds).all<LibretaRow>();
  return (results ?? []).map(toEntry);
}

export async function getEntry(db: D1Database, id: number): Promise<LibretaEntry | null> {
  const r = await db
    .prepare("SELECT id, tipo, nombre, provider_id, agrupador, estado, usos, created_by FROM libreta WHERE id = ?")
    .bind(id)
    .first<LibretaRow>();
  return r ? toEntry(r) : null;
}

/**
 * Busca por nombre normalizado (ignora mayúsculas/acentos) dentro del alcance del cliente.
 * Evita dar de alta "Galpon" cuando ya existe "Galpón".
 */
export async function findByNombre(
  db: D1Database,
  tipo: LibretaTipo,
  nombre: string,
  providerId: number | null,
): Promise<LibretaEntry | null> {
  const candidatos = await listLibreta(db, { tipo, providerId: providerId ?? undefined });
  const key = normalizeNombre(nombre);
  return candidatos.find((e) => normalizeNombre(e.nombre) === key) ?? null;
}

export interface LibretaInput {
  tipo: LibretaTipo;
  nombre: string;
  provider_id: number | null;
  agrupador: boolean;
  estado: LibretaEstado;
  created_by: number | null;
  /** Departamento del lugar, si quien lo da de alta ya lo sabe. */
  departamento_id?: number | null;
}

/** Alta idempotente: si ya existe una equivalente, la devuelve en vez de duplicar. */
export async function createEntry(db: D1Database, e: LibretaInput): Promise<LibretaEntry> {
  const existente = await findByNombre(db, e.tipo, e.nombre, e.provider_id);
  if (existente) return existente;

  const res = await db
    .prepare(
      `INSERT INTO libreta (tipo, nombre, provider_id, agrupador, estado, created_by, departamento_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.tipo, e.nombre.trim(), e.provider_id, e.agrupador ? 1 : 0, e.estado, e.created_by,
      // El lugar nuevo nace con el departamento que el chofer ya había elegido: si lo agrega
      // parado en Artigas, es de Artigas. Sin esto el nombre que él escribe entra sin
      // clasificar y le vuelve a aparecer a todos.
      e.departamento_id ?? null,
    )
    .run();
  return (await getEntry(db, res.meta.last_row_id as number))!;
}

export interface LibretaPatch {
  nombre?: string;
  agrupador?: boolean;
  estado?: LibretaEstado;
}

export async function updateEntry(db: D1Database, id: number, p: LibretaPatch): Promise<void> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (p.nombre != null) {
    sets.push("nombre = ?");
    binds.push(p.nombre.trim());
  }
  if (p.agrupador != null) {
    sets.push("agrupador = ?");
    binds.push(p.agrupador ? 1 : 0);
  }
  if (p.estado != null) {
    sets.push("estado = ?");
    binds.push(p.estado);
  }
  if (!sets.length) return;
  await db.prepare(`UPDATE libreta SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
}

export async function deleteEntry(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM libreta WHERE id = ?").bind(id).run();
}

/** Suma un uso a cada nombre de libreta que aparece en un renglón. Los repetidos, una vez. */
export async function bumpUsos(db: D1Database, ids: (number | null | undefined)[]): Promise<void> {
  const unicos = [...new Set(ids.filter((x): x is number => typeof x === "number"))];
  if (!unicos.length) return;
  await db.batch(unicos.map((id) => db.prepare("UPDATE libreta SET usos = usos + 1 WHERE id = ?").bind(id)));
}

/**
 * Reglas de cobro que dependen de esta entrada.
 *
 * `cobro_reglas` apunta a `libreta` con ON DELETE CASCADE, así que borrar un nombre se lleva
 * sus reglas sin decir nada. La pantalla ya tenía el aviso escrito, pero colgaba de `usos`,
 * que nunca subía: siempre decía 0 y nunca frenaba a nadie.
 */
export async function reglasQueDependen(db: D1Database, id: number): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM cobro_reglas WHERE remitente_id = ? OR destinatario_id = ?")
    .bind(id, id)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Fusiona `id` dentro de `intoId`: mueve las reglas de cobro que no colisionen,
 * suma los usos y borra el duplicado. Es lo que mantiene los reportes limpios.
 */
export async function mergeEntries(db: D1Database, id: number, intoId: number): Promise<void> {
  if (id === intoId) return;
  await db.batch([
    db.prepare("UPDATE OR IGNORE cobro_reglas SET remitente_id = ? WHERE remitente_id = ?").bind(intoId, id),
    db.prepare("UPDATE OR IGNORE cobro_reglas SET destinatario_id = ? WHERE destinatario_id = ?").bind(intoId, id),
    db.prepare("UPDATE libreta SET usos = usos + (SELECT usos FROM libreta WHERE id = ?) WHERE id = ?").bind(id, intoId),
    db.prepare("DELETE FROM libreta WHERE id = ?").bind(id),
  ]);
}

// ── Reglas de facturación ──

export async function listReglas(db: D1Database): Promise<CobroRegla[]> {
  const { results } = await db
    .prepare("SELECT id, remitente_id, destinatario_id, cobro_tipo, cobro_a FROM cobro_reglas")
    .all<CobroRegla>();
  return results ?? [];
}

export interface ReglaInput {
  remitente_id: number;
  destinatario_id: number | null;
  cobro_tipo: CobroTipo;
  cobro_a: string;
}

/** Upsert por (remitente, destinatario): re-definir una combinación pisa la anterior. */
export async function upsertRegla(db: D1Database, r: ReglaInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cobro_reglas (remitente_id, destinatario_id, cobro_tipo, cobro_a)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(remitente_id, destinatario_id)
       DO UPDATE SET cobro_tipo = excluded.cobro_tipo, cobro_a = excluded.cobro_a`,
    )
    .bind(r.remitente_id, r.destinatario_id, r.cobro_tipo, r.cobro_a)
    .run();
}

export async function deleteRegla(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM cobro_reglas WHERE id = ?").bind(id).run();
}

/**
 * Anota de qué departamento es un lugar de carga, la primera vez que alguien lo dice.
 *
 * El chofer elige "Artigas" y después "TIMBER": con eso ya sabemos que TIMBER es de Artigas,
 * sin que nadie tenga que cargar una tabla. Así el selector se va afinando solo con el uso.
 *
 * Sólo escribe si está en NULL: lo que ya dijo la oficina no se pisa con lo que tocó un
 * chofer. Y si el nombre del departamento no existe, no hace nada — mejor sin dato que con
 * uno inventado.
 */
export async function aprenderDepartamento(
  db: D1Database,
  pares: { entryId: number; departamento: string }[],
): Promise<void> {
  const utiles = pares.filter((p) => p.entryId != null && p.departamento?.trim());
  if (!utiles.length) return;
  await db.batch(
    utiles.map((p) =>
      db
        .prepare(
          `UPDATE libreta
              SET departamento_id = (SELECT id FROM departamentos WHERE nombre = ?)
            WHERE id = ?
              AND departamento_id IS NULL
              AND EXISTS (SELECT 1 FROM departamentos WHERE nombre = ?)`,
        )
        .bind(p.departamento.trim(), p.entryId, p.departamento.trim()),
    ),
  );
}
