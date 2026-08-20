// La tabla de localidades y el cálculo de distancia se mudaron a shared/distancias.ts:
// el worker también los necesita, para completar solo los kilómetros del viaje al cerrarlo,
// y no puede importar de src/. Acá queda sólo lo que es de presentación.

export { estimateTravel, kmEstimados } from "@shared/distancias";

export function fmtDuration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Hora de llegada estimada (ahora + duración) como "HH:MM". */
export function etaClock(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  return d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}
