/**
 * El mes en curso, en hora uruguaya, como "YYYY-MM".
 *
 * No es `toISOString()` como en el resto del código: acá el borde del mes ES el evento. A las
 * 22:00 del 31 en Montevideo ya son las 01:00 del 1 en UTC, y con UTC le pediríamos al chofer
 * la lectura del mes que viene mientras todavía está terminando éste.
 *
 * Lo usan la ruta de lecturas (para saber qué mes pedir) y la de viajes (para saber si puede
 * salir): tiene que ser el mismo mes en las dos, o el bloqueo pediría una lectura distinta de
 * la que el chofer acaba de cargar.
 */
export function periodoDeHoy(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" }).slice(0, 7);
}
