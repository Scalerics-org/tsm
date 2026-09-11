/**
 * La llegada corregida por la oficina, validada.
 *
 * Llega como ISO CON zona horaria, porque la oficina la tipea en hora de acá y el navegador la
 * pasa a UTC, que es como se guarda todo. Sin zona no se acepta: "2026-09-04 18:00" no dice si
 * son las 18 de Uruguay o las 18 UTC, y la diferencia son tres horas —justo la que ya tiene
 * corrida la app entera—.
 */

export const TOLERANCIA_FUTURO_MS = 5 * 60_000;
const CON_ZONA = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const deLaBase = (s: string) => new Date(s.replace(" ", "T") + "Z");
const aLaBase = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

export function llegadaCorregida(
  startedAt: string,
  llegada: unknown,
  ahora: Date,
): { ok: true; valor: string } | { ok: false; motivo: string } {
  if (typeof llegada !== "string" || !CON_ZONA.test(llegada.trim())) {
    return { ok: false, motivo: "La llegada tiene que venir con día, hora y zona horaria" };
  }
  const d = new Date(llegada.trim());
  if (isNaN(d.getTime())) return { ok: false, motivo: "La llegada no es una fecha válida" };
  if (d.getTime() > ahora.getTime() + TOLERANCIA_FUTURO_MS) {
    return { ok: false, motivo: "La llegada no puede ser en el futuro" };
  }
  if (d.getTime() < deLaBase(startedAt).getTime()) {
    return { ok: false, motivo: "La llegada no puede ser antes de la salida" };
  }
  return { ok: true, valor: aLaBase(d) };
}
