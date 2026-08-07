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
  remite: string | null; // quién remite/carga (ej. "Saman" para Nayna)
  cargo_type: string;
  dest_options: DestOption[]; // destino + destinatario que puede elegir el chofer
  fields: TemplateField[]; // campos configurables (carga/descarga)
  arrival_photo_label: string | null; // etiqueta de la foto de descarga (ej. "Hoja rosada firmada")
  /** Partes que se resuelven con la libreta. Ausente = flujo clásico con dest_options. */
  campos_ubicacion: CamposUbicacion | null;
  /** El chofer agrega una carga por cada lugar donde cargó (viajes combinados). */
  multi_renglon: boolean;
  /** Renglones ya puestos por la oficina (ida y vuelta): el chofer solo completa. */
  renglones_fijos: TripSegmentInput[] | null;
  pide_kilometros: boolean;
  /** Viaje sin carga (retornos vacíos). No pide cargas ni fotos de carga. */
  viaje_vacio: boolean;
  /** Camiones que ven esta plantilla. Vacío = la ven todos. */
  truck_ids: number[];
  active: boolean;
}

export interface Trip {
  id: number;
  template_id: number | null;
  provider_name: string;
  origin: string;
  remite: string | null;
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
  /** Cargas del viaje. Vacío en los viajes de un solo tramo. */
  segments: TripSegment[];
  kilometros: number | null;
  /** Auditoría de correcciones de oficina sobre viajes ya cerrados. */
  edited_by: number | null;
  edited_at: string | null;
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

// ── Libreta (remitentes / destinatarios / lugares curados) ──

export const LIBRETA_TIPO = {
  REMITENTE: "remitente",
  DESTINATARIO: "destinatario",
  LUGAR: "lugar",
} as const;
export type LibretaTipo = (typeof LIBRETA_TIPO)[keyof typeof LIBRETA_TIPO];

export const LIBRETA_ESTADO = {
  CONFIRMADO: "confirmado",
  NUEVO: "nuevo", // alta hecha por un chofer, pendiente de revisión en oficina
} as const;
export type LibretaEstado = (typeof LIBRETA_ESTADO)[keyof typeof LIBRETA_ESTADO];

export const COBRO_TIPO = { CLIENTE: "cliente", PROVEEDOR: "proveedor" } as const;
export type CobroTipo = (typeof COBRO_TIPO)[keyof typeof COBRO_TIPO];

export interface LibretaEntry {
  id: number;
  tipo: LibretaTipo;
  nombre: string;
  provider_id: number | null; // null = disponible para todos los clientes
  /** "Varios" y similares: se pueden usar como nombre de plantilla, nunca dentro de un renglón. */
  agrupador: boolean;
  estado: LibretaEstado;
  usos: number;
  created_by: number | null;
}

export const CAMPO_MODO = {
  /** Lo define la oficina en la plantilla; el chofer no lo toca. */
  FIJO: "fijo",
  /** El chofer elige de la libreta curada (y puede dar de alta si `permite_alta`). */
  LIBRETA: "libreta",
} as const;
export type CampoModo = (typeof CAMPO_MODO)[keyof typeof CAMPO_MODO];

/** Configuración de una parte del viaje (origen / remitente / destino / destinatario). */
export interface CampoUbicacion {
  modo: CampoModo;
  label?: string;
  /** si modo = "fijo" */
  valor?: string;
  /** si modo = "libreta" */
  libreta_tipo?: LibretaTipo;
  permite_alta?: boolean;
  requerido?: boolean;
}

/** Partes configurables de una plantilla. Ausente = comportamiento clásico (dest_options). */
export interface CamposUbicacion {
  origen?: CampoUbicacion;
  remitente?: CampoUbicacion;
  destino?: CampoUbicacion;
  destinatario?: CampoUbicacion;
}

// ── Renglones (una carga dentro de un viaje) ──

export const UNIDAD = { KILOS: "kilos", PALLETS: "pallets" } as const;
export type Unidad = (typeof UNIDAD)[keyof typeof UNIDAD];

/**
 * Una carga del viaje: dónde cargó y para quién. Es la unidad facturable —
 * equivale a una fila del Excel del cliente.
 */
export interface TripSegment {
  /** Lugar de carga. Debe ser una entidad real: "Varios" no vale acá. */
  remitente: string;
  remitente_id: number | null;
  /** Una misma carga puede ir a varios clientes (ej. Timber → Jair y Agronorte). */
  clientes: string[];
  cliente_ids: number[];
  cantidad: number | null;
  unidad: Unidad | null;
  remito: string | null;
  /** Facturación: heredada de las reglas. El chofer no la ve ni la toca. */
  cobro_tipo: CobroTipo | null;
  cobro_a: string | null;
  cobro_manual: boolean;
}

/** Renglón sin la parte de facturación: es lo que manda el chofer. */
export type TripSegmentInput = Pick<
  TripSegment,
  "remitente" | "remitente_id" | "clientes" | "cliente_ids" | "cantidad" | "unidad" | "remito"
>;

/** Regla de facturación. `destinatario_id: null` = aplica a cualquier destino. */
export interface CobroRegla {
  id: number;
  remitente_id: number;
  destinatario_id: number | null;
  cobro_tipo: CobroTipo;
  cobro_a: string;
}

export interface CobroResuelto {
  cobro_tipo: CobroTipo | null;
  cobro_a: string | null;
}

/**
 * Resuelve a quién se factura un renglón: primero el par exacto remitente+destinatario,
 * y si no hay, la regla general del remitente (destinatario NULL).
 *
 * Nunca adivina: sin regla devuelve null y el renglón queda "pendiente de asignar" en oficina.
 * Un mismo remitente puede cobrarse distinto según el destino, por eso la clave es el par.
 */
export function resolveCobro(
  reglas: CobroRegla[],
  remitenteId: number | null,
  destinatarioId: number | null,
): CobroResuelto {
  const SIN_REGLA: CobroResuelto = { cobro_tipo: null, cobro_a: null };
  if (remitenteId == null) return SIN_REGLA;

  const delRemitente = reglas.filter((r) => r.remitente_id === remitenteId);
  const exacta =
    destinatarioId != null ? delRemitente.find((r) => r.destinatario_id === destinatarioId) : undefined;
  const general = delRemitente.find((r) => r.destinatario_id == null);

  const match = exacta ?? general;
  return match ? { cobro_tipo: match.cobro_tipo, cobro_a: match.cobro_a } : SIN_REGLA;
}

/**
 * Completa la facturación de cada renglón a partir de las reglas.
 *
 * Un renglón puede ir a varios clientes: alcanza con que uno tenga regla para saber a
 * quién se factura esa carga. Si ninguno matchea queda en null y la oficina lo ve como
 * pendiente — nunca se inventa un cobro, porque facturar mal en silencio es peor que
 * no tener el dato.
 *
 * Respeta los renglones que la oficina corrigió a mano (`cobro_manual`).
 */
export function aplicarCobro(
  reglas: CobroRegla[],
  segmentos: (TripSegmentInput & Partial<Pick<TripSegment, "cobro_tipo" | "cobro_a" | "cobro_manual">>)[],
): TripSegment[] {
  return segmentos.map((s) => {
    if (s.cobro_manual) {
      return {
        ...s,
        cobro_tipo: s.cobro_tipo ?? null,
        cobro_a: s.cobro_a ?? null,
        cobro_manual: true,
      } as TripSegment;
    }

    const destinos: (number | null)[] = s.cliente_ids.length ? s.cliente_ids : [null];
    let resuelto: CobroResuelto = { cobro_tipo: null, cobro_a: null };
    for (const destinatarioId of destinos) {
      const r = resolveCobro(reglas, s.remitente_id, destinatarioId);
      if (r.cobro_tipo) {
        resuelto = r;
        break;
      }
    }
    return { ...s, ...resuelto, cobro_manual: false } as TripSegment;
  });
}

/** Marcas de acento que NFD deja sueltas (U+0300–U+036F). Se arma por código para no meter
 *  caracteres combinantes literales en el fuente, que se corrompen fácil al editar. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Clave de comparación de nombres de libreta: sin mayúsculas, acentos ni espacios de más.
 * Sirve para no dar de alta "Galpón" cuando ya existe "GALPON".
 */
export function normalizeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

export interface MonthlyConsumption {
  month: string; // "YYYY-MM"
  km: number;
  liters: number;
  l100: number | null;
  closed: boolean; // cerrado con el primer llenado del mes siguiente
}

/**
 * Cierre de consumo mensual por camión (según el cliente): el consumo de un mes
 * va desde su primer llenado completo hasta el primer llenado completo del mes
 * siguiente (esa surtida cierra el mes y abre el próximo). El mes en curso queda
 * "abierto" (closed=false) hasta que haya un llenado el mes que viene.
 */
export function monthlyConsumption(logs: FLog[]): MonthlyConsumption[] {
  const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km);
  if (sorted.length === 0) return [];

  // Ancla de cada mes = primer llenado completo del mes (menor odómetro).
  const anchorByMonth = new Map<string, FLog>();
  for (const l of sorted) {
    if (!l.is_full) continue;
    const m = l.logged_at.slice(0, 7);
    if (!anchorByMonth.has(m)) anchorByMonth.set(m, l);
  }
  const anchors = [...anchorByMonth.values()].sort((a, b) => a.odometer_km - b.odometer_km);
  const lastOdo = sorted[sorted.length - 1].odometer_km;

  const out: MonthlyConsumption[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const next = anchors[i + 1] ?? null;
    const endOdo = next ? next.odometer_km : lastOdo;
    const km = endOdo - a.odometer_km;
    const liters = sorted
      .filter((l) => l.odometer_km > a.odometer_km && l.odometer_km <= endOdo)
      .reduce((s, l) => s + l.liters, 0);
    out.push({
      month: a.logged_at.slice(0, 7),
      km,
      liters,
      l100: km > 0 ? (liters / km) * 100 : null,
      closed: !!next,
    });
  }
  return out.reverse(); // más reciente primero
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
