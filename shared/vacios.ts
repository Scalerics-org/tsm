import { claveDeLugar, kmEstimados } from "./distancias";
import { kmDeDesvios } from "./estancias";
import { salidaValida } from "./salida";

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
  /**
   * Desde dónde salió el camión a buscar la carga (ver `shared/salida.ts`). `null`/ausente = no se sabe: el
   * vacío se calcula como siempre, del fin del viaje anterior directo al origen de éste.
   */
  salida_desde?: string | null;
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
  salida_desde?: string | null;
}): ViajeParaVacios {
  return {
    id: t.id,
    started_at: t.started_at,
    origin: t.origin,
    destination: t.destination,
    kilometros: Number.isFinite(t.kilometros as number) ? (t.kilometros as number) : null,
    segments: t.segments ?? [],
    salida_desde: t.salida_desde ?? null,
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
 * Las paradas del viaje cuando se sabe dónde descargó por lugar (Otros Viajes): donde salió, donde cargó
 * cada carga y el departamento de cada descarga, en ese orden y sin repetir una parada seguida de sí misma.
 * Es el mismo recorrido que dibuja `recorridoVisible`, así la cuenta y la pantalla hablan del mismo camino.
 *
 * `null` cuando el viaje no tiene descargas por lugar: ahí el recorrido es el de siempre (origen → destino).
 */
export function paradasDelViaje(v: {
  origin: string;
  segments?: { origen?: string | null }[];
  descargas?: { departamento?: string | null }[] | null;
}): string[] | null {
  if (!v.descargas?.length) return null;
  const paradas: string[] = [];
  const sumar = (p: string | null | undefined) => {
    const lugar = p?.trim();
    if (!lugar || claveDeLugar(paradas[paradas.length - 1] ?? "") === claveDeLugar(lugar)) return;
    paradas.push(lugar);
  };
  sumar(v.origin);
  for (const s of v.segments ?? []) sumar(s.origen);
  for (const d of v.descargas) sumar(d.departamento);
  return paradas;
}

/**
 * Los km estimados del viaje. En una ida y vuelta —termina donde empezó— son los dos tramos:
 * la vuelta va cargada y es parte del viaje, no un vacío aparte.
 *
 * Con descargas por lugar es la suma de los tramos entre TODAS las paradas (`paradasDelViaje`) y no la
 * distancia en línea de la punta a la punta: "descargamos en estancias, en el medio, y no las considera"
 * (Rodrigo, 10/10). Por la desigualdad triangular la suma nunca da menos que el directo. Si algún tramo
 * tiene un lugar que la app no conoce, se vuelve al directo de siempre: un hueco nuevo sería peor.
 */
export function kmEstimadosDelViaje(v: {
  origin: string;
  destination: string;
  segments?: CargaConRecorrido[];
  descargas?: { departamento?: string | null; km_desvio?: number | null }[] | null;
}): number | null {
  const km = kmPorTramos(paradasDelViaje(v)) ?? kmDirectoDelViaje(v);
  // Las estancias fuera de la ruta suman lo que se desvió el camión (ver `shared/estancias.ts`).
  return km == null ? null : km + kmDeDesvios(v.descargas);
}

/** La suma de los tramos entre paradas, o `null` si no hay recorrido que sumar o algún tramo no se conoce. */
function kmPorTramos(paradas: string[] | null): number | null {
  if (!paradas || paradas.length < 2) return null;
  let total = 0;
  for (let i = 0; i < paradas.length - 1; i++) {
    const tramo = kmEstimados(paradas[i], paradas[i + 1]);
    if (tramo == null) return null;
    total += tramo;
  }
  return total;
}

/** La estimación de punta a punta de siempre (con la vuelta de una ida y vuelta). Es la regla de antes de sumar paradas. */
export function kmDirectoDelViaje(v: {
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
    // Lo mismo con el origen del que sigue: en "Otros Viajes" el viaje nace sin origen y lo toma
    // de la primera carga. Hasta que la haya, no se sabe dónde va a cargar el camión.
    if (!siguiente.origin?.trim()) continue;

    const agregar = (desde: string, hasta: string, puedeSerRetorno: boolean) => {
      const estimado = kmEstimados(desde, hasta);
      // 0 km es el mismo lugar escrito distinto: no hubo viaje. `null` es un lugar que la app
      // no conoce, que es otra cosa —hay tramo, no se sabe cuánto— y sí se reporta.
      if (estimado === 0) return;
      if (estimado != null && estimado < KM_VACIO_MINIMO) return;

      // Vuelve a cargar donde ya había cargado: el vacío es el viaje anterior al revés.
      const esRetorno = puedeSerRetorno && kmEstimados(siguiente.origin, viaje.origin) === 0;

      tramos.push({
        desde,
        hasta,
        km: esRetorno ? (viaje.kilometros ?? estimado) : estimado,
        tipo: esRetorno ? "retorno" : "reposicion",
        despues_de: viaje.id,
        antes_de: siguiente.id,
      });
    };

    // CON LA SALIDA REAL el camión no fue derecho del fin del viaje anterior al lugar de carga: pasó por donde
    // salió (Montevideo → Bella Unión → Artigas), y los 130 km del final son un vacío por sí mismos. Son dos
    // tramos, cada uno con su piso de 70 km, y ninguno es "retorno": ese número, el del viaje anterior, ya no
    // describe el camino. Si la salida es el mismo lugar de carga o donde terminó el viaje anterior (el camión salió
    // derecho), o no se sabe, todo sigue como siempre.
    const salida = salidaValida(siguiente.salida_desde);
    if (salida && claveDeLugar(salida) !== claveDeLugar(siguiente.origin) && claveDeLugar(salida) !== claveDeLugar(fin)) {
      agregar(fin, salida, false);
      agregar(salida, siguiente.origin, false);
    } else {
      agregar(fin, siguiente.origin, true);
    }
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
/** Un tramo vacío con el día en que cuenta: el del viaje siguiente, cuando el camión fue a buscar la carga. */
export interface TramoConFecha extends TramoVacio {
  fecha: string;
}

/**
 * Los tramos vacíos de un camión que caen en un período, cada uno con su fecha. Es la ÚNICA cuenta: el resumen
 * por camión (`vaciosDelPeriodo`) y la ficha del camión salen de acá, así un mes da lo mismo en las dos pantallas.
 */
export function tramosDelPeriodo(viajes: ViajeParaVacios[], desde?: string, hasta?: string): TramoConFecha[] {
  const inicio = new Map(viajes.map((v) => [v.id, v.started_at.slice(0, 10)]));
  const enRango = (dia: string | undefined): dia is string =>
    dia != null && (!desde || dia >= desde) && (!hasta || dia <= hasta);
  return vaciosEntreViajes(viajes).flatMap((t) => {
    const fecha = inicio.get(t.antes_de);
    return enRango(fecha) ? [{ ...t, fecha }] : [];
  });
}

/**
 * La ventana que compara Control: de la foto del tacógrafo del mes anterior a la de éste (no el mes calendario:
 * las fotos nunca se sacan el 1° a las 00:00). Sin la foto previa arranca el 1° del mes; sin la de éste, termina
 * el 31. Son fechas con hora ("2026-09-04 18:30:00") que se comparan contra `started_at`.
 */
export function ventanaDeFotos(
  mes: string,
  fotoPrevia: string | null | undefined,
  fotoDelMes: string | null | undefined,
): { desde: string; hasta: string } {
  return { desde: fotoPrevia ?? `${mes}-01`, hasta: fotoDelMes ?? `${mes}-31 23:59:59` };
}

/**
 * Los tramos vacíos de la ventana de Control: sólo con los viajes que ARRANCAN adentro, así que el tramo entre el
 * último viaje de antes de la ventana y el primero de adentro no cuenta (en el calendario, `tramosDelPeriodo`, sí).
 * Es la cuenta de la tarjeta "Kilómetros sin justificar" y de la ficha del camión cuando se llega desde ahí.
 */
export function tramosDeLaVentana(
  viajes: ViajeParaVacios[],
  ventana: { desde: string; hasta: string },
): TramoConFecha[] {
  const adentro = viajes.filter((v) => v.started_at >= ventana.desde && v.started_at <= ventana.hasta);
  const inicio = new Map(adentro.map((v) => [v.id, v.started_at.slice(0, 10)]));
  return vaciosEntreViajes(adentro).map((t) => ({ ...t, fecha: inicio.get(t.antes_de) as string }));
}

export function vaciosDelPeriodo(
  viajes: ViajeParaVacios[],
  desde?: string,
  hasta?: string,
): VaciosDelPeriodo {
  const tramos = tramosDelPeriodo(viajes, desde, hasta);
  return {
    km_retorno: kmVacios(tramos.filter((t) => t.tipo === "retorno")),
    km_reposicion: kmVacios(tramos.filter((t) => t.tipo === "reposicion")),
    tramos: tramos.length,
    sin_km: tramos.filter((t) => t.km == null).length,
  };
}
