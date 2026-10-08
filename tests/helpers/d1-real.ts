import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";

/**
 * Una D1 de verdad (la misma que levanta `wrangler dev --local`) para los tests que tienen que
 * comprobar SQL de verdad: una migración, o que un SELECT filtre lo que dice filtrar. Con un
 * `fakeDB` a mano el test pasa aunque la consulta esté mal escrita.
 *
 * Es lenta de arrancar (levanta workerd): usarla sólo donde el SQL es lo que se prueba.
 */

const CARPETA = path.resolve(__dirname, "../../migrations");

/** Parte un archivo .sql en sentencias: respeta las comillas y saca los comentarios `--`. */
export function sentenciasDe(sql: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let comilla: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (comilla) {
      actual += ch;
      if (ch === comilla) comilla = null;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      actual += "\n";
      continue;
    }
    if (ch === "'" || ch === '"') {
      comilla = ch;
      actual += ch;
      continue;
    }
    if (ch === ";") {
      if (actual.trim()) salida.push(actual.trim());
      actual = "";
      continue;
    }
    actual += ch;
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

export const archivosDeMigracion = () => readdirSync(CARPETA).filter((f) => f.endsWith(".sql")).sort();

export async function aplicar(db: D1Database, archivo: string): Promise<void> {
  const sql = readFileSync(path.join(CARPETA, archivo), "utf8");
  for (const s of sentenciasDe(sql)) await db.prepare(s).run();
}

/** Una base vacía con las migraciones aplicadas HASTA `hasta` (inclusive), o todas si no se pasa. */
export async function baseReal(hasta?: string): Promise<{ db: D1Database; cerrar: () => Promise<void> }> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "test-db" },
  });
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const f of archivosDeMigracion()) {
    if (hasta && f > hasta) break;
    await aplicar(db, f);
  }
  return { db, cerrar: () => mf.dispose() };
}
