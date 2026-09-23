import { monthlyConsumption } from "./domain";
import { DESVIO_SURTIDA, TRAMOS_MINIMOS, rangoDeSurtidas, type SurtidaParaRango } from "./rango-surtidas";

/**
 * La verificación mensual del gasoil: ¿los litros del mes alcanzan para los kilómetros que hizo?
 *
 * "Tendríamos que ver una forma de verificar las surtidas… tomar todos los litros surtidos, tomar
 * todos los km recorridos y hacer un consumo mensual… puede pasar que ellos no registren nada de
 * una surtida." — Rodrigo, 22/9/2026.
 *
 * NO es contra la factura del proveedor ni contra el tacógrafo: es contra el propio camión. Si en
 * el mes hizo los km de siempre pero figuran menos litros de los que necesita para hacerlos, falta
 * una surtida. Y el sentido es que la oficina salga a buscar la boleta, por eso el resultado se
 * dice en litros y no en km/L.
 *
 * NO HAY UNA CUENTA NUEVA. Los km y los litros del mes son los de `monthlyConsumption` (por
 * calendario, con los chorros adentro), los mismos que ya muestra el Resumen; la referencia es la
 * mediana de los tramos del camión (`rangoDeSurtidas`), la misma con la que se marcan las surtidas
 * sueltas. Dos pantallas no pueden dar dos números distintos para el mismo camión.
 *
 * UNA ALARMA FALSA ACÁ ENSEÑA A NO MIRAR MÁS LA PANTALLA, así que ante la duda se calla:
 *   - el mes en curso siempre va a dar raro (le faltan surtidas por definición): no se juzga;
 *   - sin tramos suficientes no hay "lo habitual": se dice que todavía no alcanza para comparar;
 *   - un mes medido desde su propia primera surtida (el primero del camión, o con el odómetro
 *     corregido en el medio) tiene los km incompletos: tampoco se juzga;
 *   - una diferencia chica en litros no se nombra aunque el porcentaje sea grande.
 *
 * Los litros de la cámara de frío no entran: viven en otra tabla porque no mueven kilómetros.
 */

export type EstadoVerificacion = "ok" | "faltan" | "sobran" | "en_curso" | "sin_datos";

export interface VerificacionDelMes {
  month: string;
  estado: EstadoVerificacion;
  /** Litros que pedían los km del mes al rendimiento habitual. `null` si no se pudo comparar. */
  litros_esperados: number | null;
  /** Esperados − figurados. Positivo = faltan litros. Negativo = sobran. `null` si no se comparó. */
  diferencia: number | null;
  /** La frase corta, para leer de un vistazo y en litros: "Le faltan unos 970 L sin registrar". `null` si no hay nada que marcar. */
  titulo: string | null;
  /** La cuenta y qué hacer, en criollo. Nunca a quién culpar. */
  mensaje: string;
}

export interface VerificacionDelCamion {
  /** El km/L habitual de ESTE camión. `null` mientras no haya tramos suficientes. */
  mediana: number | null;
  tramos: number;
  meses: VerificacionDelMes[];
}

/**
 * Por debajo de esta diferencia no se habla, aunque el desvío pase el umbral: en un mes de poca
 * actividad el 20% son unos pocos litros, y mandar a buscar una boleta por eso es la alarma falsa.
 */
export const LITROS_MINIMOS_A_MENCIONAR = 50;

const redondeo = (n: number, paso: number) => Math.round(n / paso) * paso;
const litros = (n: number) => redondeo(n, 10).toLocaleString("es-UY");
const kml = (n: number) => n.toFixed(2).replace(".", ",");

export function verificarMeses(surtidas: SurtidaParaRango[], umbral = DESVIO_SURTIDA): VerificacionDelCamion {
  const rango = rangoDeSurtidas(surtidas, umbral);
  // `rangoDeSurtidas` devuelve la mediana aunque no alcancen los tramos: acá sólo vale si alcanzan.
  const mediana = rango.nivel === "sin_datos" ? null : rango.mediana;

  const meses = monthlyConsumption(surtidas).map((m): VerificacionDelMes => {
    const sinComparar = (estado: EstadoVerificacion, mensaje: string): VerificacionDelMes => ({
      month: m.month,
      estado,
      litros_esperados: null,
      diferencia: null,
      titulo: null,
      mensaje,
    });

    if (!m.closed) return sinComparar("en_curso", "Mes en curso: se compara cuando cierre.");
    if (mediana == null) {
      return sinComparar(
        "sin_datos",
        `Todavía no alcanza para comparar: hacen falta al menos ${TRAMOS_MINIMOS} tramos de llenado a llenado de este camión (hay ${rango.tramos}).`,
      );
    }
    if (m.base_propia) {
      return sinComparar("sin_datos", "Este mes se midió desde su primera surtida y le faltan kilómetros: no se compara.");
    }
    if (m.kml == null || m.km <= 0) return sinComparar("sin_datos", "No hay kilómetros y litros para medir este mes.");

    const esperados = m.km / mediana;
    const diferencia = esperados - m.liters;
    const desvio = m.kml / mediana - 1;
    const base = { month: m.month, litros_esperados: Math.round(esperados), diferencia: Math.round(diferencia) };

    if (Math.abs(desvio) <= umbral || Math.abs(diferencia) < LITROS_MINIMOS_A_MENCIONAR) {
      return { ...base, estado: "ok", titulo: null, mensaje: `Dentro de lo habitual: ${kml(m.kml)} km/L contra ${kml(mediana)} de este camión.` };
    }

    const cuenta = `${m.km.toLocaleString("es-UY")} km al rendimiento habitual (${kml(mediana)} km/L) piden unos ${litros(esperados)} L y figuran ${litros(m.liters)} L.`;
    if (diferencia > 0) {
      return {
        ...base,
        estado: "faltan",
        titulo: `Le faltan unos ${litros(diferencia)} L sin registrar`,
        // El mes se corta en la última surtida del anterior: la que nadie registró puede ser de
        // fines del mes pasado, y es lo que más desconcierta si no se dice.
        mensaje: `${cuenta} Buscá la boleta; puede ser una surtida de fin del mes pasado.`,
      };
    }
    return {
      ...base,
      estado: "sobran",
      titulo: `Figuran unos ${litros(-diferencia)} L de más`,
      mensaje: `${cuenta} Revisá si una surtida quedó cargada dos veces o con los litros mal tipeados.`,
    };
  });

  return { mediana, tramos: rango.tramos, meses };
}
