// Distancia entre localidades sin depender de servicios externos:
// tabla de coordenadas + Haversine × factor de ruta.
//
// Vive en shared/ y no en src/ porque lo usan los dos lados: la pantalla del chofer para
// mostrarle la hora estimada de llegada, y el worker para completar solo los kilómetros del
// viaje al cerrarlo. "Yo sé cuántos kilómetros hay de donde ellos cargan a donde descargan.
// Y además la aplicación vos me lo estás dando."

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
  lavalleja: { lat: -34.3757, lon: -55.2377 },
  florida: { lat: -34.0994, lon: -56.2144 },
  durazno: { lat: -33.3809, lon: -56.5231 },
  trinidad: { lat: -33.5236, lon: -56.9014 },
  flores: { lat: -33.5236, lon: -56.9014 },
  mercedes: { lat: -33.2524, lon: -58.0269 },
  soriano: { lat: -33.2524, lon: -58.0269 },
  "fray bentos": { lat: -33.1386, lon: -58.3033 },
  "rio negro": { lat: -33.1386, lon: -58.3033 },
  paysandu: { lat: -32.3214, lon: -58.0756 },
  salto: { lat: -31.3833, lon: -57.9667 },
  tacuarembo: { lat: -31.7333, lon: -55.9833 },
  rivera: { lat: -30.9053, lon: -55.5508 },
  melo: { lat: -32.3696, lon: -54.1671 },
  "cerro largo": { lat: -32.3696, lon: -54.1671 },
  "treinta y tres": { lat: -33.2333, lon: -54.3833 },
  rocha: { lat: -34.4833, lon: -54.3333 },
  "san jose de mayo": { lat: -34.3375, lon: -56.7136 },
  "san jose": { lat: -34.3375, lon: -56.7136 },
  artigas: { lat: -30.4, lon: -56.4667 },
  "bella union": { lat: -30.2597, lon: -57.6003 },
  chuy: { lat: -33.6971, lon: -53.4616 },
  // Argentina — el destino de los vacíos internacionales y de los viajes de carga.
  "arg. san salvador": { lat: -31.6236, lon: -58.5061 },
  "san salvador": { lat: -31.6236, lon: -58.5061 },
  "arg. rosario": { lat: -32.9442, lon: -60.6505 },
  "arg. gualeguaychu": { lat: -33.0095, lon: -58.5172 },
  "arg. chacabuco": { lat: -34.6408, lon: -60.4739 },
  "arg. mercedes ctes.": { lat: -29.1833, lon: -58.0833 },
  concordia: { lat: -31.3928, lon: -58.0209 },
};

const ALIASES: Record<string, string> = {
  mdeo: "montevideo",
  mvd: "montevideo",
  bu: "bella union",
  paysandú: "paysandu",
};

/** Marcas de acento que NFD deja sueltas. Se arma por código para no meter caracteres
 *  combinantes literales en el fuente, que se corrompen fácil al editar. */
const COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");

function norm(s: string): string {
  const n = s
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINANTES, "")
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
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ROAD_FACTOR = 1.25; // las rutas no son línea recta
const AVG_KMH = 70; // velocidad media de un camión cargado

/**
 * Kilómetros estimados entre dos lugares. `null` si no reconoce alguno de los dos.
 *
 * Es un aproximado y así se usa: alcanza para el control de fin de mes ("ahí yo voy a tener
 * una referencia, un aproximado"), no para facturar por kilómetro. Donde el kilómetro es el
 * dato que se cobra, se le pide al chofer.
 */
export function kmEstimados(origen: string | null, destino: string | null): number | null {
  if (!origen || !destino) return null;
  const o = CITIES[norm(origen)];
  const d = CITIES[norm(destino)];
  if (!o || !d) return null;
  return Math.round(haversineKm(o, d) * ROAD_FACTOR);
}

/** Devuelve {km, hours} estimados, o null si no reconoce origen/destino. */
export function estimateTravel(origin: string, dest: string): { km: number; hours: number } | null {
  const km = kmEstimados(origin, dest);
  if (km == null) return null;
  return { km, hours: km / AVG_KMH };
}
