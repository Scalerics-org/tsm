import type { Trip } from "../../shared/domain";
import type { CabeceraPatch } from "../repos/trips";

/**
 * La cabecera corregida de un viaje: qué queda después de aplicarle lo que mandó la oficina.
 *
 * Está acá afuera de la ruta para poder fijar con tests las dos reglas que no se ven:
 *
 * - Es un PATCH de verdad: lo que no viene en el pedido no se toca. La pantalla manda todo
 *   junto, pero un cliente que mande sólo los kilómetros no puede borrar las observaciones.
 * - Los kilos viven en DOS lados —la columna `kilos`, que es la que suman los reportes, y el
 *   campo `is_weight` de la plantilla, que es el que sale en el Excel—, así que corregirlos
 *   escribe los dos. Con uno solo, el mismo viaje diría 28.070 en una columna y 31.000 en la
 *   de al lado y nadie sabría cuál es la buena.
 *
 * No valida que el chofer y el camión existan: eso necesita la base y lo hace la ruta.
 */
export type Resultado = { patch: CabeceraPatch } | { error: string };

const texto = (v: unknown): string => String(v ?? "").trim();
const textoONull = (v: unknown): string | null => texto(v) || null;

/** Número opcional: `null`/""/ausente = sin dato. Devuelve `undefined` si no es un número. */
function numeroONull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function cabeceraCorregida(
  trip: Trip,
  body: Record<string, unknown>,
  /** La key del campo de peso de la plantilla, si tiene uno. */
  weightKey: string | null,
): Resultado {
  const trae = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  const origin = trae("origin") ? texto(body.origin) : trip.origin;
  if (!origin) return { error: "El origen no puede quedar vacío." };

  const destination = trae("destination") ? texto(body.destination) : trip.destination;
  if (!destination) return { error: "El destino no puede quedar vacío." };

  const cargo_type = trae("cargo_type") ? texto(body.cargo_type) : trip.cargo_type;
  if (!cargo_type) return { error: "El tipo de carga no puede quedar vacío." };

  const kilos_carga = trae("kilos_carga") ? numeroONull(body.kilos_carga) : trip.kilos_carga;
  if (kilos_carga === undefined) return { error: "Los kilos van en número, y no pueden ser negativos." };

  const kilometros = trae("kilometros") ? numeroONull(body.kilometros) : trip.kilometros;
  if (kilometros === undefined) {
    return { error: "Los kilómetros van en número, y no pueden ser negativos." };
  }

  const driver_id = trae("driver_id") ? Number(body.driver_id) : trip.driver_id;
  if (!Number.isInteger(driver_id) || driver_id <= 0) return { error: "Elegí el chofer." };

  const truck_id = trae("truck_id") ? Number(body.truck_id) : trip.truck_id;
  if (!Number.isInteger(truck_id) || truck_id <= 0) return { error: "Elegí el camión." };

  // El peso de la plantilla acompaña a la columna: si se corrigieron los kilos, se corrige
  // también el campo que sale en el Excel. Sin peso en la plantilla no hay nada que sincronizar.
  const field_values = { ...trip.field_values };
  if (weightKey && trae("kilos_carga")) {
    if (kilos_carga == null) delete field_values[weightKey];
    else field_values[weightKey] = String(kilos_carga);
  }

  return {
    patch: {
      origin,
      remite: trae("remite") ? textoONull(body.remite) : trip.remite,
      destination,
      destinatario: trae("destinatario") ? textoONull(body.destinatario) : trip.destinatario,
      cargo_type,
      kilos_carga,
      kilometros,
      notes: trae("notes") ? textoONull(body.notes) : trip.notes,
      driver_id,
      truck_id,
      field_values,
    },
  };
}
