import { DRIVER_STATUS } from "../../shared/domain";

/**
 * Quién entra cuando se teclea una patente y un PIN.
 *
 * El chofer entra con la patente de SU camión, así que la patente no identifica a una persona:
 * identifica a un camión, y de un camión puede colgar más de un chofer. Antes se traía una sola
 * fila (`.first()`, sin ORDER BY, filtrando activos) y eso dejaba dos agujeros:
 *
 *   - Dos choferes activos en el mismo camión: entraba el que la base devolviera primero y el
 *     otro leía "Patente o PIN incorrectos" con su PIN bien puesto.
 *   - El dado de baja leía ese mismo mensaje, y su intento contaba para el bloqueo de la
 *     patente (5 fallos → 15 minutos), que deja afuera también al chofer activo del camión.
 *
 * Ahora se prueban todos los candidatos de la patente. El PIN correcto de alguien dado de baja
 * no es un intento fallido: es una persona que no sabe que la dieron de baja.
 */

export interface CandidatoChofer {
  id: number;
  status: string;
  pin_hash: string | null;
}

export type ResultadoIngreso =
  | { tipo: "entra"; id: number }
  | { tipo: "inactivo"; id: number }
  | { tipo: "no" };

const esActivo = (c: CandidatoChofer) => c.status === DRIVER_STATUS.ACTIVO;

/**
 * `verificar` recibe el hash guardado y dice si el PIN tecleado coincide. Se pasa desde afuera
 * para que esta decisión se pueda probar sin criptografía de por medio.
 */
export async function quienEntra(
  candidatos: CandidatoChofer[],
  verificar: (hash: string) => Promise<boolean>,
): Promise<ResultadoIngreso> {
  // Los activos primero: si un dado de baja comparte el PIN, el que trabaja es el que entra.
  const enOrden = [...candidatos.filter(esActivo), ...candidatos.filter((c) => !esActivo(c))];
  for (const c of enOrden) {
    if (!c.pin_hash) continue;
    if (!(await verificar(c.pin_hash))) continue;
    return esActivo(c) ? { tipo: "entra", id: c.id } : { tipo: "inactivo", id: c.id };
  }
  return { tipo: "no" };
}
