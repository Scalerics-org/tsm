/**
 * Los litros como los tipea el chofer.
 *
 * "Depende de los celulares: en los litros de gasoil ponerle un formato solo. Echan 290 con 44
 * y no le ponen la coma. Después de las tres cifras siempre tiene que ser la coma, porque nunca
 * he cargado 500 mil." — Rodrigo, 21/9/2026.
 *
 * Hay teclados numéricos de Android que no traen coma ni punto: el chofer escribe 29044
 * queriendo decir 290,44 y se guardaban veintinueve mil litros. Como una carga (un tanque, o
 * la cámara de frío) nunca llega a mil litros, la cuarta cifra sin separador es siempre un
 * decimal. Si el teclado sí tiene coma o punto, manda lo que escribió.
 */

/** Ninguna carga llega a mil litros: por encima, es un tipeo sin coma. */
export const LITROS_MAX_POR_CARGA = 999.99;

export function litrosTipeados(texto: string): { mostrado: string; valor: number | null } {
  const limpio = texto.replace(/[^\d.,]/g, "");
  const sep = limpio.search(/[.,]/);

  let entero: string;
  let decimales: string;
  let conSeparador: boolean;
  if (sep >= 0) {
    entero = limpio.slice(0, sep).replace(/\D/g, "");
    decimales = limpio.slice(sep + 1).replace(/\D/g, "");
    conSeparador = true;
  } else {
    // Sin separador: las tres primeras cifras son el entero y lo que sigue, los decimales.
    entero = limpio.slice(0, 3);
    decimales = limpio.slice(3);
    conSeparador = limpio.length > 3;
  }
  entero = entero.slice(0, 3);
  decimales = decimales.slice(0, 2);

  if (!entero && !decimales) return { mostrado: conSeparador ? "," : "", valor: null };
  const mostrado = conSeparador ? `${entero},${decimales}` : entero;
  const valor = Number(`${entero || "0"}.${decimales || "0"}`);
  return { mostrado, valor: Number.isFinite(valor) ? valor : null };
}
