/**
 * Factura y pago por cliente dentro del viaje. Ver docs/FACTURACION-POR-CLIENTE.md.
 *
 * La unidad es EL CLIENTE DENTRO DEL VIAJE —a quién se le cobra, el `cobro_a` de cada carga—, no la
 * carga suelta: tres cargas de un mismo cliente son una factura, tres cargas de tres clientes son tres.
 *
 * Todo lo de acá es puro: no lee D1 ni conoce rutas. Decide tres cosas: cuál es la clave de un cliente,
 * qué estrategia de facturación le toca a un viaje y en qué estado queda.
 */
import { estadoDeCobro, normalizeNombre, type CobroTipo, type EstadoDeCobro, type TripSegment } from "./domain";

/** La parte de una carga que decide a quién se le cobra. */
export type CargaParaFacturar = Pick<TripSegment, "sid" | "cobro_a" | "cobro_tipo"> & Partial<Pick<TripSegment, "cobro_id">>;

/** Un cliente del viaje: las cargas que se le cobran juntas, en una sola factura. */
export interface ClienteDelViaje {
  clave: string;
  nombre: string;
  tipo: CobroTipo | null;
  /** Las cargas (por `sid`) que se le cobran a este cliente. */
  sids: string[];
}

/**
 * La clave que identifica a un cliente dentro del viaje.
 *
 *   cliente:74         — la oficina lo eligió de la libreta (el id es lo estable)
 *   cliente:galpon     — escrito a mano: el nombre normalizado, para que "Galpón" y "GALPON" sean uno
 *   proveedor:saman    — se le cobra a un proveedor
 *
 * `null` si la carga todavía no tiene a quién cobrarle: no hay nada que facturar.
 */
export function claveDeCliente(carga: Pick<CargaParaFacturar, "cobro_a" | "cobro_tipo" | "cobro_id">): string | null {
  const nombre = carga.cobro_a?.trim();
  if (!nombre) return null;
  const tipo = carga.cobro_tipo ?? "cliente";
  // SIEMPRE el nombre normalizado, aunque la carga lleve `cobro_id`: las cargas que resuelve una regla no
  // llevan id y las que se eligen de la libreta sí, y con el id en la clave el mismo cliente salía con dos
  // claves en un viaje (dos cajitas, dos facturas). Hoy un renombre de la libreta no se propaga a las cargas,
  // así que el nombre es igual de estable.
  return `${tipo}:${normalizeNombre(nombre)}`;
}

/** Los clientes distintos del viaje, en el orden en que aparecen sus cargas, y cuántas cargas quedaron sin asignar. */
export function clientesDelViaje(cargas: readonly CargaParaFacturar[] | null | undefined): {
  clientes: ClienteDelViaje[];
  sinAsignar: number;
} {
  const porClave = new Map<string, ClienteDelViaje>();
  let sinAsignar = 0;
  for (const c of cargas ?? []) {
    const clave = claveDeCliente(c);
    if (!clave) {
      sinAsignar++;
      continue;
    }
    const ya = porClave.get(clave);
    if (ya) ya.sids.push(c.sid);
    else porClave.set(clave, { clave, nombre: c.cobro_a!.trim(), tipo: c.cobro_tipo ?? null, sids: [c.sid] });
  }
  return { clientes: [...porClave.values()], sinAsignar };
}

// ── La estrategia ──

export type EstrategiaDeFacturacion = "por_viaje" | "por_cliente";

/**
 * Cómo se factura este viaje. Es el ÚNICO lugar que lo decide.
 *
 *   tiene número de factura en el viaje (todo lo facturado hasta hoy) → por viaje, como siempre
 *   sin factura de viaje y con cargas                                  → por cliente
 *   sin factura de viaje y sin cargas (los clásicos)                   → por viaje
 *
 * Un viaje por cliente nunca escribe `trips.factura_numero`, y uno por viaje nunca escribe la tabla
 * de clientes: así lo que ya está facturado no cambia de estado, de color ni de bloqueo.
 */
export function estrategiaDeFacturacion(viaje: {
  factura_numero?: string | null;
  segments?: readonly unknown[] | null;
}): EstrategiaDeFacturacion {
  if (viaje.factura_numero) return "por_viaje";
  // Por cliente sólo si hay a quién separar: un viaje con cargas pero NINGÚN cobro asignado se sigue
  // facturando por viaje, con el tilde de siempre (si no, quedaba sin forma de facturarse).
  const cargas = (viaje.segments ?? []) as readonly CargaParaFacturar[];
  return clientesDelViaje(cargas).clientes.length > 0 ? "por_cliente" : "por_viaje";
}

// ── El estado ──

/** Lo que se guarda de un cliente facturado (una fila de `viaje_cliente_facturacion`). */
export interface FacturaDeCliente {
  cliente_clave: string;
  cliente_nombre: string;
  /** `null` = la factura se sacó: la fila sólo queda por el rastro (`factura_quitada`). */
  factura_numero: string | null;
  facturado_at?: string | null;
  facturado_by?: number | null;
  factura_quitada?: string | null;
  factura_quitada_at?: string | null;
  pago_at?: string | null;
  pago_by?: number | null;
  pago_by_name?: string | null;
}

export type FacturacionDelViaje = "sin_facturar" | "a_medias" | "facturado";
export type PagoDelViaje = "sin_pagar" | "a_medias" | "pago";

export interface EstadoPorCliente {
  /** Clientes con a quién cobrarle. */
  clientes: number;
  facturados: number;
  /** Pagados de los facturados. */
  pagados: number;
  /** Cargas que todavía no tienen a quién cobrarle. */
  sinAsignar: number;
  facturacion: FacturacionDelViaje;
  /** `null` mientras no haya nada facturado: no hay nada que cobrar. */
  pago: PagoDelViaje | null;
}

/**
 * El estado de un viaje por cliente, a partir de sus cargas y de lo que ya se marcó.
 *
 * Sólo cuentan las marcas de clientes que HOY están entre las cargas: una marca de un cliente que ya no
 * está (no debería pasar: las rutas lo frenan) no inventa un "facturado" que no se ve en ningún lado.
 */
export function estadoPorCliente(
  cargas: readonly CargaParaFacturar[] | null | undefined,
  marcas: readonly Pick<FacturaDeCliente, "cliente_clave" | "factura_numero" | "pago_at">[],
): EstadoPorCliente {
  const { clientes, sinAsignar } = clientesDelViaje(cargas);
  const facturadas = new Map(marcas.filter((m) => m.factura_numero).map((m) => [m.cliente_clave, m]));
  const delViaje = clientes.filter((c) => facturadas.has(c.clave));
  const facturados = delViaje.length;
  const pagados = delViaje.filter((c) => facturadas.get(c.clave)?.pago_at).length;

  const facturacion: FacturacionDelViaje =
    facturados === 0 ? "sin_facturar" : facturados === clientes.length && sinAsignar === 0 ? "facturado" : "a_medias";

  let pago: PagoDelViaje | null = null;
  if (facturados > 0) {
    pago = pagados === 0 ? "sin_pagar" : pagados === facturados && facturacion === "facturado" ? "pago" : "a_medias";
  }
  return { clientes: clientes.length, facturados, pagados, sinAsignar, facturacion, pago };
}

/**
 * Los tres colores del Excel de Rodrigo para un viaje, sea cual sea su estrategia.
 *
 * Por viaje: exactamente `estadoDeCobro` de siempre. Por cliente: lo peor que falta —blanco si algo
 * está sin facturar (el "a medias" incluido), rojo si todo está facturado y algo sin pagar, verde sólo
 * si todo está pago—. El "a medias" no inventa colores: lo dice una marca chica con las cuentas.
 */
export function estadoDeCobroDelViaje(
  viaje: {
    factura_numero?: string | null;
    pago_at?: string | null;
    segments?: readonly CargaParaFacturar[] | null;
  },
  marcas: readonly Pick<FacturaDeCliente, "cliente_clave" | "factura_numero" | "pago_at">[] = [],
): EstadoDeCobro {
  if (estrategiaDeFacturacion(viaje) === "por_viaje") return estadoDeCobro(viaje);
  const e = estadoPorCliente(viaje.segments, marcas);
  if (e.facturacion !== "facturado") return "sin_facturar";
  return e.pago === "pago" ? "pago" : "facturado";
}

// ── Qué se puede marcar ──

/** Lo que hace falta saber de un viaje para marcarle un cliente. */
export interface ViajeParaMarcar {
  status: string;
  factura_numero?: string | null;
  segments?: readonly CargaParaFacturar[] | null;
}

/**
 * Por qué NO se le puede marcar (factura o pago) este cliente a este viaje; `null` si se puede.
 *
 * Lo verifica el servidor por cada ítem, con las cargas de AHORA: la pantalla pudo haber traído la lista
 * vieja, y un cliente que dejó de figurar no puede quedar facturado en una fila que ya no lo muestra.
 */
export function motivoParaMarcarCliente(viaje: ViajeParaMarcar | null | undefined, clave: string): string | null {
  if (!viaje) return "Ese viaje ya no está.";
  if (estrategiaDeFacturacion(viaje) === "por_viaje") {
    return viaje.factura_numero
      ? `Este viaje ya salió entero en la factura ${viaje.factura_numero}.`
      : "Este viaje no tiene cargas: se factura entero, no por cliente.";
  }
  if (viaje.status !== "COMPLETADO") return "Sólo se factura un viaje completado.";
  if (!clientesDelViaje(viaje.segments).clientes.some((c) => c.clave === clave)) {
    return "Ese cliente ya no figura en las cargas del viaje.";
  }
  return null;
}

/**
 * Qué hace un atajo viejo (`{ trip_ids }`, pensado para un viaje entero) con un viaje por cliente.
 * Con UN cliente marca a ese; con varios no marca nada, para que ningún atajo le ponga un solo número
 * a clientes que se facturan aparte; sin ninguno (todo sin asignar) tampoco hay a quién marcar.
 */
export function clienteUnicoDelViaje(
  segments: readonly CargaParaFacturar[] | null | undefined,
  /** Sacar una factura o un pago no necesita que todas las cargas estén asignadas; marcarla sí. */
  opts: { ignorarSinAsignar?: boolean } = {},
): { ok: true; cliente: ClienteDelViaje } | { ok: false; motivo: string } {
  const { clientes, sinAsignar } = clientesDelViaje(segments);
  if (clientes.length === 1 && (sinAsignar === 0 || opts.ignorarSinAsignar)) return { ok: true, cliente: clientes[0] };
  if (clientes.length === 0) return { ok: false, motivo: "Todavía no tiene a quién cobrarle: asignalo antes." };
  return { ok: false, motivo: "Tiene varios clientes (o cargas sin asignar): marcalos por cliente." };
}

// ── Los filtros de Viajes (Facturado, Pago, Factura) ──

export interface FiltroDeCobro {
  facturado?: "si" | "no";
  pago?: "si" | "no";
  /** La factura o referencia exacta, sin distinguir mayúsculas. */
  factura?: string;
}

const igual = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * ¿Pasa este viaje los filtros de facturación de la lista?
 *
 * Por viaje es EXACTAMENTE lo que antes hacía el SQL (`t.factura_numero IS NOT NULL`, etc.). Por cliente los
 * filtros buscan "algo" y el "a medias" figura de los dos lados, para que nada quede escondido: "facturado = sí"
 * es lo que ya salió en alguna factura, "no" lo que todavía tiene algo por facturar; "pago = sí" lo que ya cobró y
 * no debe nada de lo facturado, "pago = no" lo facturado que falta cobrar (aunque falte facturar a otro cliente
 * del mismo viaje); y la factura se busca también entre las de cada cliente. El color de la fila es otra cosa:
 * dice "lo peor que falta".
 */
export function pasaFiltroDeCobro(
  viaje: {
    status: string;
    factura_numero?: string | null;
    pago_at?: string | null;
    segments?: readonly CargaParaFacturar[] | null;
  },
  marcas: readonly Pick<FacturaDeCliente, "cliente_clave" | "factura_numero" | "pago_at">[],
  f: FiltroDeCobro,
): boolean {
  if (estrategiaDeFacturacion(viaje) === "por_viaje") {
    if (f.facturado === "si" && !viaje.factura_numero) return false;
    if (f.facturado === "no" && !(!viaje.factura_numero && viaje.status === "COMPLETADO")) return false;
    if (f.pago === "si" && !viaje.pago_at) return false;
    if (f.pago === "no" && !(viaje.factura_numero && !viaje.pago_at)) return false;
    if (f.factura && !igual(viaje.factura_numero, f.factura)) return false;
    return true;
  }
  // Por cliente los filtros buscan "algo": el "a medias" figura de los dos lados para que nada quede
  // escondido. "Facturado = sí" es lo que ya salió en alguna factura; "no", lo que todavía tiene algo por
  // facturar; "pago = sí", lo que ya cobró y no debe nada de lo facturado; "pago = no", lo facturado que
  // todavía no se cobró (aunque falte facturar a otro cliente del mismo viaje).
  const e = estadoPorCliente(viaje.segments, marcas);
  if (f.facturado === "si" && e.facturados === 0) return false;
  if (f.facturado === "no" && !(viaje.status === "COMPLETADO" && e.facturacion !== "facturado")) return false;
  if (f.pago === "si" && !(e.facturados > 0 && e.pagados === e.facturados)) return false;
  if (f.pago === "no" && !(e.facturados > e.pagados)) return false;
  if (f.factura && !marcas.some((m) => igual(m.factura_numero, f.factura!))) return false;
  return true;
}

// ── Para el resumen y el Excel ──

/**
 * Lo que va en la columna "Nro Fac." de un viaje: el número de siempre, o —por cliente— el de cada cliente
 * facturado. Con más de un cliente se aclara de quién es cada número: "A-1 (Jair) · A-2 (BMR)".
 */
export function facturaDelViaje(
  viaje: { factura_numero?: string | null; segments?: readonly CargaParaFacturar[] | null },
  marcas: readonly Pick<FacturaDeCliente, "cliente_clave" | "cliente_nombre" | "factura_numero">[] = [],
): string {
  if (estrategiaDeFacturacion(viaje) === "por_viaje") return viaje.factura_numero ?? "";
  const { clientes } = clientesDelViaje(viaje.segments);
  const facturadas = new Map(marcas.filter((m) => m.factura_numero).map((m) => [m.cliente_clave, m]));
  const delViaje = clientes.filter((c) => facturadas.has(c.clave));
  if (clientes.length <= 1) return delViaje.length ? (facturadas.get(delViaje[0].clave)!.factura_numero as string) : "";
  return delViaje.map((c) => `${facturadas.get(c.clave)!.factura_numero} (${c.nombre})`).join(" · ");
}

/** ¿Falta facturar algo de este viaje? Por viaje, mientras no tenga número; por cliente, mientras no esté todo. */
export function tieneAlgoPorFacturar(
  viaje: { factura_numero?: string | null; segments?: readonly CargaParaFacturar[] | null },
  marcas: readonly Pick<FacturaDeCliente, "cliente_clave" | "factura_numero" | "pago_at">[] = [],
): boolean {
  if (estrategiaDeFacturacion(viaje) === "por_viaje") return !viaje.factura_numero;
  return estadoPorCliente(viaje.segments, marcas).facturacion !== "facturado";
}
