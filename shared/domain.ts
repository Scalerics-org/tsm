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
  /** Rendimiento esperado en km por litro. Más alto es mejor. */
  avg_km_litro: number;
  status: TruckStatus;
  /**
   * Cuándo la oficina editó el odómetro. La pone el repo, no el formulario: es lo que le
   * permite a una corrección ganarle a una surtida vieja (ver `kmInicialTacografo`).
   */
  odometer_at?: string | null;
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
  /** Etiqueta de la foto de carga (ej. "Hoja MIC"). null = "Foto de la carga". */
  carga_photo_label: string | null;
  /** Partes que se resuelven con la libreta. Ausente = flujo clásico con dest_options. */
  campos_ubicacion: CamposUbicacion | null;
  /** El chofer agrega una carga por cada lugar donde cargó (viajes combinados). */
  multi_renglon: boolean;
  /**
   * Cada carga lleva su propia ciudad de carga y su destino, además del lugar y los
   * clientes. Es lo que necesita el combinado genérico, donde nada viene fijo.
   *
   * Se heredan del renglón anterior (o del viaje) y el chofer sólo los cambia en la
   * línea que sea distinta: cargar en dos ciudades el mismo viaje es la excepción,
   * no la regla, y no se le puede cobrar a todos el precio de la excepción.
   */
  renglon_pide_ubicacion: boolean;
  /**
   * El renglón pide el departamento donde cargó, SIN pasar al modo texto libre: el lugar se
   * sigue eligiendo de la lista curada y el renglón conserva los ids que usan las reglas de
   * cobro. Es para los viajes con origen fijo donde las cargas igual salen de varios lados
   * —el combinado Mdeo → Bella Unión— y por eso cada carga heredaba un origen que el chofer
   * nunca eligió.
   */
  renglon_pide_departamento: boolean;
  /** Renglones ya puestos por la oficina (ida y vuelta): el chofer solo completa. */
  renglones_fijos: RenglonFijo[] | null;
  pide_kilometros: boolean;
  /** Viaje sin carga (retornos vacíos). No pide cargas ni fotos de carga. */
  viaje_vacio: boolean;
  /**
   * Si se exige foto de la carga para cerrar el viaje.
   *
   * En los combinados (`multi_renglon`) se exige **una por cada lugar de carga**, no una
   * del viaje: con una sola no se sabe cuál de las tres cargas quedó documentada.
   */
  foto_carga_requerida: boolean;
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
  /** Carga a la que pertenece la foto (`TripSegment.sid`). `null` = foto del viaje entero. */
  segment_sid: string | null;
}

export interface FuelLog {
  id: number;
  truck_id: number;
  driver_id: number | null;
  trip_id: number | null;
  odometer_km: number;
  /** Total surtido. De acá sale todo el cálculo de consumo. */
  liters: number;
  /** Desglose por tanque. Null en las surtidas viejas y cuando se cargó uno solo. */
  liters_tanque1?: number | null;
  liters_tanque2?: number | null;
  is_full: boolean;
  /** Foto del tacógrafo: respalda los km. */
  r2_key: string | null;
  /** Foto de la boleta de gasoil: respalda los litros. */
  r2_key_boleta: string | null;
  logged_at: string;
  /** Corrección desde oficina: quién y cuándo. */
  edited_by?: number | null;
  edited_at?: string | null;
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

/**
 * Los departamentos no viven en la libreta, pero se eligen con el mismo selector.
 *
 * Ojo: el tipo "lugar" de la libreta son los orígenes de los internacionales
 * (Arg. Rosario, Concordia…). Para un viaje dentro del país hay que pedir esto.
 */
export const TIPO_DEPARTAMENTO = "departamento" as const;
export type PickerTipo = LibretaTipo | typeof TIPO_DEPARTAMENTO;

export const LIBRETA_ESTADO = {
  CONFIRMADO: "confirmado",
  NUEVO: "nuevo", // alta hecha por un chofer, pendiente de revisión en oficina
} as const;
export type LibretaEstado = (typeof LIBRETA_ESTADO)[keyof typeof LIBRETA_ESTADO];

export const COBRO_TIPO = { CLIENTE: "cliente", PROVEEDOR: "proveedor" } as const;
export type CobroTipo = (typeof COBRO_TIPO)[keyof typeof COBRO_TIPO];

/** Uno de los 19. Lista fija: no se da de alta desde la ruta ni se fusiona. */
export interface Departamento {
  id: number;
  nombre: string;
}

export interface LibretaEntry {
  id: number;
  tipo: LibretaTipo;
  nombre: string;
  /** Para poder filtrar los lugares por departamento antes de buscar. */
  departamento_id?: number | null;
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
  /**
   * El chofer lo escribe. Es el "completar" de la planilla del cliente: lugares que
   * cambian en cada viaje y no vale la pena agendar, como el galpón puntual donde
   * cargó en Rosario o dónde descargó en Durazno.
   */
  TEXTO: "texto",
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
  /**
   * Id propio de la carga, estable durante toda su vida.
   *
   * Las cargas se guardan como lista y se borran por posición: si la foto colgara del
   * índice, borrar la primera dejaría a todas las fotos apuntando a la carga equivocada.
   */
  sid: string;
  /**
   * Ciudad donde cargó. Sólo en los viajes que no tienen origen fijo (el combinado
   * genérico); en los demás queda null y vale el origen del viaje.
   */
  origen: string | null;
  origen_id: number | null;
  /** Destino de esta carga. Null = va al destino del viaje. */
  destino: string | null;
  destino_id: number | null;
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
  /**
   * Renglón que dejó puesta la oficina en la plantilla. El chofer lo completa, no lo borra.
   *
   * Opcional a propósito: los viajes ya guardados no lo tienen y siguen siendo válidos.
   * No entra en `TripSegmentInput`, así que el chofer no puede mandárselo a sí mismo.
   */
  fijo?: boolean;
}

/** Renglón sin la parte de facturación: es lo que manda el chofer. */
export type TripSegmentInput = Pick<
  TripSegment,
  | "sid"
  | "origen"
  | "origen_id"
  | "destino"
  | "destino_id"
  | "remitente"
  | "remitente_id"
  | "clientes"
  | "cliente_ids"
  | "cantidad"
  | "unidad"
  | "remito"
>;

/**
 * Renglón precargado en la plantilla (ida y vuelta de Manassi).
 *
 * Es una definición, no una carga: el `sid` lo recibe cada viaje al instanciarlo, porque
 * si viniera de la plantilla todos los viajes compartirían el mismo y las fotos de uno
 * aparecerían en los demás.
 */
export type RenglonFijo = Omit<TripSegmentInput, "sid">;

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

/** Carga que quedó sin regla de facturación, con el viaje del que salió. */
export interface PendienteCobro extends TripSegment {
  idx: number;
  trip_id: number;
  fecha: string;
  cliente: string;
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

/**
 * Completa solo las cargas que quedaron pendientes, sin tocar las que ya tienen cobro.
 *
 * Se usa cuando la oficina define una regla nueva: sin esto la regla solo valdría para las
 * cargas futuras y el contador de pendientes nunca bajaría — el trabajo dejaría de ser
 * "una vez por combinación" y volvería a ser diario.
 *
 * No reescribe lo ya resuelto: una carga con cobro puede estar facturada, y cambiarla es
 * una corrección explícita de la oficina, no un efecto secundario de crear una regla.
 */
export function completarPendientes(reglas: CobroRegla[], segmentos: TripSegment[]): TripSegment[] {
  return segmentos.map((s) => (s.cobro_manual || s.cobro_tipo ? s : aplicarCobro(reglas, [s])[0]));
}

/** Carga tal como la ve el chofer: sin nada de facturación. */
export type TripSegmentChofer = Omit<TripSegment, "cobro_tipo" | "cobro_a" | "cobro_manual">;

/** Viaje tal como se le manda al chofer. */
export type TripChofer = Omit<Trip, "segments"> & { segments: TripSegmentChofer[] };

/**
 * Saca la facturación de las cargas antes de mandarle el viaje al chofer.
 *
 * La pantalla del chofer no la muestra, pero si el dato viaja igual alcanza con abrir las
 * herramientas del navegador en el celular para leerlo. Lo que se le prometió al cliente es
 * que el chofer **no accede** a la facturación, no que no la vea en pantalla.
 */
export function sinCobro(trip: Trip): TripChofer {
  return {
    ...trip,
    segments: trip.segments.map(({ cobro_tipo, cobro_a, cobro_manual, ...carga }) => carga),
  };
}

/**
 * Cargas que todavía no tienen su foto.
 *
 * En los combinados la evidencia es una foto por lugar de carga, no una del viaje: con
 * una sola no se sabe cuál de las tres cargas quedó documentada. Se cruza por `sid` y no
 * por posición, así borrar una carga no corre las fotos de las demás.
 */
export function renglonesSinFoto<T extends Pick<TripSegment, "sid">>(
  segments: T[],
  photos: Pick<TripPhoto, "kind" | "segment_sid">[],
): T[] {
  const conFoto = new Set(
    photos.filter((p) => p.kind === PHOTO_KIND.CARGA && p.segment_sid).map((p) => p.segment_sid),
  );
  return segments.filter((s) => !conFoto.has(s.sid));
}

/**
 * Reparte las fotos entre las cargas a las que pertenecen.
 *
 * En un combinado de tres paradas hay tres fotos de "carga": sin repartirlas, la oficina
 * ve tres imágenes con la misma etiqueta y tiene que adivinar cuál es cuál. Las que no
 * pertenecen a ninguna carga (descarga, documento, o las de antes de este cambio) quedan
 * en `delViaje`.
 */
export function fotosPorRenglon(photos: TripPhoto[]): {
  porCarga: Map<string, TripPhoto[]>;
  delViaje: TripPhoto[];
} {
  const porCarga = new Map<string, TripPhoto[]>();
  const delViaje: TripPhoto[] = [];

  for (const p of photos) {
    if (!p.segment_sid) {
      delViaje.push(p);
      continue;
    }
    const previas = porCarga.get(p.segment_sid);
    if (previas) previas.push(p);
    else porCarga.set(p.segment_sid, [p]);
  }
  return { porCarga, delViaje };
}

/**
 * Si hay que exigir foto de la carga para cerrar el viaje.
 *
 * Un viaje sin plantilla la exige: es como venía funcionando, y quedarse sin evidencia es
 * peor que pedirla de más. Solo la plantilla puede eximir — el vacío no tiene qué
 * fotografiar y el combinado se respalda con el N° de remito de cada renglón.
 */
export function requiereFotoCarga(
  tpl: Pick<TripTemplate, "viaje_vacio" | "foto_carga_requerida"> | null,
): boolean {
  if (!tpl) return true;
  return !tpl.viaje_vacio && tpl.foto_carga_requerida;
}

/**
 * Qué evidencia le falta a un viaje para poder cerrarse. Vacío = puede cerrar.
 *
 * Estaba escrita adentro del handler de cierre, y de las tres piezas sólo dos vivían acá.
 * Por eso nadie notó que a los renglones que pone la oficina se les exige una foto que la
 * pantalla del chofer no ofrecía sacar: los viajes de Manassi y la UAM no se podían cerrar.
 * Con la decisión completa en un solo lugar, eso se ve en un test.
 *
 * Devuelve las descripciones en el orden en que el chofer las va a resolver: primero la
 * carga, después la llegada.
 */
export function fotosFaltantes(
  tpl: Pick<
    TripTemplate,
    "viaje_vacio" | "foto_carga_requerida" | "multi_renglon" | "arrival_photo_label"
  > | null,
  segments: Pick<TripSegment, "sid" | "remitente">[],
  photos: Pick<TripPhoto, "kind" | "segment_sid">[],
): string[] {
  const faltan: string[] = [];

  if (requiereFotoCarga(tpl)) {
    if (tpl?.multi_renglon) {
      // En los combinados la evidencia es una foto por lugar de carga: con una sola no se
      // sabe cuál de las tres cargas quedó documentada.
      const sinFoto = renglonesSinFoto(segments, photos);
      if (sinFoto.length) faltan.push(`la foto de: ${sinFoto.map((x) => x.remitente).join(", ")}`);
    } else if (!photos.some((f) => f.kind === PHOTO_KIND.CARGA)) {
      faltan.push("la foto de la carga");
    }
  }

  if (tpl?.arrival_photo_label && !photos.some((f) => f.kind === PHOTO_KIND.DESCARGA)) {
    faltan.push(`la foto: ${tpl.arrival_photo_label}`);
  }

  return faltan;
}

/**
 * Si una entrada de la libreta sirve como lugar de carga.
 *
 * "Varios" y los demás agrupadores no valen: es justo el dato que el cliente no puede
 * perder. La regla estaba inline en el handler por el que entra el chofer, así que se
 * olvidó en los otros dos caminos que guardan renglones — y la oficina podía dejar
 * "Varios" grabado como lugar de carga.
 *
 * Una entrada que no está en la libreta (`null`) pasa: es un nombre escrito a mano, y ahí
 * el chofer ya dijo dónde cargó.
 */
export function sirveComoLugarDeCarga(entrada: Pick<LibretaEntry, "agrupador"> | null): boolean {
  return !entrada?.agrupador;
}

/**
 * Litros totales de una surtida, a partir de los dos tanques.
 *
 * Los camiones cargan en dos tanques y el chofer los anota por separado, pero el total NO se
 * tipea: se suma. Un total escrito a mano que no coincida con la suma deja el consumo
 * mintiendo, y no habría forma de saber cuál de los tres números está bien.
 *
 * Devuelve null si no se cargó ninguno, para poder distinguir "no puso nada" de "puso 0".
 */
export function litrosTotales(
  tanque1: number | null | undefined,
  tanque2: number | null | undefined,
): number | null {
  const uno = Number.isFinite(tanque1) ? (tanque1 as number) : null;
  const dos = Number.isFinite(tanque2) ? (tanque2 as number) : null;
  if (uno == null && dos == null) return null;
  return (uno ?? 0) + (dos ?? 0);
}

/**
 * Normaliza un renglón que llega en un pedido, sin el `sid`.
 *
 * Estaba copiado en dos rutas —`parseSegments` en trips.ts y `parseRenglonesFijos` en
 * templates.ts— mapeando los mismos once campos del mismo JSON al mismo tipo. Ya habían
 * divergido: una descartaba el renglón sin lugar de carga y la otra lo aceptaba si tenía
 * clientes. Cada llamador decide qué descarta; el mapeo es uno solo.
 */
export function parseRenglon(raw: unknown): Omit<TripSegmentInput, "sid"> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (v ? String(v).trim() : null);
  const numero = (v: unknown) => (v ? Number(v) : null);

  return {
    origen: texto(r.origen),
    origen_id: numero(r.origen_id),
    destino: texto(r.destino),
    destino_id: numero(r.destino_id),
    remitente: String(r.remitente ?? "").trim(),
    remitente_id: numero(r.remitente_id),
    clientes: Array.isArray(r.clientes) ? r.clientes.map((c) => String(c).trim()).filter(Boolean) : [],
    cliente_ids: Array.isArray(r.cliente_ids) ? r.cliente_ids.map(Number).filter((n) => !isNaN(n)) : [],
    cantidad: r.cantidad != null && r.cantidad !== "" ? Number(r.cantidad) : null,
    unidad: r.unidad === UNIDAD.KILOS || r.unidad === UNIDAD.PALLETS ? (r.unidad as Unidad) : null,
    remito: texto(r.remito),
  };
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

/**
 * Rendimiento en kilómetros por litro, que es como lo mide el cliente.
 *
 * Ojo con la dirección: acá **más es mejor** (2,80 rinde más que 2,63). Es al revés que
 * L/100 km, así que toda comparación de "está consumiendo de más" se invierte.
 */
export function kmPorLitro(km: number, litros: number): number | null {
  if (km <= 0 || litros <= 0) return null;
  return km / litros;
}

/** Formato del cliente: dos decimales y coma. 2,63 */
export function fmtConsumo(kml: number | null): string {
  return kml == null ? "—" : kml.toFixed(2).replace(".", ",");
}

/** Estimación de combustible a partir del rendimiento esperado: km ÷ (km por litro). */
export function estimateFuelLiters(km: number, kmLitro: number): number {
  if (km <= 0 || kmLitro <= 0) return 0;
  return km / kmLitro;
}

/** De dónde salió el km con el que arranca la pantalla de surtida. */
export type OrigenKmInicial = "surtida" | "oficina" | "sin-dato";

export interface KmInicial {
  km: number;
  origen: OrigenKmInicial;
  /** Fecha de la surtida de donde salió ("YYYY-MM-DD"). Null si no vino de una surtida. */
  fecha: string | null;
}

/** El odómetro que la oficina le tiene cargado al camión, con la fecha en que lo tocó. */
export interface OdometroCamion {
  km: number;
  /**
   * Cuándo lo editó la oficina, "YYYY-MM-DD HH:MM:SS". `null` = nunca lo tocó, o el número
   * que hay lo dejó una surtida y por lo tanto no es una afirmación de la oficina.
   */
  at: string | null;
}

/**
 * El km de arranque del tacógrafo al registrar una surtida.
 *
 * GANA EL DATO MÁS NUEVO: la última surtida o la edición de la oficina, la que sea posterior.
 *
 * No gana "el más alto", y es el punto: "edité el odómetro del camión 4384 y cuando fui a
 * registrar una surtida no se actualizó el tacógrafo". La oficina había puesto 390.000 y la
 * pantalla seguía mostrando los 395.705 de la surtida del 18. Corregir para ABAJO es
 * exactamente lo que la oficina necesita poder hacer —una lectura tipeada de más queda
 * pegada si no— y con el máximo no se puede.
 *
 * Entre surtidas también manda la fecha y no el valor, por lo mismo.
 *
 * Empate exacto de fecha: manda la oficina. Si tocó el odómetro en el mismo segundo en que
 * entró una surtida, lo que está haciendo es corregir lo que acaba de ver.
 *
 * Un odómetro en 0 no es una afirmación, es un camión que nadie cargó todavía: no compite.
 */
export function kmInicialTacografo(
  logs: { odometer_km: number; logged_at: string; id?: number }[],
  odometro: OdometroCamion,
): KmInicial {
  // Empate de fecha (dos surtidas el mismo día): manda la última cargada.
  const porFecha = [...logs].sort(
    (a, b) => a.logged_at.localeCompare(b.logged_at) || (a.id ?? 0) - (b.id ?? 0),
  );
  const ultima = porFecha[porFecha.length - 1];
  const deOficina = odometro.km > 0 ? odometro : null;

  // Las dos fechas salen de `datetime('now')` de SQLite, así que comparar los textos alcanza.
  // Una surtida vieja con fecha sin hora ("2026-08-18") queda antes que cualquier hora de ese
  // día, que es lo que corresponde: de esa lectura no sabemos a qué hora fue.
  const oficinaManda =
    deOficina != null && (ultima == null || (deOficina.at != null && deOficina.at >= ultima.logged_at));

  if (oficinaManda) {
    return { km: deOficina!.km, origen: "oficina", fecha: deOficina!.at?.slice(0, 10) ?? null };
  }
  if (ultima) {
    return { km: ultima.odometer_km, origen: "surtida", fecha: ultima.logged_at.slice(0, 10) };
  }
  return { km: 0, origen: "sin-dato", fecha: null };
}

/**
 * De dónde salió ese número, en criollo.
 *
 * El chofer mira el km inicial parado en el surtidor y tiene que saber a quién preguntarle
 * cuando no le cuadra: si viene de una surtida, la fecha se lo dice; si lo puso la oficina,
 * pregunta ahí. Sin esto el número aparece solo y no hay a quién reclamarle.
 */
export function textoKmInicial(k: KmInicial): string {
  if (k.origen === "surtida" && k.fecha) {
    const [, mes, dia] = k.fecha.split("-");
    return `De la surtida del ${Number(dia)}/${Number(mes)}`;
  }
  if (k.origen === "oficina") {
    if (!k.fecha) return "Cargado por la oficina";
    const [, mes, dia] = k.fecha.split("-");
    return `Cargado por la oficina el ${Number(dia)}/${Number(mes)}`;
  }
  return "Sin dato previo";
}

export interface FuelFeedback {
  closed: boolean; // ¿cerró el tramo? (el chofer llenó)
  segment_km: number | null;
  segment_liters: number | null;
  segment_kml: number | null;
  month_km: number;
  month_liters: number;
  month_kml: number | null;
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
/**
 * La cadena continua más reciente: se corta donde el odómetro cambió de escala.
 *
 * "No me está tirando el acumulado." Pasó de verdad: en agosto el GTP 4325 tenía seis
 * surtidas de prueba de 393.051 a 397.000 km conviviendo con las ocho reales que el cliente
 * cargó después, de 140.076 a 147.200. Medido de la primera a la última, el mes daba -245.851
 * km — y sin kilómetros no hay rendimiento, así que el acumulado salía vacío.
 *
 * LA PARTE FINA es separar un cambio de escala de una lectura que simplemente bajó. Un
 * "chorro" guarda el km de arranque tal cual, así que después de una corrección de oficina
 * puede quedar por debajo del llenado anterior — y ésos SÍ tienen que contar, que fue otro
 * arreglo de este mismo archivo.
 *
 * La diferencia es si la cadena se recupera: si más adelante el odómetro vuelve a pasar el
 * valor de antes del salto, fue un bache y la cadena sigue siendo la misma. Si nunca lo
 * alcanza, el número cambió de escala y los dos lados no se pueden restar entre sí.
 */
function cadenaContinua(enOrden: FLog[]): FLog[] {
  let desde = 0;
  for (let i = 1; i < enOrden.length; i++) {
    if (enOrden[i].odometer_km >= enOrden[i - 1].odometer_km) continue;
    const maximoPosterior = Math.max(...enOrden.slice(i).map((l) => l.odometer_km));
    if (maximoPosterior < enOrden[i - 1].odometer_km) desde = i;
  }
  return desde === 0 ? enOrden : enOrden.slice(desde);
}

export function fuelFeedback(logs: FLog[], current: FLog): FuelFeedback {
  // CRONOLÓGICO, no por odómetro. El odómetro dejó de ser monótono desde que la oficina puede
  // corregirlo para abajo: un chorro guarda el km de arranque tal cual, así que puede quedar
  // POR DEBAJO de un llenado anterior. Ordenando por km, esos litros quedaban fuera del tramo
  // y el camión parecía rendir mejor de lo que rinde. El tiempo sí es monótono.
  // (El acumulado del mes, más abajo, ya se recorría así por el mismo motivo.)
  const enOrden = cadenaContinua(
    [...logs].sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.odometer_km - b.odometer_km),
  );
  const closed = current.is_full;

  let segment_km: number | null = null;
  let segment_liters: number | null = null;
  let segment_kml: number | null = null;

  if (closed) {
    // `logs` incluye la surtida actual, así que el último llenado de la cronología ES ella:
    // el tramo va del llenado anterior a ése. Se toma de `enOrden` y no de `current` para que
    // los dos extremos salgan de la misma lista.
    const hasta = enOrden.map((l) => l.is_full).lastIndexOf(true);
    const llenos = enOrden.slice(0, hasta).map((l) => l.is_full).lastIndexOf(true);
    const prev = llenos >= 0 ? enOrden[llenos] : null;
    if (prev) {
      const km = enOrden[hasta].odometer_km - prev.odometer_km;
      // El llenado de apertura es la línea de base y no cuenta: los litros arrancan en el
      // siguiente. Mismo criterio que el acumulado del mes.
      const liters = enOrden.slice(llenos + 1, hasta + 1).reduce((s, l) => s + l.liters, 0);
      segment_km = km;
      segment_liters = liters;
      segment_kml = kmPorLitro(km, liters);
    }
  }

  // El acumulado del mes va del PRIMER al ÚLTIMO llenado del mes, no hasta la surtida
  // actual: los litros cargados después del último llenado siguen en el tanque, no se
  // quemaron. Contarlos ya mismo haría parecer que el camión rinde peor de lo que rinde
  // —y es lo que muestra la planilla del cliente, donde el acumulado no se mueve hasta
  // que vuelve a llenar.
  //
  // Se recorre por fecha y no por odómetro: una surtida sin llenar no mueve el tacógrafo,
  // así que puede tener el mismo kilometraje que el llenado anterior.
  const month = current.logged_at.slice(0, 7);
  const cronologico = cadenaContinua(
    logs
      .filter((l) => l.logged_at.slice(0, 7) === month)
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at)),
  );
  const primerLleno = cronologico.findIndex((l) => l.is_full);
  const ultimoLleno = cronologico.map((l) => l.is_full).lastIndexOf(true);

  let month_km = 0;
  let month_liters = 0;
  let month_kml: number | null = null;
  if (primerLleno >= 0 && ultimoLleno > primerLleno) {
    month_km = cronologico[ultimoLleno].odometer_km - cronologico[primerLleno].odometer_km;
    // El llenado inicial es la línea de base y no cuenta: arranca en el siguiente.
    month_liters = cronologico
      .slice(primerLleno + 1, ultimoLleno + 1)
      .reduce((s, l) => s + l.liters, 0);
    month_kml = kmPorLitro(month_km, month_liters);
  }

  return {
    closed,
    segment_km,
    segment_liters,
    segment_kml,
    month_km,
    month_liters,
    month_kml,
  };
}

export interface MonthlyConsumption {
  month: string; // "YYYY-MM"
  km: number;
  liters: number;
  kml: number | null;
  closed: boolean; // cerrado con el primer llenado del mes siguiente
}

/**
 * Cierre de consumo mensual por camión (según el cliente): el consumo de un mes
 * va desde su primer llenado completo hasta el primer llenado completo del mes
 * siguiente (esa surtida cierra el mes y abre el próximo). El mes en curso queda
 * "abierto" (closed=false) hasta que haya un llenado el mes que viene.
 */
export function monthlyConsumption(logs: FLog[]): MonthlyConsumption[] {
  // CRONOLÓGICO, por el mismo motivo que `fuelFeedback`: desde que la oficina puede corregir
  // el odómetro para abajo, ordenar por kilometraje mezcla los meses —agosto se comía los km
  // de setiembre— y deja fuera del recuento los litros de un chorro que quedó por debajo.
  // Éste es el número que mira la oficina; el otro es el que ve el chofer. Tienen que dar
  // igual o no se le puede reclamar a nadie.
  const enOrden = [...logs].sort(
    (a, b) => a.logged_at.localeCompare(b.logged_at) || a.odometer_km - b.odometer_km,
  );
  if (enOrden.length === 0) return [];

  const meses = [...new Set(enOrden.map((l) => l.logged_at.slice(0, 7)))].sort();
  const out: MonthlyConsumption[] = [];

  for (const mes of meses) {
    // Cada mes se mira sobre SU cadena, recortada donde el odómetro cambió de escala. Es lo
    // que pasó en agosto del GTP 4325: seis surtidas de prueba en 393.000 km conviviendo con
    // las reales en 140.000. Medido de punta a punta el mes daba -245.851 km y el acumulado
    // salía vacío.
    const delMes = cadenaContinua(enOrden.filter((l) => l.logged_at.slice(0, 7) === mes));
    const abre = delMes.findIndex((l) => l.is_full);
    // Un mes que no arranca con un llenado no tiene línea de base contra la cual medir.
    if (abre < 0) continue;

    const ultimo = delMes[delMes.length - 1];

    // El mes cierra con el primer llenado del mes siguiente — esa surtida cierra uno y abre
    // el otro. Pero sólo si está en la misma escala: si el odómetro se corrigió entre medio,
    // los dos extremos no se pueden restar y el mes se cierra con su propia última surtida,
    // marcado como abierto. Es lo que de verdad sabemos.
    const siguiente = enOrden.find((l) => l.is_full && l.logged_at.slice(0, 7) > mes) ?? null;
    const cierra = siguiente && siguiente.odometer_km >= ultimo.odometer_km ? siguiente : null;

    const km = (cierra ?? ultimo).odometer_km - delMes[abre].odometer_km;
    // El llenado de apertura es la línea de base y no cuenta: los litros arrancan en el
    // siguiente. Mismo criterio que el tramo.
    const liters =
      delMes.slice(abre + 1).reduce((t, l) => t + l.liters, 0) + (cierra ? cierra.liters : 0);

    out.push({ month: mes, km, liters, kml: kmPorLitro(km, liters), closed: cierra != null });
  }
  return out.reverse(); // más reciente primero
}

/**
 * Consumo de un camión a partir de sus surtidas (modelo llenado a llenado):
 * el primer llenado es la línea de base (tanque lleno) y NO cuenta como consumo;
 * los litros consumidos son los de las cargas siguientes (incluye "chorros").
 * km = odómetro de la última surtida − el de la primera; rendimiento = km ÷ litros.
 * Requiere al menos 2 surtidas para dar consumo.
 */
export function fuelSummary(logs: { odometer_km: number; liters: number }[]): {
  km: number;
  liters: number;
  consumption_kml: number | null;
} {
  if (logs.length === 0) return { km: 0, liters: 0, consumption_kml: null };
  const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km);
  const km = sorted[sorted.length - 1].odometer_km - sorted[0].odometer_km;
  // Litros consumidos = todo lo cargado después del llenado inicial.
  const liters = sorted.slice(1).reduce((s, l) => s + l.liters, 0);
  const consumption_kml = sorted.length > 1 ? kmPorLitro(km, liters) : null;
  return { km, liters, consumption_kml };
}

/**
 * Si un camión puede hacer este viaje.
 *
 * "Hay camiones que directamente no hacen algunas cosas": una tolva no hace el reparto del
 * frigorífico. La oficina le asigna camiones a la plantilla y el resto deja de verla.
 *
 * Sin asignación la ven todos, y ése es el fallo seguro: si la asignación se pierde el viaje
 * sigue disponible para todos. Al revés —lista vacía significando "no la ve nadie"— un borrado
 * accidental de `template_trucks` dejaría a la flota entera sin poder cargar viajes.
 *
 * Un chofer sin camión asignado sólo ve las plantillas libres: no podemos adivinar en cuál
 * anda, y ofrecerle un viaje que su camión no hace es justo lo que el cliente quiere evitar.
 */
export function plantillaHabilitada(
  tpl: Pick<TripTemplate, "truck_ids">,
  truckId: number | null | undefined,
): boolean {
  if (!tpl.truck_ids.length) return true;
  return truckId != null && tpl.truck_ids.includes(truckId);
}

/** Lo que se le manda al celular cuando se cierra un viaje. */
export interface AvisoViaje {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * El aviso de viaje cerrado.
 *
 * "Que al finalizar un viaje le mande un aviso con toda la info: qué viaje fue, quién lo
 * hizo, etc." Va a la pantalla bloqueada del celular, así que el orden importa: primero lo
 * que identifica el viaje, después el detalle. Lo que no entra se lee abriendo la app.
 *
 * Los campos propios de cada cliente salen de la plantilla —Casarone muestra remito y
 * toneladas, Cañuelas la hoja de ruta— así que el texto no tiene nada fijo por cliente.
 *
 * `tag` lleva el id del viaje: si llegan dos avisos juntos no se pisan entre ellos.
 */
export function avisoViajeCerrado(
  trip: Pick<
    Trip,
    | "id" | "provider_name" | "origin" | "destination" | "destinatario"
    | "driver_name" | "truck_plate" | "field_values" | "segments" | "notes"
  >,
  campos: Pick<TemplateField, "key" | "label">[],
): AvisoViaje {
  const lineas: string[] = [];

  const quien = [trip.driver_name, trip.truck_plate].filter(Boolean).join(" · ");
  if (quien) lineas.push(quien);

  // Sólo los campos que el chofer completó: una etiqueta con "—" al lado es ruido en una
  // notificación, donde el espacio se cuenta.
  const datos = campos
    .map((c) => ({ label: c.label, valor: (trip.field_values ?? {})[c.key] }))
    .filter((d) => d.valor != null && String(d.valor).trim() !== "")
    .map((d) => `${d.label}: ${d.valor}`);
  if (datos.length) lineas.push(datos.join(" · "));

  // En un combinado, cada carga es una unidad facturable: por eso van todas y no un total.
  for (const s of trip.segments) {
    const cantidad = s.cantidad != null ? ` ${s.cantidad}${s.unidad ? ` ${s.unidad}` : ""}` : "";
    const clientes = s.clientes.length ? ` → ${s.clientes.join(" / ")}` : "";
    lineas.push(`${s.remitente}${cantidad}${clientes}`);
  }

  if (trip.notes?.trim()) lineas.push(`"${trip.notes.trim()}"`);

  const destino = trip.destinatario ? `${trip.destination} (${trip.destinatario})` : trip.destination;
  return {
    title: `Viaje cerrado · ${trip.provider_name}`,
    body: [`${trip.origin} → ${destino}`, ...lineas].join("\n"),
    url: `/panel/viajes/${trip.id}`,
    tag: `viaje-${trip.id}`,
  };
}

// ── Auditoría de kilómetros (las 12 fotos del tacógrafo) ──

/** Lectura mensual del tacógrafo de un camión. Una por camión y por mes. */
export interface LecturaOdometro {
  id: number;
  truck_id: number;
  /** Mes que cierra la lectura, "YYYY-MM". */
  periodo: string;
  kilometraje: number;
  /** Foto del tacógrafo. Puede faltar: R2 puede no estar bindeado. */
  r2_key: string | null;
  driver_id: number | null;
  /** Día real en que se sacó la foto: se le pide el 1 y la trae el 4. */
  tomada_at: string;
  edited_by?: number | null;
  edited_at?: string | null;
  // joins
  truck_plate?: string;
  driver_name?: string;
}

/** Un viaje del período visto por la auditoría: sólo sus km y si fue vacío. */
export interface ViajeAuditado {
  kilometros: number | null;
  vacio: boolean;
  /**
   * Los kilómetros no los puso nadie: los calculó la app con el origen y el destino. Cuentan
   * igual —si no, cada viaje sin km aparecía como kilómetros sin justificar y la alerta
   * marcaba todo— pero se avisa, para que el número no se lea como exacto.
   */
  estimado?: boolean;
}

export interface AuditoriaKm {
  periodo: string;
  /** Km entre las dos lecturas. `null` = falta alguna y no hay contra qué comparar. */
  km_periodo: number | null;
  km_cargados: number;
  km_vacios: number;
  /** `null` si no hay `km_periodo`. Negativo también es una señal, ver abajo. */
  km_sin_justificar: number | null;
  viajes_cargados: number;
  viajes_vacios: number;
  /** Viajes sin kilómetros NI forma de estimarlos: no se les inventa un recorrido. */
  viajes_sin_km: number;
  /** Viajes cuyos kilómetros los calculó la app. Cuentan, pero el total es aproximado. */
  viajes_estimados: number;
  /** Ventana real comparada (días de las dos fotos), no el mes calendario. */
  desde: string | null;
  hasta: string | null;
}

/**
 * El mes anterior a un "YYYY-MM".
 *
 * Está acá y no inline en la consulta porque enero tiene que ir a diciembre del año pasado,
 * y ése es justo el mes en que la auditoría se estrena delante del cliente.
 */
export function periodoAnterior(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  if (!Number.isFinite(anio) || !Number.isFinite(mes)) return periodo;
  return mes > 1 ? `${anio}-${String(mes - 1).padStart(2, "0")}` : `${anio - 1}-12`;
}

/**
 * La auditoría del mes de un camión: lo que el tacógrafo dice contra lo que se cargó.
 *
 * "El primero de enero tengo una foto, el 31 de enero tengo la otra, sé que en enero el
 * camión recorrió X kilómetros... hizo tantos viajes cargados... la diferencia son los
 * kilómetros vacíos." Es la pieza que le permite dejar de perseguir fotos por WhatsApp.
 *
 * Sin lectura previa (el primer mes) NO se inventa un cero: no hay contra qué comparar, y un
 * cero haría aparecer todos los kilómetros del mes como sin justificar el día que se estrena
 * el sistema — que es el peor día para que parezca roto. Queda en `null` y la pantalla dice
 * que falta la lectura anterior.
 *
 * Una diferencia NEGATIVA no es un error de cuentas: significa que los viajes suman más
 * kilómetros que los que marca el tacógrafo, y eso también hay que mirarlo (km inflados en un
 * viaje, o un kilometraje mal tipeado). Por eso se devuelve tal cual y no se recorta a cero.
 */
export function auditoriaKilometros(
  periodo: string,
  lectura: Pick<LecturaOdometro, "kilometraje" | "tomada_at"> | null,
  previa: Pick<LecturaOdometro, "kilometraje" | "tomada_at"> | null,
  viajes: ViajeAuditado[],
): AuditoriaKm {
  const cargados = viajes.filter((v) => !v.vacio);
  const vacios = viajes.filter((v) => v.vacio);

  const km_cargados = sumaKm(cargados);
  const km_vacios = sumaKm(vacios);
  const km_periodo =
    lectura && previa ? redondearKm(lectura.kilometraje - previa.kilometraje) : null;

  return {
    periodo,
    km_periodo,
    km_cargados,
    km_vacios,
    km_sin_justificar:
      km_periodo == null ? null : redondearKm(km_periodo - km_cargados - km_vacios),
    viajes_cargados: cargados.length,
    viajes_vacios: vacios.length,
    viajes_sin_km: viajes.filter((v) => !Number.isFinite(v.kilometros as number)).length,
    viajes_estimados: viajes.filter((v) => v.estimado && Number.isFinite(v.kilometros as number)).length,
    desde: previa?.tomada_at ?? null,
    hasta: lectura?.tomada_at ?? null,
  };
}

/** Un viaje sin kilómetros suma 0 y se cuenta aparte: no se le inventa un recorrido. */
function sumaKm(viajes: ViajeAuditado[]): number {
  return redondearKm(
    viajes.reduce((s, v) => s + (Number.isFinite(v.kilometros as number) ? (v.kilometros as number) : 0), 0),
  );
}

/** El tacógrafo marca enteros y los km de un viaje pueden traer coma: un residuo de punto
 *  flotante mostrado como "-0,0000001 km sin justificar" asusta y no significa nada. */
function redondearKm(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A partir de cuántos kilómetros sin justificar la auditoría lo marca en Control.
 *
 *  "Si un camión se pasa de 100-200 km, que le avise a Rodrigo en Control." Es el punto
 *  medio de lo que pidió, y está acá arriba —y no enterrado en la cuenta— porque es un
 *  número de criterio: cuando el cliente vea unos meses reales va a querer moverlo. */
export const KM_SIN_JUSTIFICAR_ALERTA = 150;

export interface SenalKm {
  /** `revisar` = pasó el umbral. `sin_datos` = falta una lectura y no hay contra qué comparar. */
  nivel: "ok" | "revisar" | "sin_datos";
  /** Qué mirar, en una línea. `null` cuando está todo en orden. */
  motivo: string | null;
}

/**
 * La señal que ve la oficina en Control para el mes de un camión.
 *
 * Separa "está mal" de "no se sabe": un camión sin la foto del mes NO es un camión con
 * kilómetros de más, y pintarlos iguales haría que el aviso pierda sentido justo cuando
 * empiece a haber muchos.
 *
 * El descuadre se mira en valor absoluto. Negativo significa que los viajes suman más de lo
 * que marca el tacógrafo —km inflados o un kilometraje mal tipeado— y eso también hay que
 * mirarlo; se dice distinto porque se busca distinto.
 */
export function senalKilometros(a: AuditoriaKm, umbral = KM_SIN_JUSTIFICAR_ALERTA): SenalKm {
  if (a.km_sin_justificar == null) {
    const cual = a.hasta == null ? "de este mes" : "del mes pasado";
    return { nivel: "sin_datos", motivo: `Falta la lectura del tacógrafo ${cual}` };
  }

  const km = a.km_sin_justificar;
  if (Math.abs(km) < umbral) return { nivel: "ok", motivo: null };

  const cuantos = Math.abs(Math.round(km)).toLocaleString("es-UY");
  if (km < 0) {
    return { nivel: "revisar", motivo: `Los viajes suman ${cuantos} km más de los que marca el tacógrafo` };
  }
  // Un viaje sin kilómetros es la explicación más probable de un descuadre para arriba, y es
  // la que se arregla sola: alcanza con completarlos. Y si hay estimados, se dice: el total
  // es aproximado y nadie tiene que salir a buscar una diferencia que puede ser del cálculo.
  const partes: string[] = [];
  if (a.viajes_sin_km) {
    partes.push(`${a.viajes_sin_km} ${a.viajes_sin_km === 1 ? "viaje" : "viajes"} sin km`);
  }
  if (a.viajes_estimados) {
    partes.push(
      `${a.viajes_estimados} con km estimado${a.viajes_estimados === 1 ? "" : "s"} por la app`,
    );
  }
  const porque = partes.length ? ` · ${partes.join(" · ")}` : "";
  return { nivel: "revisar", motivo: `${cuantos} km sin justificar${porque}` };
}

// ── El bloqueo del 1 de cada mes ──

export const MENSAJE_LECTURA_PENDIENTE =
  "Antes de salir, sacá la foto del tacógrafo con los kilómetros del mes. Es una sola vez por mes.";

/**
 * Si al chofer le falta la lectura del mes y por eso no puede empezar un viaje.
 *
 * "Por ahora vamos a bloquearla, total es solo una foto al tacógrafo, no es complicado."
 *
 * Bloquea SALIR, nunca LLEGAR: "si un chofer justo está en ruta cuando cambia el día, que le
 * permita terminar el viaje y después que le pida la foto". Por eso se llama al abrir un
 * viaje y no al cerrarlo — el que arrancó el 31 se cierra el 1 sin que le pidan nada.
 *
 * Sin camión no hay tacógrafo que fotografiar: no se bloquea a nadie por un dato que no
 * puede conseguir.
 */
export function bloqueaSalidaPorLectura(
  truckId: number | null | undefined,
  tieneLectura: boolean,
): boolean {
  return truckId != null && !tieneLectura;
}

/**
 * El aviso de surtida al celular de la oficina.
 *
 * Mismo canal que el viaje cerrado y por el mismo motivo: es un hecho que pasa en la ruta y
 * que la oficina hoy se entera cuando abre la app. El gasoil es el gasto grande del camión,
 * así que lo primero que se lee es cuántos litros y en qué camión.
 *
 * El desglose por tanque va sólo si vino: en las surtidas viejas —y cuando cargaron uno
 * solo— no existe, y "(0 + 0)" al lado de los litros es mentira, no dato faltante.
 */
export function avisoSurtida(
  log: Pick<FuelLog, "id" | "truck_id" | "odometer_km" | "liters" | "liters_tanque1" | "liters_tanque2" | "is_full">,
  quien: { driver_name?: string | null; truck_plate?: string | null },
  consumo?: Pick<FuelFeedback, "segment_kml"> | null,
): AvisoViaje {
  const litros = redondearKm(log.liters).toLocaleString("es-UY");
  const desglose =
    log.liters_tanque1 != null || log.liters_tanque2 != null
      ? ` (T1 ${log.liters_tanque1 ?? 0} + T2 ${log.liters_tanque2 ?? 0})`
      : "";

  const lineas = [`${litros} L${desglose}${log.is_full ? "" : " · chorro"}`];
  lineas.push(`Tacógrafo: ${Math.round(log.odometer_km).toLocaleString("es-UY")} km`);
  if (consumo?.segment_kml != null) lineas.push(`Rindió ${consumo.segment_kml} km/L`);
  if (quien.driver_name) lineas.push(quien.driver_name);

  return {
    title: `Surtida · ${quien.truck_plate ?? "camión"}`,
    body: lineas.join("\n"),
    url: `/panel/camion/${log.truck_id}`,
    tag: `surtida-${log.id}`,
  };
}

/**
 * Cuántos días hay que correr un viaje para que caiga en la fecha pedida.
 *
 * "Pidió que pueda cambiar la fecha porque si quiere ingresar un viaje pasado, no puede."
 * Se corre el viaje ENTERO —salida y llegada— la misma cantidad de días, en vez de plantarle
 * la fecha nueva a cada extremo: un viaje que salió un día y llegó al otro tiene que seguir
 * durando lo mismo después de corregirle la fecha.
 *
 * Devuelve 0 si alguna de las dos fechas no se entiende: correr por un NaN dejaría el viaje
 * sin fecha, que es peor que no corregirlo.
 */
export function corrimientoEnDias(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Una fecha "YYYY-MM-DD" bien formada. Lo que llega del formulario no se cree sin mirar. */
export function esFechaValida(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/**
 * El recorrido del viaje, armado con sus cargas.
 *
 * "Sacale esos pasos." En el combinado genérico cada carga es un tramo propio —el chofer
 * elige el departamento donde cargó y el de destino, carga por carga—, así que preguntarle
 * además de dónde sale y adónde va el viaje entero era pedirle dos veces lo mismo. Con tres
 * cargas eran catorce pasos y dos repetidos.
 *
 * Y era ambiguo: si carga en Artigas y en Salto y descarga todo en Montevideo, ¿cuál es "el
 * origen del viaje"? El dato verdadero está en las cargas. El viaje sale de donde salió la
 * primera y termina donde terminó la última.
 *
 * Devuelve `null` si ninguna carga dice dónde estuvo: no se le inventa un recorrido a un
 * viaje que todavía no tiene con qué armarlo. Las cargas sin ubicación propia —los renglones
 * que deja puestos la oficina— se saltean, no cuentan como extremo.
 */
export function recorridoSegunCargas(
  segments: Pick<TripSegment, "origen" | "destino">[],
): { origin: string; destination: string } | null {
  const conOrigen = segments.filter((s) => s.origen?.trim());
  const conDestino = segments.filter((s) => s.destino?.trim());
  if (!conOrigen.length && !conDestino.length) return null;
  return {
    origin: conOrigen[0]?.origen?.trim() ?? "",
    destination: conDestino[conDestino.length - 1]?.destino?.trim() ?? "",
  };
}
