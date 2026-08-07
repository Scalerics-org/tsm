import {
  LIBRETA_ESTADO,
  normalizeNombre,
  type CobroRegla,
  type LibretaEntry,
  type PendienteCobro,
} from "@shared/domain";

/** Alcance de una entrada: todas, solo las de un cliente, o solo las globales. */
export type AlcanceFiltro = "todos" | "globales" | number;

/**
 * Orden de trabajo de la oficina: primero lo que hay que revisar (las altas del chofer),
 * después lo más usado. Lo pendiente no se busca, tiene que aparecer arriba solo.
 */
export function ordenarEntradas(entries: LibretaEntry[]): LibretaEntry[] {
  return [...entries].sort((a, b) => {
    const nuevaA = a.estado === LIBRETA_ESTADO.NUEVO ? 0 : 1;
    const nuevaB = b.estado === LIBRETA_ESTADO.NUEVO ? 0 : 1;
    if (nuevaA !== nuevaB) return nuevaA - nuevaB;
    if (a.usos !== b.usos) return b.usos - a.usos;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function filtrarEntradas(
  entries: LibretaEntry[],
  { query = "", alcance = "todos" as AlcanceFiltro }: { query?: string; alcance?: AlcanceFiltro } = {},
): LibretaEntry[] {
  const key = normalizeNombre(query);
  return entries.filter((e) => {
    if (alcance === "globales" && e.provider_id !== null) return false;
    // Las globales sirven a todos los clientes, así que entran en el filtro por cliente.
    if (typeof alcance === "number" && e.provider_id !== null && e.provider_id !== alcance) return false;
    return !key || normalizeNombre(e.nombre).includes(key);
  });
}

/** Nombre por id, para poder describir una regla sin volver a pedir la libreta. */
export function nombrePorId(entries: LibretaEntry[]): Map<number, string> {
  return new Map(entries.map((e) => [e.id, e.nombre]));
}

/**
 * Reglas de un remitente, con la general (cualquier destino) al final: es el fallback,
 * y leerla última es leerla en el orden en que se aplica.
 */
export function reglasDeRemitente(reglas: CobroRegla[], remitenteId: number): CobroRegla[] {
  return reglas
    .filter((r) => r.remitente_id === remitenteId)
    .sort((a, b) => (a.destinatario_id == null ? 1 : 0) - (b.destinatario_id == null ? 1 : 0));
}

export function describirDestino(regla: CobroRegla, nombres: Map<number, string>): string {
  if (regla.destinatario_id == null) return "cualquier destino";
  return nombres.get(regla.destinatario_id) ?? `#${regla.destinatario_id}`;
}

/** Una combinación remitente + destinatarios sin regla, con todo lo que arrastra. */
export interface PendienteGrupo {
  key: string;
  remitente: string;
  remitente_id: number | null;
  clientes: string[];
  cliente_ids: number[];
  /** Renglones afectados por esta combinación. */
  cargas: number;
  /** Viajes distintos donde aparece. */
  viajes: number[];
}

/**
 * Agrupa las cargas sin regla por combinación remitente+destinatarios.
 *
 * La oficina no resuelve una carga a la vez: define la regla de la combinación una vez
 * y se arreglan todas las que arrastra (y las que vengan). Mostrar 40 renglones cuando
 * son 3 combinaciones hace parecer trabajo diario a algo que no lo es.
 */
export function agruparPendientes(pendientes: PendienteCobro[]): PendienteGrupo[] {
  const grupos = new Map<string, PendienteGrupo>();

  for (const p of pendientes) {
    const ids = [...p.cliente_ids].sort((a, b) => a - b);
    const key = `${p.remitente_id ?? normalizeNombre(p.remitente)}|${ids.join(",")}`;
    const grupo = grupos.get(key);
    if (!grupo) {
      grupos.set(key, {
        key,
        remitente: p.remitente,
        remitente_id: p.remitente_id,
        clientes: p.clientes,
        cliente_ids: p.cliente_ids,
        cargas: 1,
        viajes: [p.trip_id],
      });
      continue;
    }
    grupo.cargas += 1;
    if (!grupo.viajes.includes(p.trip_id)) grupo.viajes.push(p.trip_id);
  }

  return [...grupos.values()].sort((a, b) => b.cargas - a.cargas);
}
