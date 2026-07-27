// Dominio compartido (v2) — modelo de viajes precargados.

export const ROLES = {
  CHOFER: "chofer",
  ENCARGADO: "encargado",
  ADMIN: "admin",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TRIP_STATUS = {
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO",
} as const;
export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export const PHOTO_KIND = {
  CARGA: "carga",
  DESCARGA: "descarga",
  DOCUMENTO: "documento",
} as const;
export type PhotoKind = (typeof PHOTO_KIND)[keyof typeof PHOTO_KIND];

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  carga: "Carga",
  descarga: "Descarga",
  documento: "Documento",
};

export const EXTRA_TYPE = {
  NONE: "none",
  TEXTO: "texto",
  NUMERO: "numero",
} as const;
export type ExtraType = (typeof EXTRA_TYPE)[keyof typeof EXTRA_TYPE];

export const DRIVER_STATUS = { ACTIVO: "activo", INACTIVO: "inactivo" } as const;
export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];

export const TRUCK_STATUS = {
  DISPONIBLE: "disponible",
  EN_VIAJE: "en_viaje",
  MANTENIMIENTO: "mantenimiento",
} as const;
export type TruckStatus = (typeof TRUCK_STATUS)[keyof typeof TRUCK_STATUS];

// ── Entidades ──

export interface Truck {
  id: number;
  plate: string;
  brand: string;
  model: string;
  year: number;
  type: string;
  capacity_kg: number;
  odometer_km: number;
  avg_consumption_l100: number;
  status: TruckStatus;
}

export interface Driver {
  id: number;
  name: string;
  document: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  phone: string;
  status: DriverStatus;
  default_truck_id: number | null;
  default_truck_plate?: string; // join
}

export interface Provider {
  id: number;
  name: string;
}

export interface TripTemplate {
  id: number;
  provider_id: number;
  provider_name?: string; // join
  name: string;
  origin: string;
  destinations: string[]; // parseado de JSON
  cargo_type: string;
  requires_kilos: boolean;
  extra_label: string | null;
  extra_type: ExtraType;
  extra_required: boolean;
  active: boolean;
}

export interface Trip {
  id: number;
  template_id: number | null;
  provider_name: string;
  origin: string;
  destination: string;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  kilos: number | null;
  extra_label: string | null;
  extra_value: string | null;
  status: TripStatus;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  // joins
  driver_name?: string;
  truck_plate?: string;
}

export interface TripPhoto {
  id: number;
  trip_id: number;
  r2_key: string;
  kind: PhotoKind;
  taken_at: string;
}

export interface FuelLog {
  id: number;
  truck_id: number;
  driver_id: number | null;
  trip_id: number | null;
  odometer_km: number;
  liters: number;
  is_full: boolean;
  r2_key: string | null;
  logged_at: string;
  // joins
  truck_plate?: string;
  driver_name?: string;
}

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  driver_id: number | null;
  truck_id: number | null; // camión habitual del chofer
  email?: string | null;
}

// Envelope de API
export interface ApiOk<T> {
  success: true;
  data: T;
}
export interface ApiErr {
  success: false;
  error: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

// ── Cálculos ──

/** Estimación de combustible: km × (L/100km) / 100. */
export function estimateFuelLiters(km: number, consumptionL100: number): number {
  if (km <= 0 || consumptionL100 <= 0) return 0;
  return (km * consumptionL100) / 100;
}

/**
 * Consumo de un camión a partir de sus surtidas (modelo llenado a llenado):
 * el primer llenado es la línea de base (tanque lleno) y NO cuenta como consumo;
 * los litros consumidos son los de las cargas siguientes (incluye "chorros").
 * km = odómetro de la última surtida − el de la primera; L/100km = litros/km×100.
 * Requiere al menos 2 surtidas para dar consumo.
 */
export function fuelSummary(logs: { odometer_km: number; liters: number }[]): {
  km: number;
  liters: number;
  consumption_l100: number | null;
} {
  if (logs.length === 0) return { km: 0, liters: 0, consumption_l100: null };
  const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km);
  const km = sorted[sorted.length - 1].odometer_km - sorted[0].odometer_km;
  // Litros consumidos = todo lo cargado después del llenado inicial.
  const liters = sorted.slice(1).reduce((s, l) => s + l.liters, 0);
  const consumption_l100 = km > 0 && sorted.length > 1 ? (liters / km) * 100 : null;
  return { km, liters, consumption_l100 };
}
