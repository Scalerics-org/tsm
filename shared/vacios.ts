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
  /** Las cargas, para saber dónde terminó de verdad (ver `finDelViaje`). */
  segments?: CargaConRecorrido[];
}

type CargaConRecorrido = { origen?: string | null; destino?: string | null };

/**
 * Un viaje guardado → lo que necesitan los vacíos. Las tres pantallas que los calculan (el
 * resumen, la ficha del camión y Control) lo armaban cada una a mano, y así es como una se
 * queda sin las cargas y vuelve a contar la ida y vuelta como retorno.
 */
export function paraVacios(t: {
  id: number;
  started_at: string;
  origin: string;
  destination: string;
  kilometros?: number | null;
  segments?: CargaConRecorrido[];
}): ViajeParaVacios {
  return {
    id: t.id,
    started_at: t.started_at,
    origin: t.origin,
    destination: t.destination,
    kilometros: Number.isFinite(t.kilometros as number) ? (t.kilometros as number) : null,
    segments: t.segments ?? [],
  };
}

/**
 * Dónde quedó el camión al terminar el viaje.
 *
 * Casi siempre es el destino. La excepción es la ida y vuelta de Manassi: el viaje dice
 * Artigas → Minas, pero la última carga es Minas → Artigas —vuelve cargado con envases—. "No lo
 * considero retorno vacío, porque el precio del viaje es ida y vuelta." (Rodrigo, 18/9/2026).
 * Sin esto, el camión figuraba terminando en Minas y la vuelta salía como retorno vacío.
 *
 * Manda el destino de la ÚLTIMA carga que lo tenga; si ninguna lo tiene, el del viaje.
 */
export function finDelViaje(v: { destination: string; segments?: CargaConRecorrido[] }): string {
  const conDestino = (v.segments ?? []).filter((s) => s.destino?.trim());
  return conDestino.length ? (conDestino[conDestino.length - 1].destino as string).trim() : v.destination;
}

/**
 * Los km estimados del viaje. En una ida y vuelta —termina donde empezó— son los dos tramos:
 * la vuelta va cargada y es parte del viaje, no un vacío aparte.
 */
export function kmEstimadosDelViaje(v: {
  origin: string;
  destination: string;
  segments?: CargaConRecorrido[];
}): number | null {
  const ida = kmEstimados(v.origin, v.destination);
  const fin = finDelViaje(v);
  const esIdaYVuelta = kmEstimados(fin, v.destination) !== 0 && kmEstimados(fin, v.origin) === 0;
  if (!esIdaYVuelta || ida == null) return ida;
  const vuelta = kmEstimados(v.destination, fin);
  return vuelta == null ? null : ida + vuelta;
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

    const fin = finDelViaje(viaje);
    // Sin destino todavía (el internacional en curso lo pide al cerrar) no se sabe dónde quedó
    // el camión: no hay tramo que deducir, y reportarlo como "sin medir" sería inventarlo.
    if (!fin.trim()) continue;
    const estimado = kmEstimados(fin, siguiente.origin);
    // 0 km es el mismo lugar escrito distinto: no hubo viaje. `null` es un lugar que la app
    // no conoce, que es otra cosa —hay tramo, no se sabe cuánto— y sí se reporta.
    if (estimado === 0) continue;
    if (estimado != null && estimado < KM_VACIO_MINIMO) continue;

    // Vuelve a cargar donde ya había cargado: el vacío es el viaje anterior al revés.
    const esRetorno = kmEstimados(siguiente.origin, viaje.origin) === 0;

    tramos.push({
      desde: fin,
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

export interface VaciosDelPeriodo {
  km_retorno: number;
  km_reposicion: number;
  tramos: number;
  /** Tramos que aparecen pero no suman: la app no conoce alguno de los dos lugares. */
  sin_km: number;
}

/**
 * Los vacíos de un camión en un período, para el resumen por camión.
 *
 * CADA TRAMO VA AL PERÍODO EN QUE EL CAMIÓN LLEGA A CARGAR — el viaje `antes_de` —, porque
 * el tramo vacío se maneja justo antes de ese viaje. Y por eso se calcula sobre TODOS los
 * viajes del camión y se filtra después: recortar los viajes al rango primero perdería el
 * tramo del borde, el que va del último viaje de agosto al primero de setiembre.
 *
 * Los viajes cancelados los tiene que sacar quien llama, igual que en el resto de las
 * pantallas: un cancelado no se hizo y parte la cadena.
 */
export function vaciosDelPeriodo(
  viajes: ViajeParaVacios[],
  desde?: string,
  hasta?: string,
): VaciosDelPeriodo {
  const inicio = new Map(viajes.map((v) => [v.id, v.started_at.slice(0, 10)]));
  const enRango = (id: number) => {
    const dia = inicio.get(id);
    return dia != null && (!desde || dia >= desde) && (!hasta || dia <= hasta);
  };
  const tramos = vaciosEntreViajes(viajes).filter((t) => enRango(t.antes_de));
  return {
    km_retorno: kmVacios(tramos.filter((t) => t.tipo === "retorno")),
    km_reposicion: kmVacios(tramos.filter((t) => t.tipo === "reposicion")),
    tramos: tramos.length,
    sin_km: tramos.filter((t) => t.km == null).length,
  };
}
