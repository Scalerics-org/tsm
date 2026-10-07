import { HOY, MODELOS } from "./base";
import type { Balanceo, Componente, CondicionPieza, Estado, PiezaDeComponente, Tramo, TipoVehiculo, Vehiculo } from "./tipos";

/**
 * DATOS DE MENTIRA, segunda parte: los componentes (motor, caja…), las piezas de cada rueda (frenos y rodaje) y
 * el stock. Todo sale de cuentas determinísticas sobre los km del vehículo, así no cambia entre una carga y otra.
 */

/** Un número entre 0 y 1 que depende sólo del texto: el mismo texto da siempre el mismo número. */
function azar(semilla: string): number {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function sumarDias(dia: string, dias: number): string {
  const f = new Date(`${dia}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + Math.round(dias));
  return f.toISOString().slice(0, 10);
}

// ── Componentes ──
const PLANTILLA: Record<string, { nombre: string; piezas: string[] }> = {
  motor: { nombre: "Motor", piezas: ["Alternador", "Arranque", "Correas", "Radiadores", "Otros"] },
  caja: { nombre: "Caja de cambios", piezas: ["Prensa y disco", "Otros"] },
  diferencial: { nombre: "Diferencial", piezas: ["Otros"] },
  chasis: { nombre: "Chasis", piezas: ["Cabina", "Ejes", "Barras de dirección", "Chasis", "Carrocería", "Otros"] },
  electricidad: { nombre: "Electricidad", piezas: ["Instalación general"] },
};

/** Qué componentes lleva cada tipo de vehículo. */
const COMPONENTES_DE: Record<TipoVehiculo, string[]> = {
  camion: ["motor", "caja", "diferencial", "chasis", "electricidad"],
  semirremolque: ["chasis", "electricidad"],
  acoplado: ["chasis", "electricidad"],
  montacargas: ["motor", "caja", "chasis", "electricidad"],
};

/** Los componentes de un vehículo real, sin historia: todo original hasta que el taller cargue lo contrario. */
export function componentesSinHistoria(tipo: TipoVehiculo): Componente[] {
  return COMPONENTES_DE[tipo].map((id) => ({
    id,
    nombre: PLANTILLA[id].nombre,
    piezas: PLANTILLA[id].piezas.map((nombre) => ({ nombre, condicion: "original" as CondicionPieza, alKm: 0, fecha: "", obs: "" })),
    obs: "",
  }));
}

const OBS_PIEZA = [
  "",
  "",
  "Se cambió por desgaste.",
  "Reparado en el taller de la calle.",
  "Repuesto original.",
  "",
  "Quedó pendiente revisar.",
];

export function componentesDe(v: Pick<Vehiculo, "patente" | "tipo" | "km" | "kmPorDia">): Componente[] {
  return COMPONENTES_DE[v.tipo].map((id) => {
    const molde = PLANTILLA[id];
    const piezas: PiezaDeComponente[] = molde.piezas.map((nombre, i) => {
      const r = azar(`${v.patente}-${id}-${i}`);
      const condicion: CondicionPieza = r < 0.4 ? "original" : r < 0.72 ? "reparado" : "nuevo";
      const alKm = condicion === "original" ? 0 : Math.round((v.km * (0.25 + 0.7 * azar(`${v.patente}-${id}-${i}-km`))) / 100) * 100;
      return {
        nombre,
        condicion,
        alKm,
        fecha: condicion === "original" ? "" : sumarDias(HOY, -(v.km - alKm) / v.kmPorDia),
        obs: condicion === "original" ? "" : OBS_PIEZA[Math.floor(azar(`${v.patente}-${id}-${i}-o`) * OBS_PIEZA.length)],
      };
    });
    return {
      id,
      nombre: molde.nombre,
      piezas,
      obs: id === "electricidad" ? "Luces traseras con falso contacto, se revisa en el próximo service." : "",
    };
  });
}

// ── Piezas de cada rueda: frenos y rodaje ──
export type GrupoDePieza = "rueda" | "freno" | "rodaje";

export interface PiezaDeRueda {
  id: string;
  grupo: GrupoDePieza;
  nombre: string;
  estado: Estado;
  /** Una medida que se controla con calibre, si la pieza la tiene. */
  medida?: { valor: number; limite: number; sentido: "min" | "max"; unidad: string };
  /** Hace cuántos km (o horas) se la cambió o revisó. */
  kmDesde: number;
  fecha: string;
  obs: string;
}

/** Las piezas del despiece de 21.jpg, más las que pide el Excel (bujes, retén, grasa). */
export const PIEZAS_DE_RUEDA: { id: string; grupo: GrupoDePieza; nombre: string; medida?: PiezaDeRueda["medida"]; vida: number }[] = [
  { id: "llanta", grupo: "rueda", nombre: "Llanta", vida: 400_000 },
  { id: "disco", grupo: "rueda", nombre: "Disco de rueda", vida: 400_000 },
  { id: "bulones", grupo: "rueda", nombre: "Bulones y tuercas", vida: 200_000 },
  { id: "tambor", grupo: "freno", nombre: "Tambor (campana)", medida: { valor: 0, limite: 422, sentido: "max", unidad: "mm" }, vida: 300_000 },
  { id: "zapatas", grupo: "freno", nombre: "Zapatas / cintas", medida: { valor: 0, limite: 5, sentido: "min", unidad: "mm" }, vida: 120_000 },
  { id: "leva", grupo: "freno", nombre: "Leva S", vida: 250_000 },
  { id: "bujes", grupo: "freno", nombre: "Bujes", vida: 150_000 },
  { id: "matraca", grupo: "freno", nombre: "Matraca", vida: 200_000 },
  { id: "pulmon", grupo: "freno", nombre: "Pulmón de freno", vida: 250_000 },
  { id: "maza", grupo: "rodaje", nombre: "Maza", vida: 500_000 },
  { id: "rulemanes", grupo: "rodaje", nombre: "Rulemanes", vida: 250_000 },
  { id: "reten", grupo: "rodaje", nombre: "Retén", vida: 150_000 },
  { id: "tapa", grupo: "rodaje", nombre: "Tapa de maza", vida: 300_000 },
  { id: "punta", grupo: "rodaje", nombre: "Punta de eje", vida: 500_000 },
  { id: "grasa", grupo: "rodaje", nombre: "Grasa", vida: 60_000 },
  { id: "eje", grupo: "rodaje", nombre: "Eje", vida: 600_000 },
];

const OBS_RUEDA: Record<string, string> = {
  reten: "Transpira un poco de grasa.",
  rulemanes: "Con juego, mirar en el próximo service.",
  zapatas: "",
  tambor: "Rayado, se rectificó.",
};

/** El estado de una pieza según cuánto de su vida útil (de ejemplo) lleva. */
const estadoPorUso = (uso: number): Estado => (uso >= 0.9 ? "rojo" : uso >= 0.7 ? "ambar" : "verde");

export function piezasDeRueda(v: Pick<Vehiculo, "patente" | "km" | "kmPorDia">, numero: number): PiezaDeRueda[] {
  return PIEZAS_DE_RUEDA.map((p) => {
    const uso = 0.12 + 0.95 * azar(`${v.patente}-${numero}-${p.id}`);
    const kmDesde = Math.min(v.km, Math.round((p.vida * uso) / 100) * 100);
    let medida: PiezaDeRueda["medida"];
    let estado = estadoPorUso(uso);
    if (p.medida) {
      // Zapatas: 18 mm nuevas, 5 de mínimo. Tambor: 420 mm nominal, 422 de máximo.
      const valor =
        p.medida.sentido === "min" ? Math.round((18 - 13.4 * Math.min(1, uso)) * 10) / 10 : Math.round((420 + 2.4 * Math.min(1, uso)) * 10) / 10;
      medida = { ...p.medida, valor };
      const pasado = p.medida.sentido === "min" ? valor <= p.medida.limite : valor >= p.medida.limite;
      const cerca = p.medida.sentido === "min" ? valor <= p.medida.limite + 3 : valor >= p.medida.limite - 0.6;
      estado = pasado ? "rojo" : cerca ? "ambar" : "verde";
    }
    return {
      id: p.id,
      grupo: p.grupo,
      nombre: p.nombre,
      estado,
      medida,
      kmDesde,
      fecha: sumarDias(HOY, -kmDesde / v.kmPorDia),
      obs: estado === "verde" ? "" : (OBS_RUEDA[p.id] ?? ""),
    };
  });
}

// ── Stock ──
export interface CubiertaEnStock {
  /** Id interno (las de ejemplo usan su código). */
  uid?: string;
  /** Puede quedar vacío: una cubierta sin código igual está en el stock y tiene su historial. */
  codigo: string;
  modeloId: string;
  estado: "nueva" | "usada";
  obs: string;
  /** Desde cuándo está en el stock. */
  desde?: string;
  /** Dónde estuvo antes. */
  historial?: Tramo[];
  /** Los balanceos que se le hicieron. */
  balanceos?: Balanceo[];
}

export const CUBIERTAS_EN_STOCK: CubiertaEnStock[] = [
  { codigo: "N-0101", modeloId: "r269", estado: "nueva", obs: "" },
  { codigo: "N-0102", modeloId: "r269", estado: "nueva", obs: "" },
  { codigo: "N-0103", modeloId: "multi", estado: "nueva", obs: "" },
  { codigo: "N-0104", modeloId: "multi", estado: "nueva", obs: "" },
  { codigo: "N-0105", modeloId: "multi", estado: "nueva", obs: "Llegó con un golpe en el costado, reclamar." },
  { codigo: "N-0106", modeloId: "fr85", estado: "nueva", obs: "" },
  { codigo: "N-0107", modeloId: "kmax", estado: "nueva", obs: "" },
  { codigo: "N-0108", modeloId: "kmax", estado: "nueva", obs: "" },
  { codigo: "U-0211", modeloId: "multi", estado: "usada", obs: "Salió de GTP 4383 con 71.000 km. Sirve para acoplado." },
  { codigo: "U-0212", modeloId: "multi", estado: "usada", obs: "Salió de GTP 4383 con 69.500 km." },
  { codigo: "U-0213", modeloId: "r269", estado: "usada", obs: "Para reencauchar." },
  { codigo: "U-0214", modeloId: "fr85", estado: "usada", obs: "Con 38.000 km, se sacó por un pinchazo." },
  { codigo: "U-0215", modeloId: "kmax", estado: "usada", obs: "Para reencauchar." },
  { codigo: "U-0216", modeloId: "r269", estado: "usada", obs: "Con 52.000 km, de auxilio." },
];

export const ACEITE = {
  /** Lo que hay en el tambor. */
  cantidadL: 200,
  /** Lo que se consumió en el mes. */
  consumoL: 50,
  /** Lo que lleva el contenedor del tanque. */
  contenidoTanqueL: 5,
};

export const FILTROS: { modelo: string; para: string; cantidad: number }[] = [
  { modelo: "HF607", para: "Hidráulico", cantidad: 5 },
  { modelo: "LF3000", para: "Aceite de motor", cantidad: 3 },
  { modelo: "FF5052", para: "Combustible", cantidad: 6 },
  { modelo: "AF25550", para: "Aire", cantidad: 2 },
];

export const nombreDelModelo = (id: string) => MODELOS[id]?.nombre ?? id;
