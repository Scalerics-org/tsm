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


