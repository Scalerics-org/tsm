#!/usr/bin/env node
/**
 * Prepara un respaldo de PRODUCCIÓN para cargarlo en la base del ambiente de prueba.
 *
 *   node scripts/prueba-desde-respaldo.mjs <respaldo.sql> [--salida <archivo.sql>]
 *
 * Sólo LEE el respaldo y ESCRIBE el archivo nuevo. No ejecuta nada contra Cloudflare ni contra
 * ninguna base: cargarlo lo hace una persona, con el comando que se imprime al final.
 *
 * El respaldo se saca con:
 *   npx wrangler d1 export logistica_db --remote --output <carpeta de respaldos>\tsm-AAAAMMDD-HHMM.sql
 *
 * Qué cambia y por qué (el detalle está en shared/respaldo-prueba.ts, con tests):
 *   - Sin las filas de push_subscriptions: son celulares reales, y una prueba no puede notificarlos.
 *   - Sin las filas de intentos_login: contadores de bloqueo de producción, no sirven en la prueba.
 *   - Se mantiene d1_migrations: así `npm run db:migrate:prueba` no intenta reaplicar todo.
 *
 * El archivo generado TIENE DATOS REALES (choferes, viajes, hashes de contraseñas). Va por defecto
 * junto al respaldo, en la carpeta del cliente, y se rechaza escribirlo dentro del repo.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argumentos(argv) {
  const out = { respaldo: "", salida: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--salida") out.salida = argv[++i] ?? "";
    else if (argv[i].startsWith("--")) throw new Error(`Argumento desconocido: ${argv[i]}`);
    else if (!out.respaldo) out.respaldo = argv[i];
    else throw new Error(`Sobra un argumento: ${argv[i]}`);
  }
  if (!out.respaldo) throw new Error("Falta la ruta del respaldo: node scripts/prueba-desde-respaldo.mjs <respaldo.sql>");
  return out;
}

/** Junto al respaldo, con el sufijo -para-prueba (tsm-20261013-1407.sql → tsm-20261013-1407-para-prueba.sql). */
function salidaPorDefecto(respaldo) {
  const { dir, name } = path.parse(respaldo);
  return path.join(dir, `${name}-para-prueba.sql`);
}

function estaDentroDelRepo(ruta) {
  const relativa = path.relative(RAIZ, ruta);
  return relativa === "" || (!relativa.startsWith("..") && !path.isAbsolute(relativa));
}

/** La cuenta vive en shared/ (con tests); se empaqueta con el esbuild que ya trae vite. */
async function cargarLaCopia() {
  const carpeta = mkdtempSync(path.join(tmpdir(), "tsm-prueba-"));
  const archivo = path.join(carpeta, "respaldo-prueba.mjs");
  await build({
    entryPoints: [path.join(RAIZ, "shared", "respaldo-prueba.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: archivo,
    logLevel: "silent",
  });
  return import(pathToFileURL(archivo).href);
}

async function main() {
  const args = argumentos(process.argv.slice(2));
  const respaldo = path.resolve(args.respaldo);
  const salida = path.resolve(args.salida || salidaPorDefecto(respaldo));

  if (salida === respaldo) throw new Error("La salida no puede ser el mismo archivo que el respaldo.");
  if (estaDentroDelRepo(salida)) {
    throw new Error(
      `No escribo ${salida}: está dentro del repo y el archivo tiene datos reales. Usá la carpeta de respaldos del cliente.`,
    );
  }

  const { prepararRespaldoParaPrueba } = await cargarLaCopia();
  const resultado = prepararRespaldoParaPrueba(readFileSync(respaldo, "utf8"));
  writeFileSync(salida, resultado.sql, "utf8");

  console.log(`Respaldo leído:  ${respaldo}`);
  console.log(`Archivo nuevo:   ${salida}`);
  console.log(`Instrucciones:   ${resultado.instrucciones}`);
  for (const [tabla, filas] of Object.entries(resultado.filasDescartadas)) {
    console.log(`Sin copiar:      ${filas} fila(s) de ${tabla}`);
  }
  console.log(`DELETE al final: ${resultado.tablasVaciadas.join(", ")}`);
  console.log("");
  console.log("Para cargarlo (base de prueba VACÍA, antes de migrar):");
  console.log(`  npx wrangler d1 execute logistica_db_prueba --env prueba --remote --file="${salida}"`);
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exit(1);
});
