// Dominio compartido entre frontend y backend.
// Sin strings mágicos: estados y roles como constantes tipadas.

export const ROLES = {
  CHOFER: "chofer",
  ENCARGADO: "encargado",
  ADMIN: "admin",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TRIP_STATUS = {
  PENDIENTE: "PENDIENTE",
  EN_RUTA: "EN_RUTA",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO",
  CON_INCIDENCIA: "CON_INCIDENCIA",
} as const;
export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

export const PHOTO_KIND = {
  CARGA_SALIDA: "carga_salida",
  CARGA_LLEGADA: "carga_llegada",
  COMBUSTIBLE: "combustible",
} as const;
export type PhotoKind = (typeof PHOTO_KIND)[keyof typeof PHOTO_KIND];

export const DRIVER_STATUS = {
  ACTIVO: "activo",
  INACTIVO: "inactivo",
} as const;
export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];

export const TRUCK_STATUS = {
  DISPONIBLE: "disponible",
  EN_VIAJE: "en_viaje",
  MANTENIMIENTO: "mantenimiento",
} as const;
export type TruckStatus = (typeof TRUCK_STATUS)[keyof typeof TRUCK_STATUS];

// Etiquetas legibles para la UI (español).
export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_RUTA: "En ruta",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
  CON_INCIDENCIA: "Con incidencia",
};

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  carga_salida: "Carga (salida)",
  carga_llegada: "Carga (llegada)",
  combustible: "Combustible",
};

// ---- Tipos de entidades (forma de la API) ----

export interface Driver {
  id: number;
  name: string;
  document: string;
  license_number: string;
  license_category: string;
  license_expiry: string; // ISO date
  phone: string;
  status: DriverStatus;
}

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

export interface Cargo {
  id: number;
  description: string;
  weight_kg: number | null;
  quantity: number | null;
  client: string | null;
  type: string | null;
  doc_number: string | null;
}

export interface TripPhoto {
  id: number;
  trip_id: number;
  r2_key: string;
  kind: PhotoKind;
  taken_at: string;
  lat: number | null;
  lon: number | null;
}

export interface TripPosition {
  id: number;
  trip_id: number;
  lat: number;
  lon: number;
  recorded_at: string;
  seq: number;
}

export interface Trip {
  id: number;
  driver_id: number;
  truck_id: number;
  origin: string;
  origin_lat: number | null;
  origin_lon: number | null;
  destination: string;
  dest_lat: number | null;
  dest_lon: number | null;
  scheduled_at: string;
  status: TripStatus;
  cargo_id: number | null;
  distance_km: number;
  manual_km: number | null;
  actual_liters: number | null;
  departed_at: string | null;
  arrived_at: string | null;
  notes: string | null;
  created_by: number;
  created_at: string;
  // joins opcionales
  driver_name?: string;
  truck_plate?: string;
  truck_consumption?: number;
  cargo?: Cargo | null;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  driver_id: number | null;
}

// Envelope de respuesta consistente para toda la API.
export interface ApiOk<T> {
  success: true;
  data: T;
}
export interface ApiErr {
  success: false;
  error: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

// Estimación de combustible: km * (L/100km) / 100.
export function estimateFuelLiters(km: number, consumptionL100: number): number {
  if (km <= 0 || consumptionL100 <= 0) return 0;
  return (km * consumptionL100) / 100;
}
