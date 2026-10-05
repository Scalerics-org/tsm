import { posiciones, type Disposicion, type Posicion } from "./disposicion";

export type TipoService = "A" | "A+B" | "R+A+B";

export interface Modelo {
  id: string;
  nombre: string;
  medida: string;
}

/** Una cubierta que estuvo antes en esa posición. */
export interface PuestaAnterior {
  codigo: string;
  modeloId: string;
  desde: string;
  hasta: string;
  kmRecorridos: number;
  motivo: string;
}

export interface Cubierta {
  numero: number;
  codigo: string;
  modeloId: string;
  /** Día en que se colocó (AAAA-MM-DD). */
  fecha: string;
  /** El odómetro del vehículo cuando se la colocó. */
  kmInicial: number;
  obs: string;
  anteriores: PuestaAnterior[];
}

export interface Service {
  tipo: TipoService;
  fecha: string;
  km: number;
  chofer: string;
  mecanico: string;
  obs: string;
}

export interface Vehiculo {
  patente: string;
  tipo: "camion" | "semirremolque";
  descripcion: string;
  disposicion: Disposicion;
  /** Odómetro actual. */
  km: number;
  /** Cuánto anda por día, para estimar la fecha del próximo service. */
  kmPorDia: number;
  cubiertas: Cubierta[];
  services: Service[];
}

/** Datos de ejemplo: la vida útil con la que se pintan las cubiertas. La real la define Rodrigo. */
export const VIDA_UTIL_KM = 100_000;
export const UMBRAL_AMBAR = 0.7;
export const UMBRAL_ROJO = 0.9;

export type Estado = "verde" | "ambar" | "rojo";

export const kmRecorridos = (v: Vehiculo, c: Cubierta) => Math.max(0, v.km - c.kmInicial);
export const porcentajeDeVida = (km: number) => km / VIDA_UTIL_KM;
export function estadoDe(km: number): Estado {
  const p = porcentajeDeVida(km);
  return p >= UMBRAL_ROJO ? "rojo" : p >= UMBRAL_AMBAR ? "ambar" : "verde";
}

export const ESTADO_TEXTO: Record<Estado, string> = {
  verde: "En buen estado",
  ambar: "Para ir mirando",
  rojo: "Para cambiar",
};

export interface PosicionConCubierta {
  posicion: Posicion;
  cubierta: Cubierta | undefined;
  km: number;
  estado: Estado | null;
}

export function cubiertasPorPosicion(v: Vehiculo): PosicionConCubierta[] {
  return posiciones(v.disposicion).map((posicion) => {
    const cubierta = v.cubiertas.find((c) => c.numero === posicion.numero);
    const km = cubierta ? kmRecorridos(v, cubierta) : 0;
    return { posicion, cubierta, km, estado: cubierta ? estadoDe(km) : null };
  });
}

// ── Services ──
/** Cada cuántos km toca un service, y el ciclo (de ejemplo): A, A+B, A, R+A+B. */
export const KM_ENTRE_SERVICES = 15_000;
export const CICLO: TipoService[] = ["A", "A+B", "A", "R+A+B"];
const AVISO_KM = 2_500;

export interface ProximoService {
  tipo: TipoService;
  km: number;
  faltan: number;
  dias: number;
  fechaEstimada: string;
  estado: Estado;
}

export function ultimoService(v: Vehiculo): Service | undefined {
  return [...v.services].sort((a, b) => b.km - a.km)[0];
}

export function proximoService(v: Vehiculo, hoy: string): ProximoService {
  const base = ultimoService(v)?.km ?? 0;
  const km = base + KM_ENTRE_SERVICES;
  const orden = Math.round(km / KM_ENTRE_SERVICES);
  const tipo = CICLO[(((orden - 1) % CICLO.length) + CICLO.length) % CICLO.length];
  const faltan = km - v.km;
  const dias = Math.max(0, Math.round(faltan / v.kmPorDia));
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const estado: Estado = faltan <= 0 ? "rojo" : faltan <= AVISO_KM ? "ambar" : "verde";
  return { tipo, km, faltan, dias, fechaEstimada: fecha.toISOString().slice(0, 10), estado };
}

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString("es-UY")} km`;
