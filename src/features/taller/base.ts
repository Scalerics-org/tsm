import type { Modelo } from "./tipos";

/** "Hoy" de la maqueta: fijo, así los días y las capturas no cambian de un día para el otro. */
export const HOY = "2026-10-05";

export const MODELOS: Record<string, Modelo> = {
  r269: { id: "r269", nombre: "Bridgestone R269", medida: "295/80 R22.5" },
  multi: { id: "multi", nombre: "Michelin X Multi Z", medida: "295/80 R22.5" },
  fr85: { id: "fr85", nombre: "Pirelli FR85", medida: "295/80 R22.5" },
  kmax: { id: "kmax", nombre: "Goodyear KMax D", medida: "295/80 R22.5" },
};
