import type { CubiertaEnStock } from "./datos-extra";
import { kmEnTramos, type Balanceo, type Cubierta, type PuestaAnterior, type Tramo } from "./tipos";

/**
 * Qué pasa con una cubierta que se saca o se mueve, como cuentas puras (sin pantalla ni almacenamiento):
 *  - se da de baja (fin de vida útil, rotura por mala maniobra o por un objeto),
 *  - se guarda en el stock de usadas,
 *  - se pasa a otra posición del mismo vehículo, o a una posición de OTRO vehículo.
 * La posición que queda libre puede recibir otra cubierta (del stock o cargada a mano) o quedar vacía. Si se mueve a
 * una posición ocupada, hay que decir qué pasa con la que estaba (intercambio, stock o baja): nunca se pisa en silencio.
 *
 * Cada cubierta tiene un id interno (`uid`) y el historial de dónde estuvo, que la sigue entre vehículos y stock aunque
 * no tenga código. Los km de cada tramo son los del tacógrafo del vehículo en que estuvo.
 */

export type MotivoDeBaja = "fin_de_vida" | "mala_maniobra" | "objeto";
export const TEXTO_DE_BAJA: Record<MotivoDeBaja, string> = {
  fin_de_vida: "Fin de la vida útil",
  mala_maniobra: "Se rompió por mala maniobra",
  objeto: "Se rompió por agarrar un objeto",
};

/** Qué pasa con la cubierta que estaba en la posición destino. */
export type QueHacerConLaQueEstaba = { tipo: "intercambio" } | { tipo: "stock" } | { tipo: "baja"; motivo: MotivoDeBaja };

export type Destino =
  | { tipo: "baja"; motivo: MotivoDeBaja }
  | { tipo: "stock" }
  | { tipo: "mover"; patente: string; posicion: number; ocupada?: QueHacerConLaQueEstaba };

/** Qué se pone en el lugar que quedó libre. */
export type Reemplazo = { tipo: "stock"; uid: string } | { tipo: "manual"; modeloId: string; codigo?: string } | { tipo: "vacia" };

export interface Movimiento {
  patente: string;
  posicion: number;
  fecha: string;
  /** Km del tacógrafo del vehículo de origen en ese momento. */
  km: number;
  obs: string;
  destino: Destino;
  reemplazo?: Reemplazo;
}

/** Una cubierta dada de baja: sale de servicio y queda su historial. */
export interface CubiertaBaja {
  uid: string;
  codigo?: string;
  modeloId: string;
  fecha: string;
  patente: string;
  posicion: number;
  /** Los km del último tramo, en el vehículo del que salió. */
  km: number;
  motivo: string;
  obs: string;
  historial: Tramo[];
  balanceos?: Balanceo[];
}

export interface VehiculoEnJuego {
  /** Km del tacógrafo hoy. */
  km: number;
  cubiertas: Cubierta[];
  /** El historial de las posiciones que quedaron sin cubierta. */
  vacias: Record<number, PuestaAnterior[]>;
}

export interface Situacion {
  flota: Record<string, VehiculoEnJuego>;
  stock: CubiertaEnStock[];
  bajas: CubiertaBaja[];
}

/** El id interno de una cubierta de un vehículo, que la sigue aunque no tenga código ni se la mueva. */
export const uidDeCubierta = (patente: string, c: Pick<Cubierta, "uid" | "numero" | "fecha">) =>
  c.uid ?? `${patente.replace(/\s+/g, "")}-p${c.numero}-${c.fecha}`;
export const uidDeStock = (s: Pick<CubiertaEnStock, "uid" | "codigo">) => s.uid ?? s.codigo;

const dd_mm = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};

const tramoDeVehiculo = (c: Cubierta, patente: string, hasta: string, kmHasta: number): Tramo => ({
  tipo: "vehiculo",
  patente,
  posicion: c.numero,
  desde: c.fecha,
  kmDesde: c.kmInicial,
  hasta,
  kmHasta,
});

const puestaAnterior = (c: Cubierta, hasta: string, km: number, motivo: string): PuestaAnterior => ({
  codigo: c.codigo ?? "Sin código",
  modeloId: c.modeloId,
  desde: c.fecha,
  hasta,
  kmRecorridos: Math.max(0, Math.round(km - c.kmInicial)),
  motivo,
});

/**
 * La cubierta que ocupa un lugar libre: una del stock (con su historial, que sigue), una cargada a mano, o ninguna.
 * Devuelve también el stock sin la que se usó.
 */
function armarReemplazo(
  r: Reemplazo,
  stock: CubiertaEnStock[],
  posicion: number,
  fecha: string,
  km: number,
  anteriores: PuestaAnterior[],
  nuevoUid: () => string,
): { cubierta?: Cubierta; stock: CubiertaEnStock[] } {
  if (r.tipo === "stock") {
    const s = stock.find((x) => uidDeStock(x) === r.uid);
    if (!s) return { stock };
    return {
      stock: stock.filter((x) => x !== s),
      cubierta: {
        numero: posicion,
        uid: uidDeStock(s),
        codigo: s.codigo.trim() || undefined,
        modeloId: s.modeloId,
        fecha,
        kmInicial: km,
        obs: "",
        anteriores,
        historial: [...(s.historial ?? []), { tipo: "stock", desde: s.desde, hasta: fecha }],
        balanceos: s.balanceos,
      },
    };
  }
  if (r.tipo === "manual") {
    return {
      stock,
      cubierta: { numero: posicion, uid: nuevoUid(), codigo: r.codigo?.trim() || undefined, modeloId: r.modeloId, fecha, kmInicial: km, obs: "", anteriores, historial: [] },
    };
  }
  return { stock };
}

/** Pone una cubierta en una posición que está vacía (del stock o cargada a mano). Ya ocupada, no hace nada. */
export function colocarEnLugarVacio(
  antes: Situacion,
  c: { patente: string; posicion: number; fecha: string; km: number; reemplazo: Reemplazo },
  nuevoUid: () => string,
): Situacion {
  const v = antes.flota[c.patente];
  if (!v || v.cubiertas.some((x) => x.numero === c.posicion) || c.reemplazo.tipo === "vacia") return antes;
  const r = armarReemplazo(c.reemplazo, antes.stock, c.posicion, c.fecha, c.km, v.vacias[c.posicion] ?? [], nuevoUid);
  if (!r.cubierta) return antes;
  const vacias = { ...v.vacias };
  delete vacias[c.posicion];
  return {
    ...antes,
    stock: r.stock,
    flota: { ...antes.flota, [c.patente]: { ...v, cubiertas: [...v.cubiertas, r.cubierta].sort((a, b) => a.numero - b.numero), vacias } },
  };
}

/** Aplica un movimiento y devuelve la situación nueva. No toca la que recibe. */
export function aplicarMovimiento(antes: Situacion, m: Movimiento, nuevoUid: () => string): Situacion {
  const origenAntes = antes.flota[m.patente];
  const t = origenAntes?.cubiertas.find((c) => c.numero === m.posicion);
  if (!origenAntes || !t) return antes;

  const flota: Record<string, VehiculoEnJuego> = { ...antes.flota };
  const vehiculo = (patente: string): VehiculoEnJuego => {
    const v = flota[patente];
    flota[patente] = { ...v, cubiertas: [...v.cubiertas], vacias: { ...v.vacias } };
    return flota[patente];
  };
  let stock = [...antes.stock];
  let bajas = [...antes.bajas];

  const origen = vehiculo(m.patente);
  const extra = m.obs.trim();
  const conObs = (texto: string) => [texto, extra].filter(Boolean).join(" · ");
  const tUid = uidDeCubierta(m.patente, t);
  const cerradoT = [...(t.historial ?? []), tramoDeVehiculo(t, m.patente, m.fecha, m.km)];
  // Los km totales de la cubierta: los de este tramo y los de los vehículos donde ya estuvo.
  const recorridosT = Math.max(0, Math.round(m.km - t.kmInicial)) + kmEnTramos(t.historial);
  const quitar = (v: VehiculoEnJuego, numero: number) => {
    v.cubiertas = v.cubiertas.filter((c) => c.numero !== numero);
  };
  const poner = (v: VehiculoEnJuego, c: Cubierta) => {
    v.cubiertas = [...v.cubiertas.filter((x) => x.numero !== c.numero), c].sort((a, b) => a.numero - b.numero);
    delete v.vacias[c.numero];
  };

  const aBaja = (c: Cubierta, patente: string, uid: string, cerrado: Tramo[], km: number, motivo: MotivoDeBaja, obs: string) => {
    bajas = [
      {
        uid,
        codigo: c.codigo,
        modeloId: c.modeloId,
        fecha: m.fecha,
        patente,
        posicion: c.numero,
        km,
        motivo: TEXTO_DE_BAJA[motivo],
        obs,
        historial: cerrado,
        balanceos: c.balanceos,
      },
      ...bajas,
    ];
  };
  const aStock = (c: Cubierta, patente: string, uid: string, cerrado: Tramo[], km: number, obs: string) => {
    stock = [
      {
        uid,
        codigo: c.codigo ?? "",
        modeloId: c.modeloId,
        estado: "usada",
        obs: `Salió de ${patente} posición ${c.numero} el ${dd_mm(m.fecha)} · con ${km.toLocaleString("es-UY")} km${obs ? ` · ${obs}` : ""}`,
        desde: m.fecha,
        historial: cerrado,
        balanceos: c.balanceos,
      },
      ...stock,
    ];
  };

  // El historial de la posición de origen: la que sale queda de "puesta anterior".
  let histOrigen: PuestaAnterior[] = [];
  let origenQuedaLibre = true;

  quitar(origen, m.posicion);

  if (m.destino.tipo === "baja") {
    histOrigen = [puestaAnterior(t, m.fecha, m.km, conObs(TEXTO_DE_BAJA[m.destino.motivo])), ...t.anteriores];
    aBaja(t, m.patente, tUid, cerradoT, recorridosT, m.destino.motivo, extra);
  } else if (m.destino.tipo === "stock") {
    histOrigen = [puestaAnterior(t, m.fecha, m.km, conObs("Cambio para guardarla en el stock de usadas")), ...t.anteriores];
    aStock(t, m.patente, tUid, cerradoT, recorridosT, extra);
  } else {
    const { patente: pDestino, posicion: qDestino } = m.destino;
    if (pDestino === m.patente && qDestino === m.posicion) return antes;
    const mismo = pDestino === m.patente;
    const destino = mismo ? origen : vehiculo(pDestino);
    const kmDestino = mismo ? m.km : destino.km;
    const d = destino.cubiertas.find((c) => c.numero === qDestino);
    const textoDelMovimiento = mismo
      ? `Movida a la posición ${qDestino}`
      : `Movida a la posición ${qDestino} de ${pDestino}`;
    histOrigen = [puestaAnterior(t, m.fecha, m.km, conObs(textoDelMovimiento)), ...t.anteriores];

    let histDestino: PuestaAnterior[] = destino.vacias[qDestino] ?? [];
    if (d) {
      const dUid = uidDeCubierta(pDestino, d);
      const cerradoD = [...(d.historial ?? []), tramoDeVehiculo(d, pDestino, m.fecha, kmDestino)];
      const recorridosD = Math.max(0, Math.round(kmDestino - d.kmInicial)) + kmEnTramos(d.historial);
      const queHacer = m.destino.ocupada ?? { tipo: "intercambio" as const };
      const textoDeD = queHacer.tipo === "intercambio" ? `Pasó a la posición ${m.posicion}${mismo ? "" : ` de ${m.patente}`}` : queHacer.tipo === "stock" ? "Cambio para guardarla en el stock de usadas" : TEXTO_DE_BAJA[queHacer.motivo];
      histDestino = [puestaAnterior(d, m.fecha, kmDestino, conObs(textoDeD)), ...d.anteriores];
      quitar(destino, qDestino);
      if (queHacer.tipo === "intercambio") {
        // La que estaba ocupa el lugar que quedó libre.
        poner(origen, { ...d, numero: m.posicion, fecha: m.fecha, kmInicial: m.km, anteriores: histOrigen, historial: cerradoD, uid: dUid });
        origenQuedaLibre = false;
      } else if (queHacer.tipo === "stock") {
        aStock(d, pDestino, dUid, cerradoD, recorridosD, extra);
      } else {
        aBaja(d, pDestino, dUid, cerradoD, recorridosD, queHacer.motivo, extra);
      }
    }
    poner(destino, { ...t, numero: qDestino, fecha: m.fecha, kmInicial: kmDestino, anteriores: histDestino, historial: cerradoT, uid: tUid });
  }

  if (origenQuedaLibre) {
    const r = armarReemplazo(m.reemplazo ?? { tipo: "vacia" }, stock, m.posicion, m.fecha, m.km, histOrigen, nuevoUid);
    stock = r.stock;
    if (r.cubierta) poner(origen, r.cubierta);
    else origen.vacias[m.posicion] = histOrigen;
  }
  return { flota, stock, bajas };
}

// ── El recorrido de una cubierta ──
export interface LineaDeRecorrido {
  /** "GTP 4325 pos. 3" */
  donde: string;
  /** "del 10/01/2026 al 05/10/2026", "desde el 05/10/2026" */
  cuando: string;
  km?: number;
  /** El tramo en el que está hoy. */
  actual?: boolean;
}

/** Dónde está hoy una cubierta (el tramo abierto): en un vehículo, en el stock o de baja. */
export type UbicacionActual =
  | { tipo: "vehiculo"; patente: string; posicion: number; desde: string; kmDesde: number; kmActual: number }
  | { tipo: "stock"; desde?: string; nueva: boolean }
  | { tipo: "baja"; fecha: string; motivo: string };

export interface RecorridoDeCubierta {
  lineas: LineaDeRecorrido[];
  /** Los balanceos que se le hicieron, con su fecha. */
  balanceos: Balanceo[];
  /** La suma de los km de todos los tramos en vehículos (cada uno contra el tacógrafo de ese vehículo). */
  totalKm: number;
}

/** Arma el recorrido: los tramos cerrados, en orden, y el tramo de hoy. El total es la suma de los tramos. */
export function recorridoDeCubierta(historial: Tramo[], actual: UbicacionActual, fmt: (dia: string) => string, balanceos: Balanceo[] = []): RecorridoDeCubierta {
  const lineas: LineaDeRecorrido[] = [];
  let totalKm = 0;
  for (const t of historial) {
    if (t.tipo === "vehiculo") {
      const km = Math.max(0, Math.round(t.kmHasta - t.kmDesde));
      totalKm += km;
      lineas.push({ donde: `${t.patente} pos. ${t.posicion}`, cuando: `del ${fmt(t.desde)} al ${fmt(t.hasta)}`, km });
    } else {
      lineas.push({ donde: "Stock de usadas", cuando: t.desde ? `del ${fmt(t.desde)} al ${fmt(t.hasta)}` : `hasta el ${fmt(t.hasta)}` });
    }
  }
  if (actual.tipo === "vehiculo") {
    const km = Math.max(0, Math.round(actual.kmActual - actual.kmDesde));
    totalKm += km;
    lineas.push({ donde: `${actual.patente} pos. ${actual.posicion}`, cuando: `desde el ${fmt(actual.desde)}`, km, actual: true });
  } else if (actual.tipo === "stock") {
    lineas.push({
      donde: actual.nueva ? "Stock de nuevas" : "Stock de usadas",
      cuando: actual.desde ? `desde el ${fmt(actual.desde)}` : actual.nueva ? "sin uso" : "",
      actual: true,
    });
  } else {
    lineas.push({ donde: "De baja", cuando: `el ${fmt(actual.fecha)}: ${actual.motivo}`, actual: true });
  }
  return { lineas, totalKm, balanceos };
}
