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
  return `${tipo}:${carga.cobro_id != null ? carga.cobro_id : normalizeNombre(nombre)}`;
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
  return viaje.segments && viaje.segments.length > 0 ? "por_cliente" : "por_viaje";
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
