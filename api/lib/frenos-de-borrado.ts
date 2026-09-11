/**
 * Los frenos para borrar un camión o un chofer desde Admin.
 *
 * Los dos botones existían desde el primer día sin freno, y la base decide sola en cada caso:
 *
 *   - `trips.truck_id` y `trips.driver_id` no tienen ON DELETE, así que con viajes la base
 *     rechaza el borrado y la oficina recibía "Error interno del servidor".
 *   - `fuel_logs.truck_id` y `lecturas_odometro.truck_id` son ON DELETE CASCADE: un camión sin
 *     viajes pero con surtidas se borraba llevándose su consumo entero, sin aviso.
 *   - `libreta.created_by` no tiene ON DELETE: el chofer que agregó un lugar de carga tampoco
 *     se puede borrar.
 *
 * El mensaje enumera lo que hay y dice por dónde seguir, igual que el de proveedores.
 */

export const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/** "a", "a y b", "a, b y c". */
export function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

export interface AtadoAlCamion {
  viajes: number;
  surtidas: number;
  lecturas: number;
}

/** Por qué no se puede borrar este camión, o `null` si se puede. */
export function motivoParaNoBorrarCamion(a: AtadoAlCamion): string | null {
  const partes: string[] = [];
  if (a.viajes > 0) partes.push(plural(a.viajes, "viaje", "viajes"));
  if (a.surtidas > 0) partes.push(plural(a.surtidas, "surtida", "surtidas"));
  if (a.lecturas > 0) {
    partes.push(plural(a.lecturas, "lectura del tacógrafo", "lecturas del tacógrafo"));
  }
  if (partes.length === 0) return null;

  return `No se puede borrar: tiene ${enumerar(partes)}. Es el historial del camión: su consumo, sus kilómetros y lo que se facturó salen de ahí. Si ya no se usa, dejalo en la lista: no molesta.`;
}

export interface AtadoAlChofer {
  viajes: number;
  surtidas: number;
  /** Lugares de carga que agregó él desde la app. */
  libreta: number;
}

/** Por qué no se puede borrar este chofer, o `null` si se puede. */
export function motivoParaNoBorrarChofer(a: AtadoAlChofer): string | null {
  const partes: string[] = [];
  if (a.viajes > 0) partes.push(plural(a.viajes, "viaje", "viajes"));
  if (a.surtidas > 0) partes.push(plural(a.surtidas, "surtida", "surtidas"));
  if (a.libreta > 0) {
    partes.push(plural(a.libreta, "lugar agregado a la libreta", "lugares agregados a la libreta"));
  }
  if (partes.length === 0) return null;

  return `No se puede borrar: tiene ${enumerar(partes)}. Es su historial: quién hizo cada viaje y cada surtida sale de ahí. Si ya no trabaja más, editalo y ponelo como Inactivo.`;
}
