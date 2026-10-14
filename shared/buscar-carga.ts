import { claveDeLugar } from "./distancias";
import { hoyEnUruguay } from "./vencimientos";

/**
 * Los km de "ir a buscar carga" que salen de una REGLA FIJA y no de la estimación entre dos lugares.
 *
 * "Siempre que descargue en Bella Unión y vaya Artigas hay que sumar los 137. Excepto que el camión haga un viaje
 * [que] descargue agencia, Bella Unión - Artigas. Pero ahí él lo debe cargar porque es un viaje cargado. Y tenemos
 * esa opción." (Rodrigo, 14/10/2026). Antes, el 13/10, había pedido no preguntarle nada más al chofer: la pregunta
 * "¿Desde dónde salís?" se sacó y estos km salen de dónde terminó el camión y adónde va a cargar.
 *
 * POR QUÉ FIJOS Y SIN EL PISO DE 70 KM. Son los km que el cliente da por buenos para ese movimiento: no se
 * recalculan ni se achican. El piso (`KM_VACIO_MINIMO`) existe para no contar moverse dentro de una zona; acá el
 * cliente dijo cuánto es, y los 15 km de Bella Unión a ALUR cuentan aunque sean menos de 70.
 *
 * LA REGLA ES POR LUGAR, no por plantilla anterior: no importa qué viaje dejó al camión en Bella Unión. La
 * excepción de Rodrigo sale sola: el viaje "Agencia Artigas" (Bella Unión → Artigas, ya cargado) termina en
 * Artigas, así que el siguiente no tiene nada que buscar.
 *
 * DESDE CUÁNDO. Sólo para viajes que arrancaron desde el 1/10/2026 (día de Uruguay): setiembre ya está cerrado
 * y facturado con la cuenta de antes, y no puede cambiar ni un km.
 *
 * LA TABLA CRECE SIN TOCAR LA LÓGICA: va a haber más reglas ("otros viajes, descarga en el departamento de
 * Artigas", estancias). Se agrega una fila a REGLAS_BUSCAR_CARGA. Gana la PRIMERA que coincide, así que las más
 * específicas van arriba.
 */

/** Primer día (de Uruguay) en que rigen las reglas fijas. */
export const BUSCAR_CARGA_DESDE = "2026-10-01";

export interface ReglaBuscarCarga {
  /** Dónde terminó el viaje anterior. Se compara por `claveDeLugar` ("BU", "Bella Union" y "Bella Unión" son lo mismo). */
  fin: string;
  /** A qué viaje va a cargar: por el lugar de carga (su origen) o por la plantilla. Con las dos, tienen que coincidir ambas. */
  siguiente: { origen?: string; plantilla?: number };
  km: number;
  /** Para qué existe la regla, en una línea: es lo que se lee en el código y en los tests. */
  motivo: string;
}

export const REGLAS_BUSCAR_CARGA: readonly ReglaBuscarCarga[] = [
  {
    fin: "Bella Unión",
    // Plantilla 12 "Ida y vuelta Bella Unión - Minas" (Manassi): carga en ALUR, que está en Bella Unión.
    siguiente: { plantilla: 12 },
    km: 15,
    motivo: "De la base en Bella Unión a cargar en ALUR (Manassi, ida y vuelta Bella Unión - Minas).",
  },
  {
    fin: "Bella Unión",
    // Casarone, Manassi (ida y vuelta Artigas - Minas) o cualquier otro que cargue en Artigas.
    siguiente: { origen: "Artigas" },
    km: 137,
    motivo: "Descargó en Bella Unión y va a cargar a Artigas.",
  },
];

/** Lo mínimo que hace falta saber del viaje que sigue para ver si hay regla. */
export interface ViajeSiguiente {
  started_at: string;
  origin: string;
  template_id?: number | null;
}

/** El día de Uruguay en que arrancó el viaje (`started_at` está en UTC, sin zona), o null si no se puede leer. */
function diaDeSalida(startedAt: string): string | null {
  const instante = new Date(`${startedAt.trim().replace(" ", "T")}Z`);
  return Number.isNaN(instante.getTime()) ? null : hoyEnUruguay(instante);
}

/**
 * La regla que corresponde al paso del camión de un viaje al siguiente, o `null` si no hay ninguna (o el
 * viaje siguiente es anterior al 1/10/2026): entonces el vacío se calcula como siempre.
 */
export function reglaDeBuscarCarga(
  finDelViajeAnterior: string,
  siguiente: ViajeSiguiente,
  reglas: readonly ReglaBuscarCarga[] = REGLAS_BUSCAR_CARGA,
): ReglaBuscarCarga | null {
  const dia = diaDeSalida(siguiente.started_at);
  if (dia == null || dia < BUSCAR_CARGA_DESDE) return null;

  const fin = claveDeLugar(finDelViajeAnterior);
  return (
    reglas.find(
      (r) =>
        claveDeLugar(r.fin) === fin &&
        (r.siguiente.plantilla == null || r.siguiente.plantilla === siguiente.template_id) &&
        (r.siguiente.origen == null || claveDeLugar(r.siguiente.origen) === claveDeLugar(siguiente.origin)),
    ) ?? null
  );
}
