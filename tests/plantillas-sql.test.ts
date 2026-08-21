import { describe, it, expect } from "vitest";
import { sqlDeAlta, sqlDeEdicion } from "../api/repos/templates";

/**
 * El bug que tiró la pantalla de plantillas entera: el INSERT listaba 17 columnas, la fila de
 * signos de pregunta tenía 16 y el array de binds otra cantidad. TypeScript no lo ve —
 * `.bind(...array)` acepta cualquier cantidad— así que el 500 aparecía recién al guardar, en
 * producción, y la oficina no podía crear ni editar NINGUNA plantilla.
 *
 * Estos tests fijan la invariante para que no pueda volver a pasar al agregar un campo.
 */
const plantilla = {
  provider_id: 1,
  name: "Viaje de prueba",
  origin: "Mdeo",
  remite: null,
  cargo_type: "Varios",
  dest_options: [],
  fields: [],
  arrival_photo_label: null,
  carga_photo_label: null,
  campos_ubicacion: null,
  multi_renglon: true,
  renglon_pide_ubicacion: false,
  renglon_pide_departamento: true,
  renglones_fijos: null,
  pide_kilometros: false,
  viaje_vacio: false,
  foto_carga_requerida: true,
  active: true,
} as any;

const signos = (sql: string) => (sql.match(/\?/g) ?? []).length;

describe("el SQL de plantillas no se puede desincronizar de los binds", () => {
  it("el alta tiene un signo de pregunta por cada bind", () => {
    const { sql, binds } = sqlDeAlta(plantilla);
    expect(signos(sql)).toBe(binds.length);
  });

  it("el alta tiene una columna por cada bind", () => {
    const { sql, binds } = sqlDeAlta(plantilla);
    const columnas = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",");
    expect(columnas.length).toBe(binds.length);
  });

  it("la edición tiene un signo de pregunta por cada bind, más el del WHERE id", () => {
    const { sql, binds } = sqlDeEdicion(plantilla);
    expect(signos(sql)).toBe(binds.length + 1);
  });

  it("el alta y la edición graban exactamente las mismas columnas", () => {
    const alta = sqlDeAlta(plantilla);
    const edicion = sqlDeEdicion(plantilla);
    expect(edicion.binds).toEqual(alta.binds);
  });

  it("las banderas viajan como 0/1 y no como true/false", () => {
    // SQLite guarda el booleano de JS como 1/0 igual, pero el resto del repo lee estas
    // columnas con `!!r.campo`: dejar un true suelto acá esconde el día que alguien las
    // compare con `= 1` en un WHERE.
    const { binds } = sqlDeAlta(plantilla);
    expect(binds).toContain(1);
    expect(binds).not.toContain(true);
    expect(binds).not.toContain(false);
  });

  it("graba el departamento por renglón", () => {
    const { sql } = sqlDeAlta(plantilla);
    expect(sql).toContain("renglon_pide_departamento");
  });
});
