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
export type Resultado = { patch: CabeceraPatch; avisos: string[] } | { error: string };

/** Lo que la ruta sabe del contexto y la función pura no puede averiguar sola. */
export interface ContextoCabecera {
  /**
   * La plantilla arma el recorrido con las cargas (`renglon_pide_ubicacion`). En esas,
   * `recalcularRecorrido` pisa origen y destino después de cada escritura de renglones, así
   * que corregirlos acá se revierte solo en el próximo guardado.
   */
  recorridoPorCargas?: boolean;
  /**
   * Los campos propios de la plantilla que se pueden corregir acá (remito, N° de MIC…), sin el
   * de peso, que va por `kilos_carga`. "Donde corrijo los viajes no tengo la opción de corregir
   * el nro de remito" — Rodrigo, 19/9.
   */
  campos?: { key: string; type: string; required?: boolean; label?: string }[];
}

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
  ctx: ContextoCabecera = {},
): Resultado {
  const trae = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  /** Mandar el mismo valor que ya tenía no es cambiarlo: la pantalla manda todo junto. */
  const cambia = (k: keyof Trip) => trae(k) && texto(body[k]) !== texto(trip[k]);

  // Lo que se frena es VACIAR un campo, no mandarlo vacío como ya estaba.
  //
  // Mirar el valor resultante dejaba incorregible para siempre al viaje que ya tenía un campo
  // vacío —en producción hay 2 así, con el tipo de carga vacío—, y mirar sólo si el pedido lo
  // manda tapaba la mitad: un formulario de edición manda TODOS los campos, así que el mismo
  // vacío volvía en el pedido y la guarda saltaba igual. Justo desde la pantalla que se le va
  // a poner. Se compara contra lo que el viaje ya tiene: si no cambia, no hay nada que frenar.
  const origin = trae("origin") ? texto(body.origin) : trip.origin;
  if (cambia("origin") && !origin) return { error: "El origen no puede quedar vacío." };

  const destination = trae("destination") ? texto(body.destination) : trip.destination;
  if (cambia("destination") && !destination) return { error: "El destino no puede quedar vacío." };

  const cargo_type = trae("cargo_type") ? texto(body.cargo_type) : trip.cargo_type;
  if (cambia("cargo_type") && !cargo_type) {
    return { error: "El tipo de carga no puede quedar vacío." };
  }

  // El recorrido de estas plantillas sale de las cargas y se reescribe en cada guardado de
  // renglones: aceptar la corrección acá sería aceptarla y revertirla sin decir nada.
  if (ctx.recorridoPorCargas && (cambia("origin") || cambia("destination"))) {
    return {
      error:
        "En esta plantilla el recorrido sale de las cargas: corregí dónde cargó y dónde descargó con \"Corregir lugares\", en cada carga de la ficha del viaje, y el viaje se acomoda solo.",
    };
  }

  // Un viaje andando tiene un chofer con la app abierta en la ruta. Cambiárselo se lo saca
  // de la mano a mitad de camino.
  if (trip.status === "EN_CURSO" && (cambia("driver_id") || cambia("truck_id"))) {
    return {
      error:
        "El viaje está en curso: el chofer lo tiene abierto. Esperá a que lo cierre para cambiarle el chofer o el camión.",
    };
  }

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
  // Los campos de la plantilla que manda la pantalla. Sólo los que la plantilla tiene: una key
  // inventada no entra, y el peso tampoco —ése se corrige por `kilos_carga`, que escribe los dos
  // lados a la vez—.
  const pedidos = (body.campos ?? {}) as Record<string, unknown>;
  const aCambiar = (ctx.campos ?? []).filter(
    (campo) =>
      campo.key !== weightKey &&
      Object.prototype.hasOwnProperty.call(pedidos, campo.key) &&
      texto(pedidos[campo.key]) !== texto(trip.field_values?.[campo.key]),
  );
  // Con el viaje en curso el chofer está cargando esos mismos campos (el MIC en el puente, la
  // descarga al llegar): guardar desde acá pisaría lo que él acaba de mandar.
  if (aCambiar.length && trip.status === "EN_CURSO") {
    return {
      error: "El viaje está en curso: el chofer está cargando esos datos. Corregilos cuando lo cierre.",
    };
  }
  for (const campo of aCambiar) {
    const valor = texto(pedidos[campo.key]);
    if (!valor) {
      // Un campo obligatorio es de los que se factura (el remito): no se borra por un descuido.
      if (campo.required) return { error: `${campo.label ?? campo.key} no puede quedar vacío.` };
      delete field_values[campo.key];
      continue;
    }
    if (campo.type === "numero") {
      // Se guarda con punto: el resumen suma con Number(), y "31,21" le daba 0.
      const n = Number(valor.replace(",", "."));
      if (!Number.isFinite(n)) return { error: `"${valor}" no es un número.` };
      field_values[campo.key] = String(n);
      continue;
    }
    field_values[campo.key] = valor;
  }
  if (weightKey && trae("kilos_carga")) {
    if (kilos_carga == null) delete field_values[weightKey];
    else field_values[weightKey] = String(kilos_carga);
  }

  // Los km son la lectura del chofer, no una estimación: pisarlos al cambiar el recorrido
  // sería inventar un número. Pero dejarlos callado tampoco sirve — ese valor sigue contando
  // como km real en la auditoría del tacógrafo. Se avisa, y que la oficina decida.
  const avisos: string[] = [];
  if ((cambia("origin") || cambia("destination")) && !trae("kilometros")) {
    avisos.push(
      // `?? 0` decía "quedaron en 0" cuando el viaje no tiene kilómetros cargados, que es
      // otra cosa: 0 km es una afirmación, y sin dato no hay nada que afirmar.
      trip.kilometros == null
        ? "Cambió el recorrido y el viaje no tiene kilómetros cargados. Ese número entra en la auditoría del tacógrafo: si lo sabés, cargalo."
        : `Cambió el recorrido pero los kilómetros quedaron en ${trip.kilometros}. Si ya no corresponden, corregilos: ese número entra en la auditoría del tacógrafo.`,
    );
  }

  return {
    avisos,
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
