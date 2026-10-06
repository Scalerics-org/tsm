import {
  FRACCION_AMBAR_SERVICE,
  INTERVALO_GRANDE_KM,
  UMBRAL_ROJO_SERVICE_HORAS,
  UMBRAL_ROJO_SERVICE_KM,
  posiciones,
  type Disposicion,
  type Posicion,
} from "./disposicion";

/** Los services son A, B y C; "otro" es una reparación suelta. Qué incluye cada uno lo define Rodrigo. */
export type TipoService = "A" | "B" | "C" | "otro";

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
  /** Libre y opcional: están diseñando su propio código porque el grabado se borra. */
  codigo?: string;
  modeloId: string;
  /** Día en que se colocó (AAAA-MM-DD). */
  fecha: string;
  /** El odómetro del vehículo cuando se la colocó. */
  kmInicial: number;
  obs: string;
  anteriores: PuestaAnterior[];
}

/** Una cosa que se hizo en un service: sólo lo que Raúl marcó. */
export type AccionHecha = "reparado" | "nuevo" | "revisado";
export interface ItemHecho {
  /** La sección: Motor, Frenos y rodaje, Cubiertas… */
  seccion: string;
  /** Sobre qué: "Rueda 4", "Posición 7", o vacío si es del vehículo en general. */
  sujeto: string;
  pieza: string;
  accion: AccionHecha;
  medida?: string;
  obs: string;
}

export interface Service {
  id: string;
  tipo: TipoService;
  fecha: string;
  km: number;
  chofer: string;
  mecanico: string;
  obs: string;
  items: ItemHecho[];
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
  /** El tipo de vehículo (sus ejes): de ahí sale el dibujo. Sin tipo no hay cubiertas (el montacargas). */
  disposicion: Disposicion | null;
  /** De cuándo es la última lectura del tacógrafo de la que salen los km (AAAA-MM-DD). */
  lectura: string;
  /** El chofer que anda hoy en el camión: es el que se sugiere al cargar un service. */
  choferAsignado: string;
  /** Lo que mide el vehículo: km en el odómetro, horas en el montacargas. */
  unidad: "km" | "h";
  /** Km del tacógrafo (o horas del horímetro): contra esto se cuentan los km de cada cubierta. */
  km: number;
  /** Cada cuánto toca un service, en esa unidad. `null`: no tiene service por km (semirremolques y acoplados). */
  cadaService: number | null;
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
/** El % de uso (km recorridos sobre la vida útil), entero. Es EL número: el dibujo, la lista y el panel lo usan. */
export const pctDeUso = (km: number) => Math.round(porcentajeDeVida(km) * 100);
/** Los km en miles con una coma, para donde no entra más: 64200 → "64,2k". */
export const kmEnMiles = (km: number) => `${(km / 1000).toFixed(1).replace(".", ",")}k`;
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
/** El ciclo de services (de ejemplo): A, B, A, C. Cada cuánto toca depende del vehículo. */
export const CICLO: TipoService[] = ["A", "B", "A", "C"];

export interface ProximoService {
  tipo: TipoService;
  km: number;
  faltan: number;
  dias: number;
  fechaEstimada: string;
  /** Verde, ámbar o rojo según cuánto falta (ver `estadoDelProximo`). */
  estado: Estado;
  /** Ya se pasó: `faltan` es cero o negativo. */
  pasado: boolean;
}

/** El color de lo que falta para el próximo service: ver las constantes de `disposicion.ts`. */
export function estadoDelProximo(faltan: number, intervalo: number, unidad: "km" | "h"): Estado {
  const rojoDesde = unidad === "h" ? UMBRAL_ROJO_SERVICE_HORAS : UMBRAL_ROJO_SERVICE_KM;
  if (faltan < rojoDesde) return "rojo";
  return faltan <= intervalo * FRACCION_AMBAR_SERVICE ? "ambar" : "verde";
}

/** "cada 25.000 km · camión grande": el criterio del próximo service, para mostrarlo en pantalla. */
export function textoDelIntervalo(v: Pick<Vehiculo, "cadaService" | "unidad" | "tipo">): string {
  if (v.cadaService == null) return "sin service por km: no hay próximo estimado";
  const base = `cada ${v.cadaService.toLocaleString("es-UY")} ${v.unidad}`;
  if (v.tipo !== "camion") return base;
  return `${base} · camión ${v.cadaService >= INTERVALO_GRANDE_KM ? "grande" : "chico"}`;
}

export function ultimoService(v: Vehiculo): Service | undefined {
  return [...v.services].sort((a, b) => b.km - a.km)[0];
}

export function proximoService(v: Vehiculo, hoy: string): ProximoService | null {
  if (v.cadaService == null) return null;
  const base = ultimoService(v)?.km ?? 0;
  const km = base + v.cadaService;
  const orden = Math.round(km / v.cadaService);
  const tipo = CICLO[(((orden - 1) % CICLO.length) + CICLO.length) % CICLO.length];
  const faltan = km - v.km;
  const dias = Math.max(0, Math.round(faltan / v.kmPorDia));
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return {
    tipo,
    km,
    faltan,
    dias,
    fechaEstimada: fecha.toISOString().slice(0, 10),
    estado: estadoDelProximo(faltan, v.cadaService, v.unidad),
    pasado: faltan <= 0,
  };
}

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString("es-UY")} km`;
/** Km u horas, según lo que mida el vehículo. */
export const fmtUso = (v: Pick<Vehiculo, "unidad">, n: number) =>
  `${Math.round(n).toLocaleString("es-UY")} ${v.unidad}`;
