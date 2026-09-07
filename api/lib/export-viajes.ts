import type { Trip, TripTemplate } from "../../shared/domain";
import { columnasDe, type ColumnaResumen } from "./resumen-cliente";

/**
 * Las filas del Excel con el que la oficina factura.
 *
 * Vivía adentro del handler, así que el entregable del negocio no tenía —ni podía tener— un
 * solo test. Sale acá para poder fijar las tres reglas que importan: una fila por carga (no
 * por viaje), el viaje sin cargas igual aparece, y el combinado genérico usa el tramo del
 * renglón en vez del tramo del viaje.
 */

/** Las columnas fijas de la izquierda: el viaje y la carga. */
const CABECERA_VIAJE = [
  "ID viaje",
  "Fecha",
  "Cliente",
  "Origen",
  "Destino",
  "Lugar de carga",
  "Clientes de la carga",
  "Cantidad",
  "Unidad",
  "N° remito",
  "Se cobra a",
  "Tipo",
  "Kilos",
  "Km",
];

/** Y las de la derecha: quién lo hizo, cuándo, y lo que anotó. */
const CABECERA_CIERRE = ["Chofer", "Camión", "Estado", "Inicio", "Fin", "Observaciones"];

export type Celda = string | number | null;

/**
 * Las columnas de los campos de plantilla que corresponden a ESTOS viajes.
 *
 * "NO HAY CÓMO MEJORAR LOS ARCHIVOS Q EXPORTÁS? ES DECIR EN UN FORMATO MÁS ORDENADO QUE ME
 * QUEDE PARA GUARDAR MÁS PROLIJO." — el cliente. Antes los campos se aplastaban todos en una
 * sola celda llamada "Campos", unidos con "·": el remito, la boleta y el número de orden en
 * el mismo texto. En Excel eso no se puede filtrar, ni ordenar, ni sumar.
 *
 * Salen de las plantillas de los viajes exportados y no de todas: filtrando por Casarone no
 * tienen por qué aparecer las columnas de Cañuelas vacías. Como el filtro del export ahora
 * funciona, esto es lo que hace que un export filtrado salga angosto.
 *
 * Al final se agregan las claves que quedaron sueltas. Es la parte que parece de más y no lo
 * es: un campo que la oficina sacó de la plantilla sigue teniendo valores guardados en los
 * viajes viejos, y la celda "Campos" los mostraba igual porque recorría `field_values`, no la
 * plantilla. Sin esto, pasar a columnas cambiaría un Excel feo por uno incompleto —y en
 * silencio, que es la peor forma de perder un dato.
 */
export function columnasDeExport(trips: Trip[], templates: TripTemplate[]): ColumnaResumen[] {
  const usadas = new Set(trips.map((t) => t.template_id).filter((id): id is number => id != null));
  const columnas = columnasDe(templates.filter((tpl) => usadas.has(tpl.id)));

  const cubiertas = new Set(columnas.map((c) => c.key));
  for (const t of trips) {
    for (const key of Object.keys(t.field_values ?? {})) {
      if (cubiertas.has(key)) continue;
      cubiertas.add(key);
      // Sin plantilla no hay etiqueta linda: la clave es lo único que se sabe, y es mejor que
      // una columna sin nombre o que perder el valor.
      columnas.push({ key, label: key, totaliza: false });
    }
  }
  return columnas;
}

/** El encabezado del archivo, con los campos de plantilla en el medio. */
export function encabezadoDeExport(columnas: ColumnaResumen[]): string[] {
  return [...CABECERA_VIAJE, ...columnas.map((c) => c.label), ...CABECERA_CIERRE];
}

/**
 * Una fila por carga. Un viaje de tres paradas son tres renglones facturables y tres filas:
 * juntarlos en una perdería justo el detalle por el que se cobra.
 *
 * `columnas` tiene que ser la misma lista con la que se armó el encabezado, o las celdas
 * aterrizan corridas. Por eso las dos salen de `columnasDeExport` y no cada una por su lado.
 */
export function filasDeViaje(t: Trip, columnas: ColumnaResumen[]): Celda[][] {
  const comunes: Celda[] = [t.id, t.started_at.slice(0, 10), t.provider_name];
  const cola: Celda[] = [
    t.kilos_carga ?? "",
    t.kilometros ?? "",
    ...columnas.map((c) => t.field_values?.[c.key] ?? ""),
    t.driver_name ?? "",
    t.truck_plate ?? "",
    t.status,
    t.started_at,
    t.finished_at ?? "",
    t.notes ?? "",
  ];

  // Sin cargas el viaje igual va: existió, tiene chofer y kilómetros, y esconderlo del Excel
  // sería esconder trabajo hecho.
  if (!t.segments.length) {
    return [
      [...comunes, t.origin, t.destination, t.remite ?? "", t.destinatario ?? "", "", "", "", "", "", ...cola],
    ];
  }

  return t.segments.map((s) => [
    ...comunes,
    // En el combinado genérico cada carga tiene su propio tramo; en los demás hereda el del viaje.
    s.origen ?? t.origin,
    s.destino ?? t.destination,
    s.remitente,
    s.clientes.join(" / "),
    s.cantidad ?? "",
    s.unidad ?? "",
    s.remito ?? "",
    s.cobro_a ?? "",
    s.cobro_tipo ?? "",
    ...cola,
  ]);
}
