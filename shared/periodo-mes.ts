/**
 * Un mes como período: "2026-09" → del 2026-09-01 al 2026-09-30.
 *
 * Los días son los que ya usa el resto (el Resumen, la lista de viajes, el consumo): el día UTC de la fecha
 * guardada, `started_at.slice(0, 10)`. Hay que seguir con esa misma regla y no inventar otra por pantalla, o el
 * mismo viaje caería en un mes acá y en otro en el Resumen.
 */

export const esMes = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** El primer y el último día del mes ("YYYY-MM-DD"), o `null` si no es un mes. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } | null {
  if (!esMes(mes)) return null;
  const [anio, m] = mes.split("-").map(Number);
  // El día 0 del mes siguiente es el último de éste.
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** El mes ("YYYY-MM") al que cae una fecha guardada ("2026-09-18 17:14:00"). */
export const mesDe = (fecha: string): string => fecha.slice(0, 7);
