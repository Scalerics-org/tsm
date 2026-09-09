import type { FuelLog } from "../../shared/domain";
import { rangoDeSurtidas, type RangoCamion } from "../../shared/rango-surtidas";

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
export function surtidasARevisar(logs: FuelLog[]): RangoCamion {
  const r = rangoDeSurtidas(
    logs.map((f) => ({
      id: f.id,
      odometer_km: f.odometer_km,
      liters: f.liters,
      is_full: !!f.is_full,
      logged_at: f.logged_at,
    })),
  );
  const verificadas = new Set(logs.filter((f) => f.verificado_at).map((f) => f.id));
  const sospechosas = r.sospechosas.filter((s) => !verificadas.has(s.id));
  return {
    ...r,
    sospechosas,
    nivel: r.nivel === "revisar" && sospechosas.length === 0 ? "ok" : r.nivel,
  };
}
