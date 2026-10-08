/**
 * Dónde está la ficha de un vehículo, leído de la URL: la pestaña (`?tab=`), la sección de Mantenimiento (`?sec=`) y la
 * parte de Ejes (`?sub=`). Son funciones puras para que las reglas de los enlaces viejos (`?tab=cubiertas`,
 * `?cubierta=4`) se prueben sin el router.
 */
import type { Componente } from "./tipos";

export type Pestana = "services" | "mantenimiento" | "historial";
export type Seccion = "ejes" | "motor" | "caja" | "diferencial" | "chasis" | "electricidad";
export type ParteDeEjes = "cubiertas" | "frenos" | "rodaje";

/** En el orden de la planilla. Ejes siempre está, aunque el vehículo no tenga dibujo (el montacargas). */
const ORDEN_DE_SECCIONES: Seccion[] = ["ejes", "motor", "caja", "diferencial", "chasis", "electricidad"];

export function seccionesDelVehiculo(componentes: Pick<Componente, "id">[]): Seccion[] {
  return ORDEN_DE_SECCIONES.filter((s) => s === "ejes" || componentes.some((c) => c.id === s));
}

export function pestanaDeLaUrl(params: URLSearchParams): Pestana {
  const tab = params.get("tab");
  if (tab === "services" || tab === "historial") return tab;
  // Las pestañas viejas (Cubiertas y Componentes) viven ahora dentro de Mantenimiento.
  if (tab === "mantenimiento" || tab === "cubiertas" || tab === "componentes") return "mantenimiento";
  // Un enlace a una cubierta (desde Stock o desde el recorrido) cae directo en Mantenimiento, con la cubierta abierta.
  return params.has("cubierta") ? "mantenimiento" : "services";
}

/** La sección pedida, si el vehículo la tiene; si no, Ejes. */
export function seccionDeLaUrl(params: URLSearchParams, disponibles: Seccion[]): Seccion {
  const sec = params.get("sec") as Seccion | null;
  return sec && disponibles.includes(sec) ? sec : "ejes";
}

export function parteDeEjesDeLaUrl(params: URLSearchParams): ParteDeEjes {
  const sub = params.get("sub");
  return sub === "frenos" || sub === "rodaje" ? sub : "cubiertas";
}
