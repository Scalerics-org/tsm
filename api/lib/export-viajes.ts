import type { Trip, TripTemplate } from "../../shared/domain";
import { columnasDe } from "./resumen-cliente";

/**
 * Las filas del Excel con el que la oficina factura.
 *
 * Vivía adentro del handler, así que el entregable del negocio no tenía —ni podía tener— un
 * solo test. Sale acá para poder fijar las tres reglas que importan: una fila por carga (no
 * por viaje), el viaje sin cargas igual aparece, y el combinado genérico usa el tramo del
 * renglón en vez del tramo del viaje.
 */

/** Un campo de plantilla como columna del Excel. */
export interface ColumnaCampo {
  key: string;
  label: string;
  /**
   * Si la columna es una cantidad (kilos, pallets) y no un identificador (remito, MIC, hoja
   * de ruta). Sólo las cantidades salen como número; un remito viaja como texto para que
   * "0012345" no llegue al Excel convertido en 12345.
   */
  totaliza: boolean;
}

/** Lo que va antes de los campos de la plantilla: el viaje y la carga. */
export const COLUMNAS_ANTES = [
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

/** Y lo que va después: quién lo hizo y cómo terminó. */
export const COLUMNAS_DESPUES = ["Chofer", "Camión", "Estado", "Inicio", "Fin", "Observaciones"];

/**
 * Qué columnas de campos lleva esta exportación.
 *
 * "NO HAY CÓMO MEJORAR LOS ARCHIVOS Q EXPORTÁS? ES DECIR EN UN FORMATO MÁS ORDENADO QUE ME
 * QUEDE PARA GUARDAR MÁS PROLIJO." Todos los campos de plantilla iban apelmazados en una sola
 * celda ("remito: 113430 · boleta: 8842 · orden: 17"), así que no se podía ordenar, filtrar ni
 * sumar por ninguno. Ahora cada uno es una columna.
 *
 * Salen de las plantillas de los viajes exportados y no de TODAS: con las 26 plantillas el
 * Excel de un cliente se llenaría de columnas vacías de los otros.
 *
 * Un campo que quedó guardado en un viaje pero ya no está en su plantilla —la plantilla
 * cambió después— se agrega igual, con la key como título: en la celda apelmazada se veía, y
 * perderlo al pasar a columnas sería cambiar un formato feo por un dato menos.
 */
export function columnasDeCampos(trips: Trip[], templates: TripTemplate[]): ColumnaCampo[] {
  const usadas = new Set(trips.map((t) => t.template_id).filter((id): id is number => id != null));
  const columnas: ColumnaCampo[] = columnasDe(templates.filter((t) => usadas.has(t.id)));

  const vistas = new Set(columnas.map((c) => c.key));
  for (const t of trips) {
    for (const key of Object.keys(t.field_values ?? {})) {
      if (vistas.has(key)) continue;
      vistas.add(key);
      // Sin plantilla que lo describa no se sabe si es una cantidad: va como texto, que es
      // lo que no rompe nada.
      columnas.push({ key, label: key, totaliza: false });
    }
  }
  return columnas;
}

export const encabezado = (campos: ColumnaCampo[]): string[] => [
  ...COLUMNAS_ANTES,
  ...campos.map((c) => c.label),
  ...COLUMNAS_DESPUES,
];

export type Celda = string | number | null;

/**
 * El valor de un campo, como número cuando la columna es una cantidad.
 *
 * Los `field_values` se guardan siempre como texto, así que los kilos llegaban al Excel como
 * "28.07": con el Excel en español eso entra como texto y la columna no se puede sumar. Sólo
 * se convierte lo que la plantilla dice que es cantidad, y sólo si de verdad es un número.
 */
function valorDeCampo(crudo: string | undefined, col: ColumnaCampo): Celda {
  const v = crudo ?? "";
  if (!col.totaliza || v.trim() === "") return v;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : v;
}

/**
 * Una fila por carga. Un viaje de tres paradas son tres renglones facturables y tres filas:
 * juntarlos en una perdería justo el detalle por el que se cobra.
 */
export function filasDeViaje(t: Trip, campos: ColumnaCampo[]): Celda[][] {
  const comunes: Celda[] = [t.id, t.started_at.slice(0, 10), t.provider_name];
  const cola: Celda[] = [
    t.kilos_carga ?? "",
    t.kilometros ?? "",
    ...campos.map((c) => valorDeCampo(t.field_values?.[c.key], c)),
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
