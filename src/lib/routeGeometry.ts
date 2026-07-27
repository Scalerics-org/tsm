import { api } from "./api";
import { haversineKm, type LatLon } from "@shared/geo";

export interface RouteGeometry {
  geometry: LatLon[]; // puntos por calle (OSRM)
  distance_km: number; // largo total de la ruta por calle
  cumKm: number[]; // distancia acumulada hasta cada punto
}

/** Trae la geometría por calles entre dos puntos y precalcula distancias acumuladas. */
export async function fetchRouteGeometry(from: LatLon, to: LatLon): Promise<RouteGeometry | null> {
  try {
    const r = await api.get<{ distance_km: number; geometry: LatLon[] }>(
      `/geo/route?fromLat=${from.lat}&fromLon=${from.lon}&toLat=${to.lat}&toLon=${to.lon}`,
    );
    if (!r.geometry || r.geometry.length < 2) return null;
    const cumKm: number[] = [0];
    for (let i = 1; i < r.geometry.length; i++) {
      cumKm.push(cumKm[i - 1] + haversineKm(r.geometry[i - 1], r.geometry[i]));
    }
    return { geometry: r.geometry, distance_km: r.distance_km, cumKm };
  } catch {
    return null;
  }
}

/** Índice del punto de la geometría más cercano a una distancia recorrida dada. */
export function indexAtDistance(cumKm: number[], km: number): number {
  if (km <= 0) return 0;
  const total = cumKm[cumKm.length - 1];
  if (km >= total) return cumKm.length - 1;
  // búsqueda lineal simple (geometrías de pocos cientos de puntos)
  for (let i = 1; i < cumKm.length; i++) {
    if (cumKm[i] >= km) return i;
  }
  return cumKm.length - 1;
}
