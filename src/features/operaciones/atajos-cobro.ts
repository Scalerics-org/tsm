import type { LibretaEntry, TripSegment } from "@shared/domain";

export interface Atajo {
  id: number;
  nombre: string;
}

/**
 * Los atajos "cobrarle a uno de los destinatarios de esta carga", con el nombre de HOY.
 *
 * El texto que trae la carga (`clientes`) es el que se escribió cuando el chofer la cargó, y la
 * libreta se ordenó después: en producción 35 de 111 pares carga↔cliente ya no coincidían
 * ("Galpón" en la carga, "Galpón Santa María BU" en la libreta). Lo que se guarda al elegir sale
 * de la libreta por id, así que el botón tiene que decir ese mismo nombre y no el viejo: si dice
 * una cosa y guarda otra, el error es silencioso y termina en una factura.
 *
 * Sólo entran los que siguen existiendo en la lista de elegibles: un destinatario borrado o
 * agrupador ("Varios") no es alguien a quien se le pueda cobrar.
 */
export function atajosDeCarga(
  carga: Pick<TripSegment, "clientes" | "cliente_ids">,
  vigentes: Pick<LibretaEntry, "id" | "nombre">[],
): Atajo[] {
  const nombreDeHoy = new Map(vigentes.map((e) => [e.id, e.nombre]));
  const vistos = new Set<number>();
  const atajos: Atajo[] = [];
  for (const id of carga.cliente_ids) {
    const nombre = nombreDeHoy.get(id);
    if (nombre === undefined || vistos.has(id)) continue;
    vistos.add(id);
    atajos.push({ id, nombre });
  }
  return atajos;
}
