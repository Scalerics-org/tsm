/**
 * ¿Se puede tocar esto, o ya está en una factura? Una sola respuesta para todas las guardas.
 *
 * Un viaje facturado no se corrige (409): la factura ya se emitió y lo que dice tiene que seguir
 * siendo verdad. Antes esta pregunta estaba escrita a mano en nueve rutas; cuando la facturación
 * pase a ser por cliente, la pregunta cambia a "¿está facturada ESTA carga?", y tenerla en nueve
 * lados es donde se escapa uno.
 *
 * Son dos reglas, y `estrategiaDeFacturacion` elige cuál (ver docs/FACTURACION-POR-CLIENTE.md):
 *
 *   por viaje    (todo lo facturado hasta hoy, y los viajes sin cargas): el viaje tiene número de
 *                factura o no lo tiene, y todos los alcances dan la misma respuesta.
 *   por cliente  (un viaje con cargas que se factura cliente por cliente): el viaje entero se frena
 *                en cuanto un cliente está facturado; las cargas, sólo las de los clientes facturados.
 *
 * Pura: no lee nada de D1. Devuelve el mensaje ya armado, con el número de factura adentro,
 * o null si se puede tocar.
 */
import {
  claveDeCliente,
  estrategiaDeFacturacion,
  type CargaParaFacturar,
  type FacturaDeCliente,
} from "./facturacion-por-cliente";

/** Qué se quiere corregir de un viaje entero. Decide el final de la frase del mensaje. */
export type CambioDeViaje = "cargas" | "descargas" | "cabecera" | "fecha" | "llegada" | "cancelar" | "borrar";

export type Alcance =
  | { tipo: "viaje"; cambio: CambioDeViaje }
  /** Una carga puntual, por su `sid`. Hoy sólo se corrige a quién se le cobra. */
  | { tipo: "carga"; sid: string }
  /**
   * El respaldo de un viaje: borrarla no se puede deshacer (se lleva el objeto de R2). `sid` es la
   * carga de la que cuelga; sin `sid` (o con uno que no es de ninguna carga, como la boleta de una
   * descarga) es del viaje entero.
   */
  | { tipo: "foto"; sid?: string | null };

type MarcaDeFactura = Pick<FacturaDeCliente, "cliente_clave" | "cliente_nombre" | "factura_numero">;

/** Lo único que la regla necesita saber del viaje. */
export interface ViajeConFactura {
  factura_numero: string | null;
  /** Las cargas, para saber a qué cliente pertenece cada una. */
  segments?: readonly CargaParaFacturar[] | null;
  /** La factura de cada cliente (viajes por cliente). */
  clientes_facturacion?: readonly MarcaDeFactura[] | null;
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
  if (!viaje) return null;
  return estrategiaDeFacturacion(viaje) === "por_viaje" ? bloqueoPorViaje(viaje, alcance) : bloqueoPorCliente(viaje, alcance);
}

// ── Por viaje: la regla de siempre ──

function bloqueoPorViaje(viaje: ViajeConFactura, alcance: Alcance): string | null {
  if (!viaje.factura_numero) return null;
  return `Ese viaje ya está en la factura ${viaje.factura_numero}. ${pieDe(alcance)}`;
}

// ── Por cliente ──

/** Los clientes que HOY están facturados, por clave. Una marca sin número (factura sacada) no cuenta. */
function facturados(viaje: ViajeConFactura): Map<string, MarcaDeFactura> {
  return new Map((viaje.clientes_facturacion ?? []).filter((m) => m.factura_numero).map((m) => [m.cliente_clave, m]));
}

const enLista = (ms: MarcaDeFactura[]) => ms.map((m) => `${m.cliente_nombre} (factura ${m.factura_numero})`).join(" y ");

function bloqueoPorCliente(viaje: ViajeConFactura, alcance: Alcance): string | null {
  const ya = facturados(viaje);
  if (ya.size === 0) return null;
  const todas = [...ya.values()];

  switch (alcance.tipo) {
    case "viaje":
      // Corregir las cargas de un viaje por cliente no se frena de entrada: depende de cuáles se tocan
      // (`bloqueoPorCambioDeCargas`). Todo lo demás es del viaje entero, y parte de él ya está facturada.
      if (alcance.cambio === "cargas") return null;
      return `Ese viaje ya tiene facturado a ${enLista(todas)}. ${pieDe(alcance)}`;

    case "carga": {
      const carga = viaje.segments?.find((s) => s.sid === alcance.sid);
      const marca = carga ? ya.get(claveDeCliente(carga) ?? "") : undefined;
      return marca ? `Esa carga ya está en la factura ${marca.factura_numero} (${marca.cliente_nombre}). ${pieDe(alcance)}` : null;
    }

    case "foto": {
      const carga = alcance.sid ? viaje.segments?.find((s) => s.sid === alcance.sid) : undefined;
      if (!carga) return `Ese viaje ya tiene facturado a ${enLista(todas)}. ${pieDe(alcance)}`;
      const marca = ya.get(claveDeCliente(carga) ?? "");
      return marca ? `Esa carga ya está en la factura ${marca.factura_numero} (${marca.cliente_nombre}). ${pieDe(alcance)}` : null;
    }
  }
}

type CargaCorregible = CargaParaFacturar & Record<string, unknown>;

/** Todo lo que cambia lo que se factura de una carga. La foto, el orden y las marcas internas no. */
function huella(c: CargaCorregible): string {
  const v = (x: unknown) => (x === undefined ? null : x);
  return JSON.stringify([
    v(c.remitente), v(c.remitente_id), v(c.clientes), v(c.cliente_ids), v(c.cantidad), v(c.unidad), v(c.remito),
    v(c.origen), v(c.origen_id), v(c.destino), v(c.destino_id), v(c.cobro_tipo), c.cobro_a?.trim() || null, v(c.cobro_id),
  ]);
}

/**
 * ¿La lista de cargas que se quiere guardar toca a algún cliente ya facturado?
 *
 * Se bloquea si una carga de un cliente facturado cambia o desaparece, si se le suma una carga nueva a
 * ese cliente, o si una carga pasa a cobrársele. Las cargas de los otros clientes del mismo viaje sí se
 * pueden corregir: lo ya facturado no se mueve y lo demás sigue abierto. En los viajes por viaje manda la
 * regla de siempre.
 */
export function bloqueoPorCambioDeCargas(
  viaje: ViajeConFactura | null | undefined,
  cargasNuevas: readonly CargaParaFacturar[],
): string | null {
  const nuevas = cargasNuevas as readonly CargaCorregible[];
  if (!viaje) return null;
  if (estrategiaDeFacturacion(viaje) === "por_viaje") return bloqueoPorViaje(viaje, { tipo: "viaje", cambio: "cargas" });

  const ya = facturados(viaje);
  if (ya.size === 0) return null;
  const actuales = (viaje.segments ?? []) as readonly CargaCorregible[];
  const porSid = new Map(actuales.map((c) => [c.sid, c]));
  const nuevasPorSid = new Set(nuevas.map((c) => c.sid));

  const tocados = new Map<string, MarcaDeFactura>();
  const marcar = (c: CargaCorregible | undefined) => {
    const m = c ? ya.get(claveDeCliente(c) ?? "") : undefined;
    if (m) tocados.set(m.cliente_clave, m);
  };

  for (const n of nuevas) {
    const antes = porSid.get(n.sid);
    if (antes && huella(antes) === huella(n)) continue;
    marcar(antes); // lo que se corrige, o se le saca a un cliente facturado
    marcar(n); // lo que se le suma o se le cambia a un cliente facturado
  }
  for (const a of actuales) if (!nuevasPorSid.has(a.sid)) marcar(a); // una carga que se borra

  if (tocados.size === 0) return null;
  return `Esas cargas tocan lo que ya está facturado a ${enLista([...tocados.values()])}. ${PIE_DE_VIAJE.cargas}`;
}

/**
 * Para los trabajos que reescriben cargas por su cuenta (propagar un nombre de la libreta, enganchar con
 * una regla): un viaje con ALGO facturado, por viaje o por cliente, no se reescribe.
 */
export function tieneAlgoFacturado(viaje: ViajeConFactura | null | undefined): boolean {
  if (!viaje) return false;
  return !!viaje.factura_numero || facturados(viaje).size > 0;
}
