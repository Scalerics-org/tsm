/**
 * La clase de un vehículo de la tabla `trucks`: camión, remolque (acoplado o semirremolque) o
 * montacargas.
 *
 * Es un DATO, no algo que cada pantalla adivine mirando el "Tipo" (texto libre, con errores de
 * tipeo: "099- EMIREMOLQUE-S48 FURGON"). La migración 0056 lo completó una sola vez a partir del
 * Tipo; de ahí en más lo elige la oficina en el alta.
 *
 * Sólo los camiones andan en ruta: tienen chofer, tacógrafo, surtidas, consumo y viajes. Los
 * remolques y los montacargas sólo tienen ficha, documentos con vencimiento y Taller.
 */
export const CLASE_VEHICULO = {
  CAMION: "camion",
  REMOLQUE: "remolque",
  MONTACARGAS: "montacargas",
} as const;

export type ClaseVehiculo = (typeof CLASE_VEHICULO)[keyof typeof CLASE_VEHICULO];

export const CLASES_DE_VEHICULO: ClaseVehiculo[] = Object.values(CLASE_VEHICULO);

/** Lo que ve la oficina en el selector del alta. */
export const ETIQUETA_CLASE: Record<ClaseVehiculo, string> = {
  camion: "Camión",
  remolque: "Remolque o semirremolque",
  montacargas: "Montacargas",
};

/** Lo que dice la pestaña de la pantalla de Camiones. */
export const ETIQUETA_PESTANA_CLASE: Record<ClaseVehiculo, string> = {
  camion: "Camiones",
  remolque: "Remolques",
  montacargas: "Montacargas",
};

export function esClaseDeVehiculo(x: unknown): x is ClaseVehiculo {
  return typeof x === "string" && (CLASES_DE_VEHICULO as string[]).includes(x);
}

/**
 * La clase de una fila. Una fila SIN clase (una respuesta vieja, una pestaña abierta antes del
 * deploy) es un camión: es lo que eran todas hasta la migración.
 */
export function claseDe(v: { clase?: string | null }): ClaseVehiculo {
  return esClaseDeVehiculo(v.clase) ? v.clase : CLASE_VEHICULO.CAMION;
}

export const esCamion = (v: { clase?: string | null }) => claseDe(v) === CLASE_VEHICULO.CAMION;

/** Se queda con los camiones. Todo lo que mide ruta (consumo, tacógrafo, choferes) pasa por acá. */
export function soloCamiones<T extends { clase?: string | null }>(vehiculos: readonly T[]): T[] {
  return vehiculos.filter(esCamion);
}

export function deLaClase<T extends { clase?: string | null }>(vehiculos: readonly T[], clase: ClaseVehiculo): T[] {
  return vehiculos.filter((v) => claseDe(v) === clase);
}

export const MENSAJE_NO_ES_CAMION =
  "Ese vehículo no es un camión (es un remolque o un montacargas): no puede salir de viaje ni tener chofer.";
