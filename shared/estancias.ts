import { normalizeNombre } from "./domain";
import type { Descarga } from "./domain";

/**
 * Las estancias donde se descarga fuera de la ruta, para sumar su desvío a los km del viaje.
 *
 * "Descargamos en estancias, en el medio, y no las considera... quedan entre 40 y 100 km aprox de Artigas."
 * (Rodrigo, 10/10). El recorrido se mide entre departamentos y una estancia está DENTRO del departamento, así
 * que no sumaba nada. La oficina carga cada estancia en la libreta con cuántos km queda de la ciudad.
 */

/**
 * Cuántas veces se recorre la distancia a la estancia: ir y volver a la ruta.
 *
 * ASUMIDO, A CONFIRMAR CON RODRIGO: el camión va de la ruta (la ciudad) hasta la estancia y vuelve. Si la
 * estancia queda de paso, o es la última parada y de ahí sigue sin volver, es 1. Se cambia acá y nada más.
 */
export const VECES_QUE_SE_RECORRE_LA_ESTANCIA = 2;

/** El desvío que suma una estancia que queda a `kmDesdeCiudad` de la ciudad. */
export const desvioDeEstancia = (kmDesdeCiudad: number): number =>
  Math.round(kmDesdeCiudad * VECES_QUE_SE_RECORRE_LA_ESTANCIA);

/** Una entrada de la libreta que es una estancia con desvío. */
export interface EstanciaConKm {
  nombre: string;
  /** El departamento de la entrada. `null` = vale en cualquiera. */
  departamento: string | null;
  km_desde_ciudad: number;
}

/**
 * Le pone a cada descarga el desvío de la estancia que corresponde, o se lo saca si ya no corresponde.
 *
 * Se reconoce por el nombre (sin mayúsculas ni acentos, el mismo criterio que el resto de la libreta) y, si la
 * estancia tiene departamento, que sea el de la descarga. Se guarda en la descarga —una foto del momento— y no
 * se lee de la libreta cada vez: cambiarle los km a una estancia después no reescribe los viajes ya hechos.
 */
export function conDesvioDeEstancias(descargas: Descarga[], estancias: EstanciaConKm[]): Descarga[] {
  return descargas.map(({ km_desvio: _viejo, ...d }) => {
    const lugar = normalizeNombre(d.lugar);
    const depto = normalizeNombre(d.departamento);
    const estancia = estancias.find(
      (e) => normalizeNombre(e.nombre) === lugar && (e.departamento == null || normalizeNombre(e.departamento) === depto),
    );
    return estancia ? { ...d, km_desvio: desvioDeEstancia(estancia.km_desde_ciudad) } : d;
  });
}

/** Lo que suman las descargas de un viaje por ir a estancias. */
export const kmDeDesvios = (descargas: { km_desvio?: number | null }[] | null | undefined): number =>
  (descargas ?? []).reduce((s, d) => s + (Number.isFinite(d.km_desvio as number) ? (d.km_desvio as number) : 0), 0);
