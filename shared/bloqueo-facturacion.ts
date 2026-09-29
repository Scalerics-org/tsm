/**
 * ¿Se puede tocar esto, o ya está en una factura? Una sola respuesta para todas las guardas.
 *
 * Un viaje facturado no se corrige (409): la factura ya se emitió y lo que dice tiene que seguir
 * siendo verdad. Antes esta pregunta estaba escrita a mano en nueve rutas; cuando la facturación
 * pase a ser por cliente, la pregunta cambia a "¿está facturada ESTA carga?", y tenerla en nueve
 * lados es donde se escapa uno.
 *
 * Hoy la regla es una sola —el viaje tiene número de factura o no— y todos los alcances dan la
 * misma respuesta. El `alcance` existe para que la regla por carga se enchufe acá sin volver a
 * tocar las rutas.
 *
 * Pura: no lee nada de D1. Devuelve el mensaje ya armado, con el número de factura adentro,
 * o null si se puede tocar.
 */

/** Qué se quiere corregir de un viaje entero. Decide el final de la frase del mensaje. */
export type CambioDeViaje = "cargas" | "descargas" | "cabecera" | "fecha" | "llegada" | "cancelar" | "borrar";

export type Alcance =
  | { tipo: "viaje"; cambio: CambioDeViaje }
  /** Una carga puntual, por su `sid`. Hoy sólo se corrige a quién se le cobra. */
  | { tipo: "carga"; sid: string }
  /** El respaldo de un viaje: borrarla no se puede deshacer (se lleva el objeto de R2). */
  | { tipo: "foto" };

/** Lo único que la regla necesita saber del viaje. */
export interface ViajeConFactura {
  factura_numero: string | null;
}

const PIE_DE_VIAJE: Record<CambioDeViaje, string> = {
  cargas: "Desmarcalo desde Facturación y después corregí las cargas.",
  descargas: "Desmarcalo desde Facturación y después corregí dónde descargó.",
  cabecera: "Desmarcalo desde Facturación y después corregilo.",
  fecha: "Desmarcalo desde Facturación y después cambiale la fecha.",
  llegada: "Desmarcalo desde Facturación y después corregí la llegada.",
  cancelar: "Desmarcalo desde Facturación y después cancelalo.",
  borrar: "Si de verdad hay que sacarlo, desmarcalo desde Facturación primero.",
};

const PIE_DE_CARGA = "Desmarcalo desde Facturación y después cambiá a quién se le cobra.";
const PIE_DE_FOTO = "Esa foto es el respaldo: desmarcalo desde Facturación si de verdad hay que sacarla.";

function pieDe(alcance: Alcance): string {
  switch (alcance.tipo) {
    case "viaje":
      return PIE_DE_VIAJE[alcance.cambio];
    case "carga":
      return PIE_DE_CARGA;
    case "foto":
      return PIE_DE_FOTO;
  }
}

/** null si se puede tocar; si no, el mensaje que se le muestra a quien lo intenta. */
export function bloqueoPorFacturacion(viaje: ViajeConFactura | null | undefined, alcance: Alcance): string | null {
  if (!viaje?.factura_numero) return null;
  return `Ese viaje ya está en la factura ${viaje.factura_numero}. ${pieDe(alcance)}`;
}
