/**
 * Arma, a partir de un respaldo de PRODUCCIÓN, el .sql con el que se carga la base del ambiente de
 * prueba. Es la parte pura (texto adentro, texto afuera); leer y escribir archivos lo hace
 * `scripts/prueba-desde-respaldo.mjs`.
 *
 * La prueba arranca como COPIA de producción para que Rodrigo entre con su mismo usuario y vea sus
 * camiones y viajes. Pero hay cosas que NO se pueden copiar:
 *
 * - `push_subscriptions`: son los celulares reales de la gente (cada fila es un endpoint de push).
 *   Si pasaran a la prueba, un cambio que se esté probando le podría mandar una notificación al
 *   celular de un chofer real. La TABLA sí se crea (la app la usa); lo que no entra son las filas.
 * - `intentos_login`: los contadores de bloqueo de login por patente e IP. Copiarlos dejaría gente
 *   bloqueada en la prueba por intentos fallidos de producción, y no sirven para nada ahí.
 *
 * `d1_migrations` SÍ se copia, a propósito: el respaldo trae el esquema ya migrado y la lista de
 * migraciones aplicadas. Con ella, el `db:migrate:prueba` de después sólo aplica las que falten, en
 * vez de intentar crear todo de nuevo. Por eso el .sql se carga ANTES de migrar.
 *
 * El .sql empieza borrando (`DROP TABLE IF EXISTS`, hijas antes que padres) las tablas que va a crear:
 * en una base vacía no hace nada, y en una prueba que ya tiene datos la deja como la copia nueva, que
 * es como se la "refresca". Sólo toca las tablas del respaldo: una tabla que exista en la prueba y no
 * en producción (una migración que producción todavía no tiene) se queda, y en ese caso conviene
 * recrear la base de prueba en vez de refrescarla.
 *
 * Qué se vacía se decide acá y nada más: si aparece una tabla nueva con datos de contacto o de
 * dispositivos, se agrega a TABLAS_QUE_NO_SE_COPIAN y los tests la cuidan.
 */

/**
 * LA TRABA. El .sql borra todas las tablas (DROP TABLE) antes de crearlas, y las bases de producción y de prueba
 * se llaman casi igual (`logistica_db` y `logistica_db_prueba`): un nombre mal escrito en el comando de carga
 * borraría producción entera. Por eso la PRIMERA instrucción toca una tabla marca que existe SÓLO en la base de
 * prueba (se crea a mano una vez, `docs`/README paso 0; no va en migrations/ para que producción no la tenga
 * nunca). En una base sin la marca esa instrucción da "no such table" y la carga se corta ahí, antes de borrar nada.
 * Nunca se hace DROP de la marca: el refresco siguiente la necesita.
 */
export const TABLA_MARCA = "_solo_prueba";
export const TRABA_SOLO_PRUEBA = `INSERT OR REPLACE INTO ${TABLA_MARCA} (id) VALUES (1);`;

/** Tablas cuyos datos NO pasan a la prueba (la tabla sí se crea). */
export const TABLAS_QUE_NO_SE_COPIAN: readonly string[] = ["push_subscriptions", "intentos_login"];

export interface ResultadoDeLaCopia {
  /** El .sql para la base de prueba. */
  sql: string;
  /** Cuántas filas (INSERT) se descartaron, por tabla. */
  filasDescartadas: Record<string, number>;
  /** Las tablas a las que se les puso un DELETE al final, por las dudas. */
  tablasVaciadas: string[];
  /** Cuántas instrucciones tiene el .sql de salida (sin contar las del final). */
  instrucciones: number;
}

/**
 * Corta el respaldo en instrucciones. Una instrucción termina en `;` FUERA de un texto entre comillas:
 * hay textos (observaciones, direcciones) con `;` y con saltos de línea adentro, y cortar por línea
 * los rompería. En SQL una comilla simple dentro de un texto se escribe doble (`''`), que acá no
 * hace falta tratar aparte: cierra y vuelve a abrir.
 */
export function partirInstrucciones(sql: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let enTexto = false;
  let enIdentificador = false;
  for (const c of sql) {
    actual += c;
    if (enTexto) {
      if (c === "'") enTexto = false;
    } else if (enIdentificador) {
      if (c === '"') enIdentificador = false;
    } else if (c === "'") {
      enTexto = true;
    } else if (c === '"') {
      enIdentificador = true;
    } else if (c === ";") {
      salida.push(actual.trim());
      actual = "";
    }
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

const NOMBRE = String.raw`["\`\[]?([A-Za-z_][A-Za-z0-9_]*)["\`\]]?`;
const INSERT = new RegExp(String.raw`^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+${NOMBRE}`, "i");
const CREATE_TABLE = new RegExp(String.raw`^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NOMBRE}`, "i");

/** A qué tabla inserta la instrucción, en minúsculas, o null si no es un INSERT. */
export function tablaDelInsert(instruccion: string): string | null {
  return INSERT.exec(instruccion)?.[1]?.toLowerCase() ?? null;
}

const DELETE_DE_TABLA = new RegExp(String.raw`^DELETE\s+FROM\s+${NOMBRE}\s*;$`, "i");

function tablaCreada(instruccion: string): string | null {
  return CREATE_TABLE.exec(instruccion)?.[1]?.toLowerCase() ?? null;
}

const REFERENCIA = /REFERENCES\s+["`[]?([A-Za-z_][A-Za-z0-9_]*)["`\]]?/gi;

/**
 * Las tablas en un orden en que cada una viene DESPUÉS de las que referencia (sus claves foráneas):
 * `trucks` antes que `drivers`, `drivers` antes que `users`, y así. Estable: las que no dependen de
 * nada conservan el orden del respaldo. Si hubiera un ciclo, lo que queda va al final como estaba.
 */
export function tablasPorDependencia(instrucciones: string[]): string[] {
  const deps = new Map<string, Set<string>>();
  for (const i of instrucciones) {
    const tabla = tablaCreada(i);
    if (!tabla) continue;
    const padres = new Set([...i.matchAll(REFERENCIA)].map((m) => m[1].toLowerCase()));
    padres.delete(tabla); // una tabla que se referencia a sí misma no se espera a sí misma
    deps.set(tabla, padres);
  }
  const orden: string[] = [];
  const pendientes = new Set(deps.keys());
  while (pendientes.size > 0) {
    const lista = [...pendientes].filter((t) => [...deps.get(t)!].every((p) => !pendientes.has(p)));
    if (lista.length === 0) {
      orden.push(...pendientes);
      break;
    }
    // De a una, la primera en el orden del respaldo: así el resultado no salta de lugar sin necesidad.
    orden.push(lista[0]);
    pendientes.delete(lista[0]);
  }
  return orden;
}

/**
 * Esquema primero, datos después, y los datos en orden de dependencias. El volcado de D1 trae los
 * INSERT en el orden en que están las tablas (`drivers` antes que `trucks`) y se apoya en
 * `PRAGMA defer_foreign_keys` para que no moleste; ese pragma sólo vale dentro de una transacción, y
 * según cómo se cargue el archivo (por ejemplo en local) cada instrucción va por su cuenta y falla
 * con "no such table". Ordenado así carga igual de las dos maneras.
 */
function ordenarParaCargar(instrucciones: string[]): string[] {
  const inserts = new Map<string, string[]>();
  const pragmas: string[] = [];
  const esquema: string[] = [];
  const secuencias: string[] = [];
  for (const i of instrucciones) {
    const tabla = tablaDelInsert(i);
    if (/^PRAGMA\b/i.test(i)) pragmas.push(i);
    else if (tabla === "sqlite_sequence" || /^DELETE\s+FROM\s+["`[]?sqlite_sequence/i.test(i)) secuencias.push(i);
    else if (tabla) inserts.set(tabla, [...(inserts.get(tabla) ?? []), i]);
    else esquema.push(i);
  }
  const orden = tablasPorDependencia(instrucciones);
  const resto = [...inserts.keys()].filter((t) => !orden.includes(t));
  const datos = [...orden, ...resto].flatMap((t) => inserts.get(t) ?? []);
  // Las hijas se borran antes que las padres: D1 no deja borrar una tabla a la que otra todavía apunta con filas.
  const borrados = [...orden].reverse().map((t) => `DROP TABLE IF EXISTS ${t};`);
  return [...pragmas, ...borrados, ...esquema, ...datos, ...secuencias];
}

export function prepararRespaldoParaPrueba(respaldo: string): ResultadoDeLaCopia {
  const instrucciones = partirInstrucciones(respaldo);
  const creadas = new Set(instrucciones.map(tablaCreada).filter((t): t is string => t !== null));
  if (!creadas.has("d1_migrations") || !creadas.has("trips")) {
    throw new Error(
      "Esto no parece un respaldo de TSM hecho con `wrangler d1 export`: no trae las tablas d1_migrations y trips.",
    );
  }

  const aVaciar = new Set(TABLAS_QUE_NO_SE_COPIAN);
  const filasDescartadas: Record<string, number> = {};
  const quedan: string[] = [];
  for (const instruccion of instrucciones) {
    // Un DELETE de estas tablas de una pasada anterior se saca: se vuelve a poner uno solo al final.
    const borrada = DELETE_DE_TABLA.exec(instruccion)?.[1]?.toLowerCase();
    if (borrada && aVaciar.has(borrada)) continue;
    // Los DROP de una pasada anterior también: se vuelven a armar con el orden de ahora.
    if (/^DROP\s+TABLE\s+IF\s+EXISTS\b/i.test(instruccion)) continue;
    // La marca es de la base de prueba: nunca se copia, ni se crea ni se borra desde un respaldo (si alguien
    // respaldara la prueba, o pasara por acá su propia salida, la traba se arma una sola vez, abajo).
    if (tablaCreada(instruccion) === TABLA_MARCA || tablaDelInsert(instruccion) === TABLA_MARCA) continue;
    const tabla = tablaDelInsert(instruccion);
    if (tabla && aVaciar.has(tabla)) {
      filasDescartadas[tabla] = (filasDescartadas[tabla] ?? 0) + 1;
      continue;
    }
    quedan.push(instruccion);
  }

  // El DELETE del final es un cinturón por si algún día el respaldo trae las filas de otra forma
  // (un INSERT con otra sintaxis que no reconozcamos). Sólo sobre tablas que el propio respaldo crea.
  const tablasVaciadas = TABLAS_QUE_NO_SE_COPIAN.filter((t) => creadas.has(t));
  const delFinal = tablasVaciadas.map((t) => `DELETE FROM ${t};`);

  return {
    sql: [TRABA_SOLO_PRUEBA, ...ordenarParaCargar(quedan), ...delFinal].join("\n") + "\n",
    filasDescartadas,
    tablasVaciadas,
    instrucciones: quedan.length,
  };
}
