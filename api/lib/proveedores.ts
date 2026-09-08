/**
 * Los frenos de las dos operaciones destructivas sobre un proveedor.
 *
 * El backend de proveedores existía entero desde el primer día —crear, renombrar, borrar—
 * pero nunca hubo pantalla. Nadie lo usó, así que nadie descubrió que ninguna de las dos
 * operaciones peligrosas tiene freno. Ponerles un botón sin taparlas es publicar el agujero.
 */

export interface AtadoAlProveedor {
  viajes: number;
  plantillas: number;
  /** Entradas de la libreta con el alcance puesto en este proveedor. */
  libreta: number;
}

const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * Por qué no se puede borrar este proveedor, o `null` si se puede.
 *
 * `trip_templates.provider_id` y `libreta.provider_id` son ON DELETE CASCADE: borrar
 * "Casarone" se lleva puesta su plantilla, y con ella la posibilidad de que el chofer salga a
 * hacer ese viaje. Los viajes no se borran —`trips.provider_name` es texto— pero quedan
 * apuntando a un proveedor que ya no está, y el resumen para facturar deja de encontrarlos.
 *
 * El mensaje enumera lo que hay colgando y dice por dónde seguir: un "no se puede" sin salida
 * deja a la oficina sin saber qué hacer.
 */
export function motivoParaNoBorrar(a: AtadoAlProveedor): string | null {
  const partes: string[] = [];
  if (a.viajes > 0) partes.push(plural(a.viajes, "viaje", "viajes"));
  if (a.plantillas > 0) partes.push(plural(a.plantillas, "plantilla", "plantillas"));
  if (a.libreta > 0) partes.push(plural(a.libreta, "entrada de la libreta", "entradas de la libreta"));
  if (partes.length === 0) return null;

  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;

  return `No se puede borrar: tiene ${lista}. Borrarlo se llevaría las plantillas puestas y dejaría los viajes sin proveedor en el resumen para facturar. Si ya no trabajás con él, dejalo: no molesta, y los viajes viejos se siguen pudiendo facturar.`;
}
