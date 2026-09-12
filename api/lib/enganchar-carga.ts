import { TRIP_STATUS, aplicarCobro, type CobroRegla, type Trip, type TripSegment } from "../../shared/domain";

/**
 * Engancharle a una carga vieja el lugar de carga de la libreta.
 *
 * Hay cargas que quedaron sin `remitente_id`: las de "OTROS VIAJES", donde el chofer escribe el
 * lugar a mano, y las precargadas de Manassi. Sin id no las alcanza ninguna regla —`resolveCobro`
 * corta en seco cuando el id es null— así que no se pueden cobrar por regla nunca, y no había
 * ninguna pantalla para arreglarlo: las rutas del chofer exigen viaje en curso y estas cargas
 * están en viajes cerrados. Hoy son 15, y una de ellas dice "AGENCIA", que en la libreta ya
 * existe y ya tiene regla: con el id puesto se resolvía sola.
 *
 * Empareja por el texto que quedó guardado, sin distinguir mayúsculas ni espacios de más, que es
 * como lo escribió el chofer.
 */

const normalizar = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

export interface ViajeEnganchable extends Pick<Trip, "id" | "status" | "segments"> {
  factura_numero?: string | null;
}

export interface Enganche {
  /** El texto tal cual quedó en las cargas: "ISUSA", "molino", "Las piedras". */
  texto: string;
  /** La entrada de la libreta a la que se enganchan. */
  libreta_id: number;
  nombre: string;
}

export interface ViajeConCargasNuevas {
  id: number;
  segments: TripSegment[];
  cargas: number;
}

/**
 * Qué viajes hay que reescribir y cómo quedan sus cargas.
 *
 * Devuelve sólo los que cambian. Un viaje facturado no se toca —corregirle el cobro a algo que
 * ya salió en una factura es justamente lo que el resto del sistema frena— y uno cancelado
 * tampoco: no se cobra.
 */
export function engancharEnViajes(
  viajes: ViajeEnganchable[],
  reglas: CobroRegla[],
  e: Enganche,
): ViajeConCargasNuevas[] {
  const buscado = normalizar(e.texto);
  const out: ViajeConCargasNuevas[] = [];

  for (const v of viajes) {
    if (v.factura_numero || v.status === TRIP_STATUS.CANCELADO) continue;
    let cargas = 0;
    const nuevas = v.segments.map((s) => {
      if (s.remitente_id != null || normalizar(s.remitente) !== buscado) return s;
      cargas += 1;
      return { ...s, remitente: e.nombre, remitente_id: e.libreta_id };
    });
    if (!cargas) continue;
    // Con el id puesto, la regla que ya existía se aplica sola. `aplicarCobro` respeta lo que
    // la oficina haya fijado a mano (`cobro_manual`).
    out.push({ id: v.id, segments: aplicarCobro(reglas, nuevas), cargas });
  }
  return out;
}
