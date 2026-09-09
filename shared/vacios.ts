import { kmEstimados } from "./distancias";

/**
 * Los viajes vacíos, deducidos de los viajes que ya están cargados.
 *
 * "Cada camión debería guardar el último lugar donde descargó (x) y el nuevo lugar de carga
 * (y). Si no son el mismo, eso quiere decir que hizo un viaje vacío desde x a y."
 *
 * POR QUÉ DEDUCIRLOS Y NO PEDIRLOS. Las plantillas de viaje vacío existen desde hace un mes y
 * NUNCA se usaron: cero viajes vacíos cargados en toda la historia. Pedirle al chofer un
 * registro más por cada retorno ya se probó y no funciona. El dato, en cambio, ya está: entre
 * dónde descargó y dónde volvió a cargar.
 *
 * LOS NOMBRES SE NORMALIZAN SOLOS. `kmEstimados` compara los lugares ya normalizados, así que
 * "Montevideo", "Mdeo" y "MONTEVIDEO" dan 0 km entre sí. No es un detalle: en los datos reales
 * de un solo camión conviven las tres formas, y sin esto dos de cada ocho tramos deducidos
 * serían vacíos inventados por una diferencia de tipeo.
 */

/**
 * Por debajo de esto no es un viaje: es moverse dentro de la misma zona.
 *
 * "Tengo dudas con los km. X Mdeo cuando hacen km vacíos dentro de Mdeo... le pondría arriba
 * de 70." El umbral lo fijó el cliente.
 */
export const KM_VACIO_MINIMO = 70;

export interface ViajeParaVacios {
  id: number;
  started_at: string;
  origin: string;
  destination: string;
  /** Los km reales que cargó el chofer. `null` cuando no los puso. */
  kilometros: number | null;
}

/**
 * `retorno` deshace el viaje anterior: vuelve a cargar donde ya había cargado, sin nada en el
 * medio. `reposicion` es ir a buscar carga a otro lado.
 */
export type TipoVacio = "retorno" | "reposicion";

export interface TramoVacio {
  desde: string;
  hasta: string;
  /** `null` cuando la app no conoce alguno de los dos lugares: no se inventa un número. */
  km: number | null;
  tipo: TipoVacio;
  /** Los viajes que lo encierran, para poder ir a mirarlos. */
  despues_de: number;
  antes_de: number;
}

/**
 * Los tramos vacíos de UN camión, en orden.
 *
 * Los viajes se ordenan por fecha antes de comparar: el orden en que lleguen no puede cambiar
 * el resultado.
 *
 * El kilometraje de un `retorno` sale del viaje que deshace y no de la estimación —"el retorno
 * tenemos q ponerle los mismos kilómetros q el viaje"—, porque ése es un número real que el
 * chofer midió con el tacógrafo. La estimación queda de respaldo para cuando el viaje no
 * tenga los km cargados.
 */
export function vaciosEntreViajes(viajes: ViajeParaVacios[]): TramoVacio[] {
  const enOrden = [...viajes].sort(
    (a, b) => a.started_at.localeCompare(b.started_at) || a.id - b.id,
  );

  const tramos: TramoVacio[] = [];
  for (let i = 0; i < enOrden.length - 1; i++) {
    const viaje = enOrden[i];
    const siguiente = enOrden[i + 1];

    const estimado = kmEstimados(viaje.destination, siguiente.origin);
    // 0 km es el mismo lugar escrito distinto: no hubo viaje. `null` es un lugar que la app
    // no conoce, que es otra cosa —hay tramo, no se sabe cuánto— y sí se reporta.
    if (estimado === 0) continue;
    if (estimado != null && estimado < KM_VACIO_MINIMO) continue;

    // Vuelve a cargar donde ya había cargado: el vacío es el viaje anterior al revés.
    const esRetorno = kmEstimados(siguiente.origin, viaje.origin) === 0;

    tramos.push({
      desde: viaje.destination,
      hasta: siguiente.origin,
      km: esRetorno ? (viaje.kilometros ?? estimado) : estimado,
      tipo: esRetorno ? "retorno" : "reposicion",
      despues_de: viaje.id,
      antes_de: siguiente.id,
    });
  }
  return tramos;
}

/** Los km vacíos totales. Los tramos sin estimación no suman: no se inventa un número. */
export function kmVacios(tramos: TramoVacio[]): number {
  return tramos.reduce((s, t) => s + (t.km ?? 0), 0);
}
