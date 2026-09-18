import type { FuelLog } from "../../shared/domain";
import { rangoDeSurtidas, tramosDeConsumo, type RangoCamion, type SurtidaParaRango } from "../../shared/rango-surtidas";

/**
 * Lo que le queda por revisar a la oficina en un camión: lo raro, menos lo ya verificado.
 *
 * Es lo que cierra el círculo entre las dos cosas que pidió Rodrigo. El aviso dice cuál
 * boleta abrir; el tilde dice que ya la abrió. Sin este cruce, la surtida del GTP 4413 del
 * 31/08 le iba a aparecer en Control todos los días para siempre, y un aviso que no se puede
 * apagar se vuelve parte del decorado en una semana.
 *
 * LA LÍNEA DE BASE SE CALCULA CON TODAS, incluidas las verificadas: son el rendimiento real
 * del camión y sacarlas correría la mediana. Lo que se filtra es sólo lo que se reporta.
 *
 * Y si al filtrar no queda ninguna, el camión vuelve a `ok`: hoy no hay nada que mirar. No es
 * lo mismo que `sin_datos`, que es "todavía no sé".
 */
const paraRango = (logs: FuelLog[]): SurtidaParaRango[] =>
  logs.map((f) => ({
    id: f.id,
    odometer_km: f.odometer_km,
    liters: f.liters,
    is_full: !!f.is_full,
    logged_at: f.logged_at,
  }));

/**
 * El consumo de cada surtida, para la columna de la ficha del camión: el tramo que cierra cada
 * llenado. "Una columna con el consumo, así puedo observar visualmente cada camión" (Rodrigo,
 * 18/9). Es la misma cuenta que el aviso de abajo, a propósito: si fueran dos, la columna diría
 * un número y el aviso marcaría por otro. El primer llenado es la base y los chorros no cierran
 * tramo, así que ésos no vienen.
 */
export function consumoPorSurtida(logs: FuelLog[]): Record<number, { kml: number; km: number; litros: number }> {
  return Object.fromEntries(
    tramosDeConsumo(paraRango(logs)).map((t) => [t.id, { kml: t.kml, km: t.km, litros: t.litros }]),
  );
}

export function surtidasARevisar(logs: FuelLog[]): RangoCamion {
  const r = rangoDeSurtidas(paraRango(logs));
  const verificadas = new Set(logs.filter((f) => f.verificado_at).map((f) => f.id));
  const sospechosas = r.sospechosas.filter((s) => !verificadas.has(s.id));
  return {
    ...r,
    sospechosas,
    nivel: r.nivel === "revisar" && sospechosas.length === 0 ? "ok" : r.nivel,
  };
}

/**
 * Las surtidas que muestra la ficha del camión: las últimas `n`, más las que están para revisar
 * aunque sean más viejas.
 *
 * La ficha mostraba sólo las últimas 20. Una surtida marcada que quedara más atrás no se veía,
 * así que no había forma de tildarla, y quedaba en Control para siempre. El GTP 4413 ya tiene 19.
 *
 * Se respeta el orden en que llegan, de la más nueva a la más vieja: las que se suman son todas
 * más viejas que la última de las `n`, así que van al final sin desordenar nada.
 */
export function surtidasParaLaFicha<T extends { id: number }>(fuel: T[], marcadas: Set<number>, n = 20): T[] {
  const recientes = fuel.slice(0, n);
  const yaEstan = new Set(recientes.map((f) => f.id));
  return [...recientes, ...fuel.slice(n).filter((f) => marcadas.has(f.id) && !yaEstan.has(f.id))];
}
