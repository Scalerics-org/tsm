import { describe, it, expect } from "vitest";
import { updateTemplate } from "../api/repos/templates";

/**
 * Mover una plantilla a otro cliente se lleva sus viajes.
 *
 * `trips.provider_name` se copia al crear el viaje. El 10/9 se movió el Mdeo–BU al grupo
 * "Montevideo - BU" y sus 11 viajes viejos quedaron en "Otros Viajes": la facturación, que
 * filtra por ese nombre, mostraba 3 viajes de 14.
 */

function fakeDB() {
  const lotes: { sql: string; binds: unknown[] }[][] = [];
  const db = {
    prepare(sql: string) {
      const stmt = { sql: sql.replace(/\s+/g, " ").trim(), binds: [] as unknown[] };
      return {
        ...stmt,
        bind(...b: unknown[]) {
          stmt.binds = b;
          return stmt;
        },
      };
    },
    batch: async (stmts: { sql: string; binds: unknown[] }[]) => {
      lotes.push(stmts);
      return stmts.map(() => ({ meta: { changes: 0 } }));
    },
  } as unknown as D1Database;
  return { db, lotes };
}

const PLANTILLA = {
  provider_id: 13,
  name: "Viaje Mdeo - Bella Unión",
  origin: "Mdeo",
  fields: [],
  dest_options: [],
} as any;

describe("mover una plantilla de cliente", () => {
  it("se lleva sus viajes, en el mismo lote que la edición", async () => {
    const { db, lotes } = fakeDB();
    await updateTemplate(db, 5, PLANTILLA);
    expect(lotes).toHaveLength(1);
    const [edicion, viajes] = lotes[0];
    expect(edicion.sql).toMatch(/^UPDATE trip_templates/);
    expect(viajes.sql).toContain("UPDATE trips SET provider_name = (SELECT name FROM providers WHERE id = ?)");
    expect(viajes.binds).toEqual([13, 5, 13]);
  });

  it("los viajes ya facturados no se mueven: están en una factura emitida con su cliente", async () => {
    const { db, lotes } = fakeDB();
    await updateTemplate(db, 5, PLANTILLA);
    expect(lotes[0][1].sql).toContain("factura_numero IS NULL");
  });

  it("sólo toca los viajes de ESA plantilla, y sólo si el nombre es otro", async () => {
    const { db, lotes } = fakeDB();
    await updateTemplate(db, 5, PLANTILLA);
    const sql = lotes[0][1].sql;
    expect(sql).toContain("WHERE template_id = ?");
    expect(sql).toContain("provider_name IS NOT (SELECT name FROM providers WHERE id = ?)");
  });
});
