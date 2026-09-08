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
