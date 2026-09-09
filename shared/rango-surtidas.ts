import { cadenaContinua, kmPorLitro } from "./domain";

/**
 * Qué surtidas mirar, en vez de mirarlas todas.
 *
 * "Yo voy a tener que chequear todos los litros que ellos echan con la factura, sí o sí."
 * Hoy son 70 surtidas; con los choferes cargando van a ser cientos por mes. Un control que
 * exige revisar el 100% se abandona solo en dos semanas, y el tilde de verificado pasa a ser
 * una lista de casillas que nadie llena.
 *
 * LA CUENTA VA AL REVÉS DE LO INTUITIVO: menos litros declarados = mejor consumo. Un chofer
 * que anota 250 donde cargó 300 pasa de 2,7 a 3,2 km/L y queda como el mejor de la flota. Los
 * km no los puede tocar —los respalda la foto del tacógrafo—, así que el litraje es el único
 * número que puede mover a mano, y moverlo lo beneficia.
 *
 * CADA CAMIÓN CONTRA SÍ MISMO. En producción el GTP 4382 anda en 3,22 km/L y el GTP 4325 en
 * 2,74: un umbral único para toda la flota marcaría siempre al mismo camión y nunca al que
 * declara mal. La referencia es la mediana de los tramos del propio camión.
 *
 * LO QUE ESTO **NO** DICE. Marca que los números de esa surtida no cierran entre sí. No dice
 * que alguien mintió, y no puede: las tres explicaciones —litraje declarado de menos, una
 * surtida que nunca se cargó, un dedazo en el odómetro— dan exactamente la misma señal. Quién
 * decide cuál es abre la boleta. Por eso los textos dicen qué revisar y no a quién culpar.
 */

/**
 * Cuánto se puede apartar de la mediana de su camión antes de que valga la pena mirarla.
 *
 * Corre sobre el km/L, no sobre los litros, y eso lo hace un poco más sensible de lo que el
 * número sugiere: declarar 17% de litros de menos sube el km/L un 20,5% —el rendimiento es
 * el inverso—, así que ya cae adentro del aviso. Está bien que caiga de ese lado.
 */
export const DESVIO_SURTIDA = 0.2;

/**
 * Cuántos tramos hacen falta para que la mediana signifique algo.
 *
 * Con dos o tres, la "mediana" es una de esas tres y marcaría a las otras dos. Preferimos
 * callarnos: un aviso que se equivoca las primeras semanas enseña a ignorarlo justo cuando
 * empieza a haber datos de verdad.
 */
export const TRAMOS_MINIMOS = 5;

export interface SurtidaParaRango {
  id: number;
  odometer_km: number;
  liters: number;
  is_full: boolean;
  /** "YYYY-MM-DD ..." */
  logged_at: string;
}

export interface TramoConsumo {
  /** La surtida que CIERRA el tramo: es la que trae los litros que no cierran. */
  id: number;
  logged_at: string;
  km: number;
  litros: number;
  kml: number;
}

export interface SurtidaSospechosa extends TramoConsumo {
  /** La referencia del propio camión contra la que se la comparó. */
  mediana: number;
  /** Los litros que ese tramo pedía al rendimiento habitual del camión. */
  litros_esperados: number;
  /** Esperados − declarados. Positivo = faltan litros. Negativo = sobran. */
  diferencia: number;
  /** Qué mirar, en una línea. Nunca a quién culpar. */
  motivo: string;
}

export interface RangoCamion {
  /** `revisar` = hay al menos una para abrir. `sin_datos` = todavía no hay línea de base. */
  nivel: "ok" | "revisar" | "sin_datos";
  mediana: number | null;
  tramos: number;
  sospechosas: SurtidaSospechosa[];
}

/**
 * Los tramos de llenado a llenado, la misma cuenta que ve el chofer (`fuelFeedback`).
 *
 * Un "chorro" no abre tramo: no llena el tanque, así que sus litros recién se terminan de
 * quemar en el tramo que cierra el llenado siguiente, y ahí van. Contar sólo los llenados
 * dejaría afuera esos litros y el camión aparecería rindiendo mejor de lo que rinde.
 */
export function tramosDeConsumo(logs: SurtidaParaRango[]): TramoConsumo[] {
  // Cronológico y no por odómetro: desde que la oficina puede corregirlo para abajo, el
  // odómetro dejó de ser monótono. El tiempo sí lo es.
  const enOrden = cadenaContinua(
    [...logs].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.odometer_km - b.odometer_km),
  );

  const tramos: TramoConsumo[] = [];
  let abre = enOrden.findIndex((l) => l.is_full);
  if (abre < 0) return tramos;

  for (let i = abre + 1; i < enOrden.length; i++) {
    if (!enOrden[i].is_full) continue;
    const km = enOrden[i].odometer_km - enOrden[abre].odometer_km;
    // El llenado que abre es la línea de base y sus litros son del tramo anterior.
    const litros = enOrden.slice(abre + 1, i + 1).reduce((s, l) => s + l.liters, 0);
    const kml = kmPorLitro(km, litros);
    if (kml != null) {
      tramos.push({ id: enOrden[i].id, logged_at: enOrden[i].logged_at, km, litros, kml });
    }
    abre = i;
  }
  return tramos;
}

/** La mediana, no el promedio. El porqué está en `rangoDeSurtidas`. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

const litrosTexto = (n: number) =>
  n.toLocaleString("es-UY", { maximumFractionDigits: 0 });

/**
 * Las surtidas de un camión que no cierran contra su propio rendimiento.
 *
 * POR QUÉ MEDIANA Y NO PROMEDIO. El promedio lo arrastra el mismo dato que estamos buscando:
 * cada declaración baja tira la media hacia ella, y con varias la referencia se corre lo
 * suficiente como para que ninguna parezca anormal. O sea que falla justo con el chofer que
 * lo hace seguido, que es el que más importa cazar. La mediana no se mueve.
 *
 * NO ES TEÓRICO, PASA EN LOS DATOS DE HOY. El GTP 4326 tiene cuatro tramos bajos (2,25 2,37
 * 2,40 2,51) que le corren el promedio de 2,92 a 2,78; contra ese promedio la surtida del
 * 09/09 queda adentro del umbral y no se marca. Contra la mediana salta. Lo mismo en el GTP
 * 4413: la mediana marca dos tramos, el promedio uno solo.
 */
export function rangoDeSurtidas(
  logs: SurtidaParaRango[],
  umbral = DESVIO_SURTIDA,
): RangoCamion {
  const tramos = tramosDeConsumo(logs);
  const med = mediana(tramos.map((t) => t.kml));

  if (med == null || med <= 0 || tramos.length < TRAMOS_MINIMOS) {
    return { nivel: "sin_datos", mediana: med, tramos: tramos.length, sospechosas: [] };
  }

  const sospechosas: SurtidaSospechosa[] = [];
  for (const t of tramos) {
    if (Math.abs(t.kml - med) / med <= umbral) continue;

    // Lo que ese tramo habría pedido al rendimiento habitual del camión. Es la traducción
    // del desvío a la unidad en la que está escrita la boleta: nadie discute un km/L, todos
    // pueden mirar si en el papel dice 486 o 332.
    const esperados = t.km / med;
    const diferencia = Math.round((esperados - t.litros) * 10) / 10;
    const km = t.km.toLocaleString("es-UY");

    // Los dos lados se dicen distinto porque se buscan distinto. Faltan litros: se abre la
    // boleta. Sobran: casi siempre es el odómetro o una surtida cargada dos veces.
    const motivo =
      diferencia > 0
        ? `${km} km con ${litrosTexto(t.litros)} L declarados: al rendimiento de este camión pedían ${litrosTexto(esperados)} L. Faltan ${litrosTexto(diferencia)} L — mirá la boleta, o si quedó una surtida sin cargar.`
        : `${km} km con ${litrosTexto(t.litros)} L declarados: ${litrosTexto(-diferencia)} L más de los que pedían ${litrosTexto(esperados)} L. Revisá el odómetro, o si la surtida quedó cargada dos veces.`;

    sospechosas.push({
      ...t,
      mediana: med,
      litros_esperados: Math.round(esperados * 10) / 10,
      diferencia,
      motivo,
    });
  }

  // La más grande primero: es por la que hay que empezar.
  sospechosas.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
  return {
    nivel: sospechosas.length ? "revisar" : "ok",
    mediana: med,
    tramos: tramos.length,
    sospechosas,
  };
}
