// Estimación de tiempo de viaje sin depender de servicios externos:
// tabla de localidades de Uruguay + distancia (Haversine × factor de ruta) / velocidad media.

interface LatLon {
  lat: number;
  lon: number;
}

// Nombre normalizado (minúsculas, sin acentos) → coordenadas.
const CITIES: Record<string, LatLon> = {
  montevideo: { lat: -34.9011, lon: -56.1645 },
  canelones: { lat: -34.5378, lon: -56.2842 },
  "colonia del sacramento": { lat: -34.4626, lon: -57.84 },
  colonia: { lat: -34.4626, lon: -57.84 },
  "punta del este": { lat: -34.96, lon: -54.95 },
  maldonado: { lat: -34.9087, lon: -54.9586 },
  minas: { lat: -34.3757, lon: -55.2377 },
  florida: { lat: -34.0994, lon: -56.2144 },
  durazno: { lat: -33.3809, lon: -56.5231 },
  trinidad: { lat: -33.5236, lon: -56.9014 },
  mercedes: { lat: -33.2524, lon: -58.0269 },
  "fray bentos": { lat: -33.1386, lon: -58.3033 },
  paysandu: { lat: -32.3214, lon: -58.0756 },
  salto: { lat: -31.3833, lon: -57.9667 },
  tacuarembo: { lat: -31.7333, lon: -55.9833 },
  rivera: { lat: -30.9053, lon: -55.5508 },
  melo: { lat: -32.3696, lon: -54.1671 },
  "treinta y tres": { lat: -33.2333, lon: -54.3833 },
  rocha: { lat: -34.4833, lon: -54.3333 },
  "san jose de mayo": { lat: -34.3375, lon: -56.7136 },
  "san jose": { lat: -34.3375, lon: -56.7136 },
  artigas: { lat: -30.4, lon: -56.4667 },
  "bella union": { lat: -30.2597, lon: -57.6003 },
  chuy: { lat: -33.6971, lon: -53.4616 },
};

const ALIASES: Record<string, string> = {
  mdeo: "montevideo",
  mvd: "montevideo",
};

function norm(s: string): string {
  const n = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "") // quita "(frontera)", "(retiro)", etc.
    .trim();
  return ALIASES[n] ?? n;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ROAD_FACTOR = 1.25; // las rutas no son línea recta
const AVG_KMH = 70; // velocidad media de un camión cargado

/** Devuelve {km, hours} estimados, o null si no reconoce origen/destino. */
export function estimateTravel(origin: string, dest: string): { km: number; hours: number } | null {
  const o = CITIES[norm(origin)];
  const d = CITIES[norm(dest)];
  if (!o || !d) return null;
  const km = haversineKm(o, d) * ROAD_FACTOR;
  if (km < 1) return { km: 0, hours: 0 };
  return { km: Math.round(km), hours: km / AVG_KMH };
}

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
