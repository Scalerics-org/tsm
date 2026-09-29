/**
 * "¿Esto que mandé ya llegó?" para la salida, el cierre y la lectura del tacógrafo. Ver
 * `envio-ya-llego.ts`: acá la comparación es contra el viaje o la lectura, no contra una surtida.
 */
import { TRIP_STATUS } from "./domain";

/**
 * ¿Salió el viaje? El chofer sólo puede salir sin ningún viaje abierto (lo frena la pantalla y el
 * servidor), así que un viaje en curso de la misma plantilla y el mismo camión, leído después de
 * mandar, es el que acaba de crear. No hace falta mirar la hora.
 */
export function salidaYaCreada(
  enviada: { template_id: number; truck_id: number | null },
  activo: { template_id: number | null; truck_id: number } | null,
): boolean {
  if (!activo || activo.template_id !== enviada.template_id) return false;
  return enviada.truck_id == null || activo.truck_id === enviada.truck_id;
}

/** ¿Se cerró el viaje? Si ya está completado, el cierre salió bien, lo haya hecho este pedido u otro igual. */
export function viajeYaCerrado(viaje: { status: string } | null): boolean {
  return viaje?.status === TRIP_STATUS.COMPLETADO;
}

/**
 * La lectura mensual del tacógrafo contra la que quedó guardada. "distinta" es un conflicto real
 * (alguien cargó otro número) y se le muestra al chofer como hoy; "ninguna" es que no llegó.
 */
export function compararLectura(
  enviadaKm: number,
  guardada: { kilometraje: number } | null,
): "misma" | "distinta" | "ninguna" {
  if (!guardada) return "ninguna";
  return guardada.kilometraje === enviadaKm ? "misma" : "distinta";
}
