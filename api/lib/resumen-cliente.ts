import type { Trip, TripTemplate } from "../../shared/domain";

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

function fila(t: Trip): FilaResumen {
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
 */
export function resumenCliente(
  trips: Trip[],
  templates: TripTemplate[],
  opts: { porDestino?: boolean } = {},
): { columnas: ColumnaResumen[]; grupos: GrupoResumen[]; viajes: number; totales: Record<string, number> } {
  const columnas = columnasDe(templates);
  const filas = trips.map(fila);

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

  return { columnas, grupos, viajes: filas.length, totales: totalizar(filas, columnas) };
}
