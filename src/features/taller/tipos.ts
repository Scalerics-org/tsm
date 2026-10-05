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

export type TipoVehiculo = "camion" | "semirremolque" | "acoplado" | "montacargas";

/** Una pieza de un componente (alternador, correas, cabina…) y cómo está. */
export type CondicionPieza = "original" | "reparado" | "nuevo";
export interface PiezaDeComponente {
  nombre: string;
  condicion: CondicionPieza;
  /** Km (u horas) del vehículo cuando se la repuso o reparó. */
  alKm: number;
  fecha: string;
  obs: string;
}
export interface Componente {
  id: string;
  nombre: string;
  piezas: PiezaDeComponente[];
  obs: string;
}

export interface Vehiculo {
  patente: string;
  tipo: TipoVehiculo;
  descripcion: string;
  /** Sin disposición no hay cubiertas que dibujar (el montacargas no las lleva en la maqueta). */
  disposicion: Disposicion | null;
  /** Lo que mide el vehículo: km en el odómetro, horas en el montacargas. */
  unidad: "km" | "h";
  /** Odómetro (o horímetro) actual. */
  km: number;
  /** Cada cuánto toca un service, en esa unidad. */
  cadaService: number;
  /** Cuánto usa por día, para estimar la fecha del próximo service. */
  kmPorDia: number;
  cubiertas: Cubierta[];
  services: Service[];
  componentes: Componente[];
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
  if (!v.disposicion) return [];
  return posiciones(v.disposicion).map((posicion) => {
    const cubierta = v.cubiertas.find((c) => c.numero === posicion.numero);
    const km = cubierta ? kmRecorridos(v, cubierta) : 0;
    return { posicion, cubierta, km, estado: cubierta ? estadoDe(km) : null };
  });
}

// ── Services ──
/** El ciclo de services (de ejemplo): A, A+B, A, R+A+B. Cada cuánto toca depende del vehículo. */
export const CICLO: TipoService[] = ["A", "A+B", "A", "R+A+B"];
const AVISO_ANTES = 1 / 6;

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
  const km = base + v.cadaService;
  const orden = Math.round(km / v.cadaService);
  const tipo = CICLO[(((orden - 1) % CICLO.length) + CICLO.length) % CICLO.length];
  const faltan = km - v.km;
  const dias = Math.max(0, Math.round(faltan / v.kmPorDia));
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  const estado: Estado = faltan <= 0 ? "rojo" : faltan <= v.cadaService * AVISO_ANTES ? "ambar" : "verde";
  return { tipo, km, faltan, dias, fechaEstimada: fecha.toISOString().slice(0, 10), estado };
}

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString("es-UY")} km`;
/** Km u horas, según lo que mida el vehículo. */
export const fmtUso = (v: Pick<Vehiculo, "unidad">, n: number) =>
  `${Math.round(n).toLocaleString("es-UY")} ${v.unidad}`;
