import { TRIP_STATUS, type Trip, type TripTemplate } from "../../shared/domain";
import type { TripFacturacion } from "../repos/trips";

/**
 * El resumen de un cliente: lo que la oficina mira para facturarle.
 *
 * "Resumen de Casarone: toneladas de carga y nros de remitos. Resumen Nayna: ídem. Tycsur,
 * ídem. Resumen mensual Cañuelas agrupado por destinos."
 *
 * No hay una pantalla por cliente: las columnas salen de los campos que define la plantilla
 * de cada uno. Casarone pide remito y toneladas, TYCSUR el MIC, Cañuelas la hoja de ruta —
 * el resumen muestra lo que ese cliente pide, sin nada hardcodeado. El día que agregue un
 * cliente nuevo desde la pantalla de plantillas, su resumen sale solo.
 */

export interface ColumnaResumen {
  key: string;
  label: string;
  /** Las numéricas se suman al pie. Un remito es un número y NO se suma: sumar remitos no
   *  significa nada. Sólo se totaliza lo que la plantilla marcó como peso o cantidad. */
  totaliza: boolean;
}

/**
 * El viaje como lo mira el resumen. `Partial` porque el número de factura sólo lo trae
 * `listTripsFacturables`: un viaje leído sin la marca es un viaje sin facturar, que es
 * exactamente lo que era antes de que existiera la factura.
 */
export type ViajeDelResumen = Trip & Partial<TripFacturacion>;

export interface FilaResumen {
  trip_id: number;
  fecha: string;
  origen: string;
  destino: string;
  destinatario: string | null;
  chofer: string;
  camion: string;
  estado: string;
  /** Los campos propios de la plantilla de ese cliente. */
  valores: Record<string, string>;
  /** Cargas del viaje, para los combinados. Vacío en los de un solo tramo. */
  cargas: { remitente: string; clientes: string; cantidad: number | null; unidad: string | null; remito: string | null }[];
  /** El número de la factura en la que ya salió. `null` = todavía está para facturar. */
  factura_numero: string | null;
}

export interface GrupoResumen {
  /** Destino, o "" cuando no se agrupa. */
  titulo: string;
  filas: FilaResumen[];
  viajes: number;
  totales: Record<string, number>;
}

/**
 * Columnas del resumen, a partir de las plantillas del cliente.
 *
 * Se unen los campos de todas sus plantillas: Cañuelas tiene Reparto y Devoluciones, con
 * campos distintos, y en el resumen mensual aparecen los dos tipos de viaje mezclados.
 */
export function columnasDe(templates: TripTemplate[]): ColumnaResumen[] {
  const vistas = new Map<string, ColumnaResumen>();
  for (const tpl of templates) {
    for (const f of tpl.fields) {
      if (vistas.has(f.key)) continue;
      // El peso siempre se totaliza. Los demás numéricos también, salvo que el nombre
      // delate que es un identificador: sumar remitos o números de MIC no significa nada.
      const esIdentificador = /remito|rto|mic|hoja|boleta|n[°º]|nro|numero|número/i.test(f.label);
      vistas.set(f.key, {
        key: f.key,
        label: f.label,
        totaliza: !!f.is_weight || (f.type === "numero" && !esIdentificador),
      });
    }
  }
  return [...vistas.values()];
}

/**
 * Qué viajes entran en el resumen para facturar.
 *
 * Dos cosas quedan afuera, por motivos distintos:
 *
 * - Los CANCELADO, porque mostrarlos en el resumen de cobro sería sumar plata que no se va a
 *   cobrar. (Esto ya era así antes de que existiera la factura.)
 * - Los que ya tienen número de factura: "al mes que viene, yo ya sé que todo lo que está con
 *   el número de factura, esos viajes quedan afuera". Si volvieran a aparecer, el riesgo no es
 *   estético: los vuelve a puntear y los factura dos veces.
 *
 * Con `incluirFacturados` vuelven a la lista, que es el único modo de ir a buscar el viaje que
 * marcó por error para sacarle la factura.
 */
export function viajesAFacturar<T extends ViajeDelResumen>(
  trips: T[],
  opts: { incluirFacturados?: boolean } = {},
): T[] {
  return trips.filter(
    (t) => t.status !== TRIP_STATUS.CANCELADO && (opts.incluirFacturados || !t.factura_numero),
  );
}

function fila(t: ViajeDelResumen): FilaResumen {
  return {
    trip_id: t.id,
    fecha: t.started_at.slice(0, 10),
    origen: t.origin,
    destino: t.destination,
    destinatario: t.destinatario,
    chofer: t.driver_name ?? "",
    camion: t.truck_plate ?? "",
    estado: t.status,
    valores: t.field_values ?? {},
    cargas: t.segments.map((s) => ({
      remitente: s.remitente,
      clientes: s.clientes.join(" / "),
      cantidad: s.cantidad,
      unidad: s.unidad,
      remito: s.remito,
    })),
    factura_numero: t.factura_numero ?? null,
  };
}

function totalizar(filas: FilaResumen[], columnas: ColumnaResumen[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of columnas) {
    if (!col.totaliza) continue;
    const suma = filas.reduce((s, f) => {
      const n = Number(f.valores[col.key]);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    // Los decimales de las toneladas se van acumulando: 28,07 + 31,4 no puede dar 59,469999.
    out[col.key] = Math.round(suma * 100) / 100;
  }
  return out;
}

/**
 * Arma el resumen. Con `porDestino`, un grupo por destino — que es lo que pidió para
 * Cañuelas, donde lo que importa es cuánto fue a cada lado.
 *
 * Los totales salen de lo que quedó adentro: lo ya facturado no vuelve a sumar, porque el
 * total es lo que le va a facturar ahora.
 */
export function resumenCliente(
  trips: ViajeDelResumen[],
  templates: TripTemplate[],
  opts: { porDestino?: boolean; incluirFacturados?: boolean } = {},
): {
  columnas: ColumnaResumen[];
  grupos: GrupoResumen[];
  viajes: number;
  totales: Record<string, number>;
  /** Cuántos quedaron escondidos por estar facturados, para poder ofrecer verlos. */
  facturados: number;
} {
  const columnas = columnasDe(templates);
  const aFacturar = viajesAFacturar(trips, opts);
  // Los escondidos son los que quedaron afuera SÓLO por tener factura: los CANCELADO no
  // cuentan, esos nunca estuvieron en el resumen y ofrecer verlos no tendría sentido.
  const facturados = viajesAFacturar(trips, { incluirFacturados: true }).length - aFacturar.length;
  const filas = aFacturar.map(fila);

  const grupos: GrupoResumen[] = [];
  if (opts.porDestino) {
    const porDestino = new Map<string, FilaResumen[]>();
    for (const f of filas) {
      const clave = f.destinatario ? `${f.destino} · ${f.destinatario}` : f.destino;
      const previas = porDestino.get(clave);
      if (previas) previas.push(f);
      else porDestino.set(clave, [f]);
    }
    for (const [titulo, suyas] of [...porDestino.entries()].sort((a, b) => b[1].length - a[1].length)) {
      grupos.push({ titulo, filas: suyas, viajes: suyas.length, totales: totalizar(suyas, columnas) });
    }
  } else {
    grupos.push({ titulo: "", filas, viajes: filas.length, totales: totalizar(filas, columnas) });
  }

  return { columnas, grupos, viajes: filas.length, totales: totalizar(filas, columnas), facturados };
}
