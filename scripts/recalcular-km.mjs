#!/usr/bin/env node
/**
 * Recalcula los km ESTIMADOS de los viajes de un mes con la regla que suma todas las paradas.
 *
 *   node scripts/recalcular-km.mjs --mes 2026-09              # lee la base LOCAL
 *   node scripts/recalcular-km.mjs --mes 2026-09 --remote     # lee producción (sólo SELECT)
 *
 * NO ESCRIBE EN NINGUNA BASE. Hace un único SELECT y deja dos archivos:
 *   recalculo-km-<mes>.csv  el antes/después por viaje (y los que no se tocan, con el motivo)
 *   recalculo-km-<mes>.sql  los UPDATE, para aplicar a mano DESPUÉS de hacer un respaldo
 *
 * Para aplicarlo (lo hace una persona, con respaldo hecho):
 *   npx wrangler d1 execute logistica_db --remote --file=<el .sql>
 *
 * La cuenta vive en shared/recalculo-km.ts (con tests): acá sólo se lee, se llama y se escribe.
 * Se empaqueta con el esbuild que ya trae vite, así no hay una segunda copia de la regla.
 *
 * Los viajes se toman por el día en que arrancaron (`started_at`, UTC, como en el resto del sistema).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA_POR_DEFECTO = "C:\\Users\\gonza\\Desktop\\Scalerics\\Proyectos\\Clientes\\TSM\\respaldos";

function argumentos(argv) {
  const out = { mes: "", remoto: false, salida: SALIDA_POR_DEFECTO };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mes") out.mes = argv[++i] ?? "";
    else if (argv[i] === "--remote") out.remoto = true;
    else if (argv[i] === "--salida") out.salida = argv[++i] ?? out.salida;
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(out.mes)) throw new Error("Falta --mes AAAA-MM (por ejemplo --mes 2026-09).");
  return out;
}

function mesSiguiente(mes) {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** Un solo SELECT. El mes ya está validado contra AAAA-MM, así que no hay nada que inyectar. */
function consulta(mes) {
  return `SELECT t.id, t.started_at, t.status, t.origin, t.destination, t.kilometros, t.segments, t.descargas,
       t.edited_by, tr.plate AS patente, COALESCE(tt.pide_kilometros, 0) AS pide_kilometros
  FROM trips t
  LEFT JOIN trucks tr ON tr.id = t.truck_id
  LEFT JOIN trip_templates tt ON tt.id = t.template_id
 WHERE t.started_at >= '${mes}-01' AND t.started_at < '${mesSiguiente(mes)}-01'
 ORDER BY t.started_at, t.id`;
}

function leerViajes(mes, remoto) {
  const sql = consulta(mes).replace(/\s+/g, " ").trim();
  if (!/^SELECT\b/i.test(sql) || /;/.test(sql)) throw new Error("Sólo se permite un SELECT.");
  // Con shell, los argumentos no se entrecomillan solos: el SELECT (sólo lleva comillas simples) va entre dobles.
  const r = spawnSync(
    `npx wrangler d1 execute logistica_db ${remoto ? "--remote" : "--local"} --json --command "${sql}"`,
    { cwd: RAIZ, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`wrangler falló:\n${r.stderr || r.stdout}`);
  const inicio = r.stdout.indexOf("[");
  const respuesta = JSON.parse(r.stdout.slice(inicio));
  const filas = respuesta?.[0]?.results;
  if (!Array.isArray(filas)) throw new Error("La respuesta de wrangler no trae filas.");
  const json = (t) => {
    if (t == null || t === "") return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  return filas.map((f) => ({
    id: f.id,
    started_at: f.started_at,
    patente: f.patente,
    status: f.status,
    origin: f.origin ?? "",
    destination: f.destination ?? "",
    kilometros: f.kilometros == null ? null : Number(f.kilometros),
    segments: json(f.segments) ?? [],
    descargas: json(f.descargas),
    pide_kilometros: !!f.pide_kilometros,
    edited_by: f.edited_by ?? null,
  }));
}

async function cargarCuenta() {
  const carpeta = mkdtempSync(path.join(tmpdir(), "tsm-recalculo-"));
  const archivo = path.join(carpeta, "recalculo-km.mjs");
  await build({
    entryPoints: [path.join(RAIZ, "shared", "recalculo-km.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: archivo,
    logLevel: "silent",
  });
  return import(pathToFileURL(archivo).href);
}

async function main() {
  const { mes, remoto, salida } = argumentos(process.argv.slice(2));
  console.log(`Leyendo los viajes de ${mes} de la base ${remoto ? "REMOTA (producción)" : "local"}. SOLO LECTURA.`);
  const viajes = leerViajes(mes, remoto);
  const { planDeRecalculo, csvDelPlan, sqlDelPlan } = await cargarCuenta();
  const plan = planDeRecalculo(viajes);

  mkdirSync(salida, { recursive: true });
  const base = path.join(salida, `recalculo-km-${mes}`);
  writeFileSync(`${base}.csv`, "\uFEFF" + csvDelPlan(plan), "utf8");
  writeFileSync(`${base}.sql`, sqlDelPlan(plan), "utf8");

  const porMotivo = {};
  for (const n of plan.noTocados) porMotivo[n.motivo] = (porMotivo[n.motivo] ?? 0) + 1;
  const suma = plan.cambios.reduce((s, c) => s + c.diferencia, 0);
  console.log(`Viajes leídos: ${viajes.length}`);
  console.log(`A recalcular: ${plan.cambios.length} (${suma >= 0 ? "+" : ""}${suma} km en total)`);
  console.log(`Sin tocar: ${plan.noTocados.length}`, porMotivo);
  console.log(`CSV: ${base}.csv`);
  console.log(`SQL: ${base}.sql  (NO se aplicó: revisar el CSV, hacer respaldo y aplicar a mano)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
