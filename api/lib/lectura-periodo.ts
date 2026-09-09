/**
 * Mover una lectura del tacógrafo de un mes a otro.
 *
 * "Tiene que poder corregir la fecha del tacógrafo del mes." La oficina podía corregir el
 * kilometraje desde el primer día, pero no el MES: si el chofer sacaba la foto el 2 de
 * setiembre y era la que cierra agosto, quedaba anotada contra setiembre para siempre.
 *
 * El mes no es una etiqueta. `consumoDelPeriodo` decide con él a qué período van los
 * kilómetros, y `auditoriaKilometros` usa la lectura como extremo de DOS restas: la de su
 * propio mes y la del siguiente. Por eso mover una lectura toca hasta cuatro meses y no
 * puede dejar el odómetro yendo para atrás.
 *
 * La foto y su fecha real (`tomada_at`) NO se tocan: son la evidencia, y la pantalla las
 * muestra aparte justo para que se vea la ventana que de verdad se comparó.
 */

/** Un mes bien escrito: "YYYY-MM", con el mes entre 01 y 12. */
export function esPeriodo(v: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(v)) return false;
  const mes = Number(v.slice(5));
  return mes >= 1 && mes <= 12;
}

/** El mes que sigue. Diciembre pasa a enero del año que viene. */
export function periodoSiguiente(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5));
  const siguiente = mes === 12 ? 1 : mes + 1;
  const anioFinal = mes === 12 ? anio + 1 : anio;
  return `${anioFinal}-${String(siguiente).padStart(2, "0")}`;
}

export interface LecturaMinima {
  id: number;
  periodo: string;
  kilometraje: number;
}

/** Los vecinos en el tiempo, para no dar vuelta la ventana que compara la auditoría. */
export interface ContextoFecha {
  /** Hoy, "YYYY-MM-DD". Se pasa para poder probar el freno de fechas futuras. */
  hoy: string;
  /** `tomada_at` de la lectura anterior y de la siguiente, si existen. */
  previa?: string | null;
  siguiente?: string | null;
}

const soloDia = (v: string) => v.slice(0, 10);

/**
 * La fecha en que se sacó la foto del tacógrafo.
 *
 * `tomada_at` se llenaba con `datetime('now')` al guardar, y nadie podía decirle cuándo se
 * había sacado la foto. Mientras el chofer la sacaba parado en la ruta era lo mismo; con la
 * oficina cargando el atraso de atrás, pasó a ser la fecha en que se subió el archivo. Y la
 * auditoría compara justamente la ventana que va de una foto a la otra, así que estaba
 * comparando fechas de carga: de ahí salía el descuadre entero.
 *
 * LA HORA. Con sólo el día se guarda al MEDIODÍA, no a las 00:00 ni a las 23:59. Esta fecha
 * es a la vez el final de la ventana de su mes y el arranque de la del siguiente: cualquiera
 * de los dos extremos deja media jornada de viajes del lado equivocado, y el mediodía reparte
 * el error en vez de cargarlo todo de un lado.
 */
export function fechaDeFoto(
  valor: unknown,
  ctx: ContextoFecha,
): { ok: true; fecha: string } | { ok: false; motivo: string } {
  const texto = typeof valor === "string" ? valor.trim() : "";
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return { ok: false, motivo: "La fecha va como 2026-09-01." };

  const [, anio, mes, dia, hh, mm, ss] = m;
  const mesN = Number(mes);
  const diaN = Number(dia);
  if (mesN < 1 || mesN > 12 || diaN < 1 || diaN > 31) {
    return { ok: false, motivo: "Esa fecha no existe." };
  }

  const hora = hh ? `${hh}:${mm}:${ss ?? "00"}` : "12:00:00";
  const fecha = `${anio}-${mes}-${dia} ${hora}`;

  if (soloDia(fecha) > ctx.hoy) {
    return { ok: false, motivo: "Esa foto todavía no se sacó: la fecha está en el futuro." };
  }

  // Las fotos van una detrás de otra. Con una fuera de orden, la ventana que compara la
  // auditoría se da vuelta y pasa a medir kilómetros negativos sin que nada avise.
  if (ctx.previa && fecha < ctx.previa) {
    return {
      ok: false,
      motivo: `La lectura anterior es del ${soloDia(ctx.previa)}: ésta no puede ser de antes.`,
    };
  }
  if (ctx.siguiente && fecha > ctx.siguiente) {
    return {
      ok: false,
      motivo: `La lectura siguiente es del ${soloDia(ctx.siguiente)}: ésta no puede ser de después.`,
    };
  }

  return { ok: true, fecha };
}

/**
 * La clave de R2 lleva el mes adentro: `odometro/{camion}/{periodo}.{ext}`.
 *
 * Por eso mover una lectura de mes NO puede dejar la foto donde está. La fila quedaría
 * apuntando a la clave del mes viejo, y la próxima lectura que se cargue para ESE mes escribe
 * en la misma clave y la pisa: la lectura movida terminaría mostrando la foto de otra, sin
 * que nada avise. Es evidencia, y es lo único contra lo que se contrasta un kilometraje
 * corregido.
 *
 * Devuelve `null` cuando no hay foto o cuando la clave no tiene la forma esperada —una vieja,
 * cargada a mano—: en ese caso se deja como está, que es mejor que moverla a ciegas.
 */
export function claveMovida(r2Key: string | null, nuevoPeriodo: string): string | null {
  if (!r2Key) return null;
  const m = r2Key.match(/^(odometro\/\d+\/)\d{4}-\d{2}(\.[A-Za-z0-9]+)$/);
  if (!m) return null;
  return `${m[1]}${nuevoPeriodo}${m[2]}`;
}

export type Movimiento =
  | { ok: true; afectados: string[] }
  | { ok: false; motivo: string; status: 400 | 409 };

const km = (n: number) => Math.round(n).toLocaleString("es-UY");

/**
 * ¿Se puede mover esta lectura a `nuevoPeriodo`?
 *
 * `todas` son las lecturas del MISMO camión, incluida la que se mueve. Se compara contra los
 * vecinos reales —la lectura anterior y la siguiente que existan—, no contra el mes de al
 * lado: entre marzo y setiembre puede no haber nada, y mover setiembre a julio es legítimo.
 */
export function moverLectura(
  lectura: LecturaMinima,
  nuevoPeriodo: string,
  todas: LecturaMinima[],
): Movimiento {
  if (!esPeriodo(nuevoPeriodo)) {
    return { ok: false, status: 400, motivo: "El mes tiene que ser un mes válido.", };
  }
  if (nuevoPeriodo === lectura.periodo) return { ok: true, afectados: [] };

  const otras = todas.filter((l) => l.id !== lectura.id);

  const ocupado = otras.find((l) => l.periodo === nuevoPeriodo);
  if (ocupado) {
    return {
      ok: false,
      status: 409,
      motivo: `Ese mes ya tiene su lectura, de ${km(ocupado.kilometraje)} km. Hay una sola por camión por mes: corregí esa, o movela primero.`,
    };
  }

  // Los vecinos REALES alrededor de la posición nueva.
  const anteriores = otras.filter((l) => l.periodo < nuevoPeriodo).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const posteriores = otras.filter((l) => l.periodo > nuevoPeriodo).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const previa = anteriores[anteriores.length - 1] ?? null;
  const siguiente = posteriores[0] ?? null;

  if (previa && lectura.kilometraje < previa.kilometraje) {
    return {
      ok: false,
      status: 400,
      motivo: `En ese mes la lectura quedaría por debajo de la anterior (${km(previa.kilometraje)} km de ${previa.periodo}), y el odómetro no va para atrás. Fijate si el que está mal es el kilometraje.`,
    };
  }

  if (siguiente && lectura.kilometraje > siguiente.kilometraje) {
    return {
      ok: false,
      status: 400,
      motivo: `En ese mes la lectura quedaría por encima de la siguiente (${km(siguiente.kilometraje)} km de ${siguiente.periodo}), y el odómetro no va para atrás. Fijate si el que está mal es el kilometraje.`,
    };
  }

  // La lectura es extremo de su mes y del que sigue, en la posición vieja y en la nueva.
  const afectados = [
    lectura.periodo,
    periodoSiguiente(lectura.periodo),
    nuevoPeriodo,
    periodoSiguiente(nuevoPeriodo),
  ];
  return { ok: true, afectados: [...new Set(afectados)].sort() };
}
