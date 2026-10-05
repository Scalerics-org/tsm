import { ACOPLADO, CAMION, SEMIRREMOLQUE } from "./disposicion";
import {
  CICLO,
  type Cubierta,
  type PuestaAnterior,
  type Service,
  type Vehiculo,
} from "./tipos";

/**
 * DATOS DE MENTIRA para la maqueta. Nada de esto sale de la base ni se guarda: las patentes son las de la
 * flota, pero los kilómetros, las cubiertas, los services y los nombres son inventados para que se vea cómo
 * queda la pantalla.
 */

export { HOY, MODELOS } from "./base";
import { HOY } from "./base";
import { componentesDe } from "./datos-extra";

const CHOFERES = ["Carlos Pereira", "Julio Techera", "Marcelo Núñez", "Darío Silva", "Walter Rocha"];
const MECANICO = "Raúl";
const OBS_SERVICE = [
  "Sin novedades.",
  "Se cambió también la correa del alternador.",
  "Perdía un poco de aceite por la tapa de válvulas; se ajustó.",
  "Filtro de aire muy sucio, se cambió antes de tiempo.",
  "Quedó pendiente revisar el sistema de frenos.",
  "Todo en orden. Se rellenó el líquido refrigerante.",
];
const OBS_CUBIERTA: Record<number, string> = {
  1: "Desgaste parejo.",
  4: "Parche chico en el hombro, vigilar.",
  7: "Reencauchada una vez.",
};
const MOTIVOS = ["Desgaste", "Pinchadura sin arreglo", "Rotación a otro eje", "Desgaste", "Reventón en ruta"];

/** Suma días (negativos para atrás) a un día AAAA-MM-DD. */
function sumarDias(dia: string, dias: number): string {
  const f = new Date(`${dia}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + Math.round(dias));
  return f.toISOString().slice(0, 10);
}

let secuencia = 400;
const nuevoCodigo = () => `TSM-${String(++secuencia).padStart(4, "0")}`;

interface Plano {
  patente: string;
  descripcion: string;
  km: number;
  kmPorDia: number;
  /** Cuántos km lleva cada cubierta, en orden de posición. */
  recorridos: number[];
  /** Modelo de la dirección, del eje trasero 1 y del trasero 2 (o del eje 1 y 2 del semirremolque). */
  modelos: [string, string?, string?];
  /** Km del último service (los anteriores salen de ahí hacia atrás). */
  ultimoService?: number;
  /** Cada cuánto toca un service. Por defecto 15.000 km. */
  cadaService?: number;
}

const CADA_SERVICE_KM = 15_000;

function cubiertasDe(p: Plano, porEje: (i: number) => string): Cubierta[] {
  return p.recorridos.map((rec, i) => {
    const numero = i + 1;
    const fecha = sumarDias(HOY, -rec / p.kmPorDia);
    const anteriores: PuestaAnterior[] = [];
    let hasta = fecha;
    const cuantas = i % 3 === 2 ? 0 : (i % 3) + 1;
    for (let k = 0; k < cuantas; k++) {
      const km = 68_000 + ((i * 7919 + k * 13_331) % 34_000);
      const desde = sumarDias(hasta, -km / p.kmPorDia);
      anteriores.push({
        codigo: nuevoCodigo(),
        modeloId: porEje(i),
        desde,
        hasta,
        kmRecorridos: Math.round(km / 10) * 10,
        motivo: MOTIVOS[(i + k) % MOTIVOS.length],
      });
      hasta = desde;
    }
    return {
      numero,
      codigo: nuevoCodigo(),
      modeloId: porEje(i),
      fecha,
      kmInicial: p.km - rec,
      obs: OBS_CUBIERTA[numero] ?? "",
      anteriores,
    };
  });
}

function servicesDe(p: Plano, cuantos: number): Service[] {
  if (p.ultimoService == null) return [];
  const lista: Service[] = [];
  for (let k = 0; k < cuantos; k++) {
    const cada = p.cadaService ?? CADA_SERVICE_KM;
    const km = p.ultimoService - k * cada;
    if (km <= 0) break;
    const orden = Math.round(km / cada);
    lista.push({
      tipo: CICLO[(orden - 1) % CICLO.length],
      fecha: sumarDias(HOY, -((p.km - km) / p.kmPorDia)),
      km,
      chofer: CHOFERES[(orden * 3 + k) % CHOFERES.length],
      mecanico: MECANICO,
      obs: OBS_SERVICE[(orden * 5 + 2) % OBS_SERVICE.length],
    });
  }
  return lista;
}

const base = (p: Plano) => ({
  patente: p.patente,
  descripcion: p.descripcion,
  km: p.km,
  kmPorDia: p.kmPorDia,
  cadaService: p.cadaService ?? CADA_SERVICE_KM,
});

const camion = (p: Plano): Vehiculo => ({
  ...base(p),
  tipo: "camion",
  disposicion: CAMION,
  unidad: "km",
  // 0 y 1: dirección; 2 a 5: eje trasero 1; 6 a 9: eje trasero 2.
  cubiertas: cubiertasDe(p, (i) => (i < 2 ? p.modelos[0] : i < 6 ? p.modelos[1] ?? p.modelos[0] : (p.modelos[2] ?? p.modelos[1] ?? p.modelos[0]))),
  services: servicesDe(p, 6),
  componentes: componentesDe({ ...base(p), tipo: "camion" }),
});

const semirremolque = (p: Plano): Vehiculo => ({
  ...base(p),
  tipo: "semirremolque",
  disposicion: SEMIRREMOLQUE,
  unidad: "km",
  cubiertas: cubiertasDe(p, (i) => (i < 4 ? p.modelos[0] : (p.modelos[1] ?? p.modelos[0]))),
  services: [],
  componentes: componentesDe({ ...base(p), tipo: "semirremolque" }),
});

const acoplado = (p: Plano): Vehiculo => ({
  ...base(p),
  tipo: "acoplado",
  disposicion: ACOPLADO,
  unidad: "km",
  cubiertas: cubiertasDe(p, () => p.modelos[0]),
  services: [],
  componentes: componentesDe({ ...base(p), tipo: "acoplado" }),
});

/** El montacargas no tiene odómetro: cuenta horas de uso. Sin cubiertas en esta maqueta. */
const montacargas = (p: Plano): Vehiculo => ({
  ...base(p),
  tipo: "montacargas",
  disposicion: null,
  unidad: "h",
  cubiertas: [],
  services: servicesDe(p, 6),
  componentes: componentesDe({ ...base(p), tipo: "montacargas" }),
});

export const VEHICULOS: Vehiculo[] = [
  camion({
    patente: "GTP 4325",
    descripcion: "Scania P 410 · 6x2 · 2014",
    km: 151_273,
    kmPorDia: 330,
    recorridos: [64_200, 71_800, 96_800, 88_400, 52_300, 52_300, 91_700, 103_500, 38_000, 38_000],
    modelos: ["r269", "multi", "multi"],
    ultimoService: 150_000,
  }),
  camion({
    patente: "GTP 4238",
    descripcion: "Scania R 450 · 6x4 · 2016",
    km: 284_910,
    kmPorDia: 410,
    recorridos: [41_000, 44_500, 58_200, 59_900, 61_300, 57_800, 72_400, 74_100, 71_000, 73_600],
    modelos: ["r269", "fr85", "fr85"],
    ultimoService: 285_000 - 15_000 + 3_000,
  }),
  camion({
    patente: "GTP 4267",
    descripcion: "Volvo FH 460 · 6x4 · 2017",
    km: 198_540,
    kmPorDia: 380,
    recorridos: [78_600, 80_100, 22_400, 21_900, 23_100, 22_800, 36_500, 35_900, 37_200, 36_100],
    modelos: ["multi", "kmax", "kmax"],
    ultimoService: 195_000,
  }),
  camion({
    patente: "GTP 4326",
    descripcion: "Scania P 410 · 6x2 · 2014",
    km: 176_020,
    kmPorDia: 300,
    recorridos: [93_400, 94_200, 91_800, 95_600, 82_700, 84_100, 69_200, 70_800, 66_500, 68_300],
    modelos: ["r269", "multi", "fr85"],
    ultimoService: 165_000,
  }),
  camion({
    patente: "GTP 4382",
    descripcion: "Mercedes-Benz Actros 2646 · 6x4 · 2019",
    km: 112_760,
    kmPorDia: 360,
    recorridos: [30_100, 29_700, 49_800, 51_200, 50_400, 48_900, 49_600, 50_100, 48_700, 51_900],
    modelos: ["kmax", "kmax", "kmax"],
    ultimoService: 105_000,
  }),
  camion({
    patente: "GTP 4383",
    descripcion: "Mercedes-Benz Actros 2646 · 6x4 · 2019",
    km: 118_395,
    kmPorDia: 365,
    recorridos: [85_300, 86_700, 32_400, 33_100, 31_900, 32_800, 97_900, 99_400, 96_300, 98_700],
    modelos: ["r269", "multi", "multi"],
    ultimoService: 105_000,
  }),
  camion({
    patente: "GTP 4384",
    descripcion: "Iveco Stralis 480 · 6x2 · 2018",
    km: 241_880,
    kmPorDia: 395,
    recorridos: [54_000, 55_500, 61_800, 63_400, 60_900, 62_700, 66_100, 67_800, 65_200, 66_900],
    modelos: ["r269", "fr85", "fr85"],
    ultimoService: 240_000,
  }),
  camion({
    patente: "GTP 4413",
    descripcion: "Volvo FH 540 · 6x4 · 2021",
    km: 74_650,
    kmPorDia: 420,
    recorridos: [74_650, 74_650, 18_200, 18_200, 18_700, 18_700, 18_900, 18_900, 19_100, 19_100],
    modelos: ["multi", "multi", "multi"],
    ultimoService: 60_000,
  }),
  semirremolque({
    patente: "SR 1204",
    descripcion: "Semirremolque furgón · 2 ejes (ejemplo)",
    km: 212_480,
    kmPorDia: 350,
    recorridos: [48_300, 47_900, 52_600, 54_100, 61_700, 63_200, 59_800, 62_400],
    modelos: ["fr85", "kmax"],
  }),
  acoplado({
    patente: "AC 0307",
    descripcion: "Acoplado con lanza · 2 ejes (ejemplo)",
    km: 168_300,
    kmPorDia: 300,
    recorridos: [39_800, 41_200, 58_700, 60_100],
    modelos: ["kmax"],
  }),
  montacargas({
    patente: "Montacargas 1",
    descripcion: "Montacargas de patio · horas de uso (ejemplo)",
    km: 3_420,
    kmPorDia: 7,
    cadaService: 250,
    recorridos: [],
    modelos: ["kmax"],
    ultimoService: 3_250,
  }),
];

const sinSeparadores = (s: string) => s.replace(/[\s-]/g, "").toLowerCase();
export const vehiculoDe = (patente: string | undefined): Vehiculo | undefined =>
  VEHICULOS.find((v) => sinSeparadores(v.patente) === sinSeparadores(patente ?? ""));

/** La patente como va en la dirección: "GTP-4325". */
export const enLaDireccion = (patente: string) => patente.replace(/\s+/g, "-");
