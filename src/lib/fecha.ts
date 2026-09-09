/**
 * Fechas en día/mes/año, que es como se escriben y se leen acá.
 *
 * `<input type="date">` NO elige su formato: lo elige el navegador según el idioma que tenga
 * configurado. Con Chrome en inglés muestra 08/03/2026 para el 3 de agosto, justo al lado del
 * texto que nosotros sí formateamos y que dice 03/08/2026 — dos formatos contradiciéndose en
 * la misma pantalla, en un campo que decide a qué mes va a parar un viaje.
 *
 * Y no se arregla con `lang`: Chrome mira su propio idioma, no el del documento. Por eso el
 * campo pasa a ser nuestro (`components/FechaInput`) y estas dos funciones son la traducción
 * entre lo que se ve y lo que viaja al servidor, que sigue siendo ISO.
 */

/** "2026-08-03" (con o sin hora) → "03/08/2026". Vacío si no hay fecha. */
export function aTexto(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Cuántos días tiene ese mes, contando los bisiestos. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * "03/08/2026" → "2026-08-03". Vacío si está a medio escribir o no existe.
 *
 * Se valida que el día exista de verdad en ese mes: un 31 de abril no es un tipeo cualquiera
 * —el navegador lo correría al 1 de mayo— y en un viaje eso lo manda al mes que no es, que es
 * justo donde cambia el resumen con el que se factura.
 */
export function aIso(texto: string): string {
  const m = texto.trim().match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
  if (!m) return "";

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return "";

  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Lo que se muestra mientras se escribe: las barras las pone el campo, así tipear ocho
 * números alcanza.
 *
 * `borrando` existe porque sin eso el campo se traba: al borrar el último dígito de "03/" se
 * vuelve a agregar la barra sola y no se puede pasar de ahí.
 */
export function tipeando(valor: string, opts: { borrando?: boolean } = {}): string {
  const n = valor.replace(/\D/g, "").slice(0, 8);
  if (!n) return "";

  const partes = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 8)].filter(Boolean);
  let salida = partes.join("/");
  // Mientras se avanza, la barra se agrega apenas el campo se completa, para no tener que
  // tipearla. Borrando, no: sería volver a poner lo que se acaba de sacar.
  if (!opts.borrando && (n.length === 2 || n.length === 4)) salida += "/";
  return salida;
}
