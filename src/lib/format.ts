/**
 * Un timestamp del servidor como `Date`.
 *
 * El servidor guarda en UTC y sin zona ("2026-09-18 17:14:00", el `datetime('now')` de SQLite).
 * Leído tal cual, el navegador lo toma como hora LOCAL: todas las horas de la app salían tres
 * horas adelantadas —el chofer salía a las 14:14 y decía 17:14—. Si no trae zona, es UTC.
 */
export function desdeServidor(iso: string): Date {
  const conT = iso.trim().replace(" ", "T");
  const tieneZona = /(Z|[+-]\d{2}:?\d{2})$/.test(conT);
  return new Date(tieneZona ? conT : `${conT}Z`);
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = desdeServidor(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // Una fecha sola (un vencimiento, un día elegido) es ese día y no se convierte: como UTC,
  // el 1/10 a las 00:00 en Uruguay todavía es 30/9.
  const soloDia = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloDia) return `${soloDia[3]}/${soloDia[2]}/${soloDia[1]}`;
  const d = desdeServidor(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}



/**
 * "24/09 → 25/09": el rango de días de un viaje para columnas angostas.
 *
 * Sin año cuando todo cae en el año en curso; si alguna de las dos fechas es de otro año, las
 * dos llevan año (un "24/12 → 02/01" sin año miente). Sin `hasta` no hay flecha: un viaje en
 * curso es sólo "24/09". Devuelve también el detalle completo, para el tooltip.
 */
export function fmtRangoDeDias(
  desde: string | null,
  hasta: string | null,
  hoy: Date = new Date(),
): { corto: string; detalle: string } {
  const d1 = desde ? desdeServidor(desde) : null;
  const d2 = hasta ? desdeServidor(hasta) : null;
  const v1 = d1 && !isNaN(d1.getTime()) ? d1 : null;
  const v2 = d2 && !isNaN(d2.getTime()) ? d2 : null;
  const anios = [v1, v2].filter((d): d is Date => !!d).map((d) => d.getFullYear());
  const conAnio = anios.some((a) => a !== hoy.getFullYear());
  // A mano y no con toLocaleDateString: sin año, es-UY devuelve "24/9" en vez de "24/09".
  const dos = (n: number) => String(n).padStart(2, "0");
  const dia = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}${conAnio ? `/${d.getFullYear()}` : ""}`;
  const partes = [v1, v2].filter((d): d is Date => !!d).map(dia);
  const detalle = [desde && `Salida: ${fmtDateTime(desde)}`, hasta && `Descarga: ${fmtDateTime(hasta)}`]
    .filter(Boolean)
    .join("\n");
  return { corto: partes.length ? partes.join(" → ") : "—", detalle };
}
