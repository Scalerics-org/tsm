// Utilidades geográficas compartidas (frontend y backend).

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distancia en km entre dos puntos (fórmula de Haversine). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Suma la distancia acumulada de una secuencia de puntos GPS. */
export function totalPathKm(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Descarta un punto nuevo si está demasiado cerca del anterior (ruido de GPS)
 * o si el salto es implausiblemente grande (outlier). Devuelve true si el punto
 * debe contarse para el acumulado de km.
 */
export function isPlausibleStep(
  prev: LatLon | null,
  next: LatLon,
  opts: { minMeters?: number; maxJumpKm?: number } = {},
): boolean {
  if (!prev) return true;
  const minKm = (opts.minMeters ?? 15) / 1000;
  const maxJumpKm = opts.maxJumpKm ?? 30;
  const d = haversineKm(prev, next);
  return d >= minKm && d <= maxJumpKm;
}
