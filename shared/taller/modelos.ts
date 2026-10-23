import type { Modelo } from "./tipos";

/** Los modelos de cubierta de la maqueta. En la fase 4 pasan a la tabla cubierta_modelos. */
export const MODELOS: Record<string, Modelo> = {
  r269: { id: "r269", nombre: "Bridgestone R269", medida: "295/80 R22.5" },
  multi: { id: "multi", nombre: "Michelin X Multi Z", medida: "295/80 R22.5" },
  fr85: { id: "fr85", nombre: "Pirelli FR85", medida: "295/80 R22.5" },
  kmax: { id: "kmax", nombre: "Goodyear KMax D", medida: "295/80 R22.5" },
};
