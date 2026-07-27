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

export const FIELD_TYPE = {
  TEXTO: "texto",
  NUMERO: "numero",
} as const;
export type FieldType = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE];

export const FIELD_STAGE = {
  CARGA: "carga",
  DESCARGA: "descarga",
} as const;
export type FieldStage = (typeof FIELD_STAGE)[keyof typeof FIELD_STAGE];

/** Campo configurable de una plantilla (ej. "Remito de carga", "Toneladas"). */
export interface TemplateField {
  key: string; // identificador estable
  label: string;
  type: FieldType;
  required: boolean;
  stage: FieldStage; // se pide en la carga o en la descarga
  is_weight?: boolean; // marca el campo de peso/toneladas (para reportes)
}

/** Opción de destino que elige el chofer (destino + destinatario). */
export interface DestOption {
  destino: string;
  destinatario: string;
}

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
  cargo_type: string;
  dest_options: DestOption[]; // destino + destinatario que puede elegir el chofer
  fields: TemplateField[]; // campos configurables (carga/descarga)
  arrival_photo_label: string | null; // etiqueta de la foto de descarga (ej. "Hoja rosada firmada")
  active: boolean;
}

export interface Trip {
  id: number;
  template_id: number | null;
  provider_name: string;
  origin: string;
  destination: string;
  destinatario: string | null;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  weight_tons: number | null; // del campo marcado como peso (para reportes)
  field_values: Record<string, string>; // valores de los campos configurables
  status: TripStatus;
  started_at: string;
  finished_at: string | null;
  notes: string | null; // observaciones
  created_at: string;
  // joins
  driver_name?: string;
  truck_plate?: string;
  fields?: TemplateField[]; // definición (para mostrar etiquetas), viene de la plantilla
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

export interface FuelFeedback {
  closed: boolean; // ¿cerró el tramo? (el chofer llenó)
  segment_km: number | null;
  segment_liters: number | null;
  segment_l100: number | null;
  month_km: number;
  month_liters: number;
  month_l100: number | null;
}

interface FLog {
  odometer_km: number;
  liters: number;
  is_full: boolean;
  logged_at: string; // "YYYY-MM-DD ..."
}

/**
 * Feedback de consumo al registrar una surtida (según el cliente):
 * - Si llenó, cierra el tramo desde el último llenado completo y devuelve su consumo.
 * - Si no llenó ("chorro"), el tramo queda abierto (closed=false).
 * - Siempre devuelve el acumulado del mes desde el primer llenado del mes.
 * `logs` debe incluir la surtida recién registrada (`current`).
 */
export function fuelFeedback(logs: FLog[], current: FLog): FuelFeedback {
  const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km);
  const closed = current.is_full;

  let segment_km: number | null = null;
  let segment_liters: number | null = null;
  let segment_l100: number | null = null;

  if (closed) {
    // último llenado completo anterior a la surtida actual
    let prev: FLog | null = null;
    for (const l of sorted) {
      if (l.odometer_km >= current.odometer_km) break;
      if (l.is_full) prev = l;
    }
    if (prev) {
      const km = current.odometer_km - prev.odometer_km;
      const liters = sorted
        .filter((l) => l.odometer_km > prev!.odometer_km && l.odometer_km <= current.odometer_km)
        .reduce((s, l) => s + l.liters, 0);
      segment_km = km;
      segment_liters = liters;
      segment_l100 = km > 0 ? (liters / km) * 100 : null;
    }
  }

  const month = current.logged_at.slice(0, 7);
  const monthLogs = sorted.filter((l) => l.logged_at.slice(0, 7) === month);
  const firstFull = monthLogs.find((l) => l.is_full);
  let month_km = 0;
  let month_liters = 0;
  let month_l100: number | null = null;
  if (firstFull && firstFull.odometer_km < current.odometer_km) {
    month_km = current.odometer_km - firstFull.odometer_km;
    month_liters = monthLogs
      .filter((l) => l.odometer_km > firstFull.odometer_km && l.odometer_km <= current.odometer_km)
      .reduce((s, l) => s + l.liters, 0);
    month_l100 = month_km > 0 ? (month_liters / month_km) * 100 : null;
  }

  return {
    closed,
    segment_km,
    segment_liters,
    segment_l100,
    month_km,
    month_liters,
    month_l100,
  };
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
