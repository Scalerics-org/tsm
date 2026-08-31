import type { Trip } from "../../shared/domain";

/**
 * Las filas del Excel con el que la oficina factura.
 *
 * Vivía adentro del handler, así que el entregable del negocio no tenía —ni podía tener— un
 * solo test. Sale acá para poder fijar las tres reglas que importan: una fila por carga (no
 * por viaje), el viaje sin cargas igual aparece, y el combinado genérico usa el tramo del
 * renglón en vez del tramo del viaje.
 */

export const CSV_HEADER = [
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
  "Campos",
  "Chofer",
  "Camión",
  "Estado",
  "Inicio",
  "Fin",
  "Observaciones",
];

export type Celda = string | number | null;

/**
 * Una fila por carga. Un viaje de tres paradas son tres renglones facturables y tres filas:
 * juntarlos en una perdería justo el detalle por el que se cobra.
 */
export function filasDeViaje(t: Trip, campos: string): Celda[][] {
  const comunes: Celda[] = [t.id, t.started_at.slice(0, 10), t.provider_name];
  const cola: Celda[] = [
    t.kilos_carga ?? "",
    t.kilometros ?? "",
    campos,
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
