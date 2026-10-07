import { tipoDeVehiculo } from "./disposicion";
import { TIPOS_DE_LOS_EJEMPLOS, itemsDeService } from "./servicio";
import { flujoDeCubiertas } from "./tipos-de-service";
import {
  type Cubierta,
  type PuestaAnterior,
  type ItemHecho,
  type Service,
  type TipoService,
  type TipoVehiculo,
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
  /** De cuándo es la lectura del tacógrafo de la que salen los km. */
  lectura: string;
  kmPorDia: number;
  /** El tipo de vehículo (sus ejes), como se elige en la ficha. */
  tipoId?: string;
  /** El chofer que anda en el camión hoy. */
  choferAsignado?: string;
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
      uid: `${p.patente.replace(/\s+/g, "")}-p${numero}-${fecha}`,
      numero,
      // El código es libre y opcional: algunas cubiertas todavía no lo tienen.
      codigo: i % 4 === 3 ? undefined : nuevoCodigo(),
      modeloId: porEje(i),
      fecha,
      kmInicial: p.km - rec,
      obs: OBS_CUBIERTA[numero] ?? "",
      anteriores,
    };
  });
}

/** Reparaciones puestas a mano en los services de GTP 4325, para que la búsqueda tenga qué encontrar. */
const FIJOS_4325: Record<number, ItemHecho[]> = {
  5: [
    { seccion: "Motor", sujeto: "", pieza: "Alternador", accion: "reparado", obs: "Rebobinado en el taller de la calle." },
    { seccion: "Frenos y rodaje, por rueda", sujeto: "Rueda 4", pieza: "Zapatas / cintas", accion: "nuevo", medida: "18 mm", obs: "" },
  ],
  3: [
    { seccion: "Cubiertas", sujeto: "Posición 7", pieza: "Cubierta 7", accion: "nuevo", obs: "Cambio por desgaste. Michelin X Multi Z." },
    { seccion: "Frenos y rodaje, por rueda", sujeto: "Rueda 7", pieza: "Rulemanes", accion: "nuevo", obs: "" },
  ],
  6: [{ seccion: "Frenos y rodaje, por rueda", sujeto: "Rueda 4", pieza: "Zapatas / cintas", accion: "revisado", medida: "9,5 mm", obs: "Todavía sirven." }],
  4: [{ seccion: "Motor", sujeto: "", pieza: "Alternador", accion: "reparado", obs: "Cambio de carbones." }],
};

function servicesDe(p: Plano, cuantos: number, disposicion: ReturnType<typeof tipoDeVehiculo> | null): Service[] {
  if (p.ultimoService == null) return [];
  const lista: Service[] = [];
  for (let k = 0; k < cuantos; k++) {
    const cada = disposicion?.intervaloServiceKm ?? p.cadaService ?? CADA_SERVICE_KM;
    const km = p.ultimoService - k * cada;
    if (km <= 0) break;
    const orden = Math.round(km / cada);
    // Los tipos de los services de ejemplo (no es un ciclo real). Un vehículo sin cubiertas no tiene tipos de cubiertas.
    const deEjemplo = TIPOS_DE_LOS_EJEMPLOS[(orden - 1) % TIPOS_DE_LOS_EJEMPLOS.length];
    const conCubiertas = disposicion != null;
    const tipos: TipoService[] = conCubiertas ? deEjemplo : deEjemplo.filter((t) => !flujoDeCubiertas([t]).rotacion && !flujoDeCubiertas([t]).nueva);
    const tiposFinales: TipoService[] = tipos.length > 0 ? tipos : ["A"];
    lista.push({
      id: `${p.patente.replace(/\s+/g, "")}-${orden}`,
      tipos: tiposFinales,
      fecha: sumarDias(HOY, -((p.km - km) / p.kmPorDia)),
      km,
      chofer: CHOFERES[(orden * 3 + k) % CHOFERES.length],
      mecanico: MECANICO,
      obs: OBS_SERVICE[(orden * 5 + 2) % OBS_SERVICE.length],
      items: itemsDeService({ patente: p.patente, disposicion }, tiposFinales, orden, p.patente === "GTP 4325" ? FIJOS_4325[orden] : undefined),
    });
  }
  return lista;
}

const base = (p: Plano, cadaService: number | null) => ({
  patente: p.patente,
  descripcion: p.descripcion,
  km: p.km,
  lectura: p.lectura,
  kmPorDia: p.kmPorDia,
  cadaService,
  choferAsignado: p.choferAsignado ?? CHOFERES[0],
});

/** Camión (rígido o tractor): su tipo dice los ejes; los modelos van por eje, de la dirección hacia atrás. */
const camion = (p: Plano): Vehiculo => {
  const disposicion = tipoDeVehiculo(p.tipoId ?? "tractor");
  const ultimoTrasero = disposicion.ejes.length - 1;
  const ejeDe = (i: number) => {
    // Posiciones 0 y 1 son la dirección; de ahí, cuatro por eje trasero.
    if (i < 2) return 0;
    return Math.min(ultimoTrasero, 1 + Math.floor((i - 2) / 4));
  };
  return {
    ...base(p, disposicion.intervaloServiceKm),
    tipo: "camion",
    disposicion,
    unidad: "km",
    cubiertas: cubiertasDe(p, (i) => (ejeDe(i) === 0 ? p.modelos[0] : ejeDe(i) === 1 ? (p.modelos[1] ?? p.modelos[0]) : (p.modelos[2] ?? p.modelos[1] ?? p.modelos[0]))),
    services: servicesDe(p, 6, disposicion),
    componentes: componentesDe({ ...base(p, disposicion.intervaloServiceKm), tipo: "camion" }),
  };
};

const remolque = (tipo: TipoVehiculo, p: Plano, tipoDefault: string): Vehiculo => ({
  ...base(p, null),
  tipo,
  disposicion: tipoDeVehiculo(p.tipoId ?? tipoDefault),
  unidad: "km",
  cubiertas: cubiertasDe(p, (i) => (i < 4 ? p.modelos[0] : (p.modelos[1] ?? p.modelos[0]))),
  services: [],
  componentes: componentesDe({ ...base(p, null), tipo }),
});
const semirremolque = (p: Plano) => remolque("semirremolque", p, "remolque-2");
const acoplado = (p: Plano) => remolque("acoplado", p, "sorra-sencilla");

/** El montacargas no tiene tacógrafo: cuenta horas de uso. Sin cubiertas en esta maqueta. */
const montacargas = (p: Plano): Vehiculo => ({
  ...base(p, p.cadaService ?? 250),
  tipo: "montacargas",
  disposicion: null,
  unidad: "h",
  cubiertas: [],
  services: servicesDe(p, 6, null),
  componentes: componentesDe({ ...base(p, p.cadaService ?? 250), tipo: "montacargas" }),
});

export const VEHICULOS: Vehiculo[] = [
  camion({
    patente: "GTP 4325",
    descripcion: "Scania P 410 · 2014",
    tipoId: "tractor",
    km: 151_273,
    lectura: "2026-09-30",
    choferAsignado: "Carlos Pereira",
    kmPorDia: 330,
    recorridos: [64_200, 71_800, 96_800, 88_400, 52_300, 52_300, 91_700, 103_500, 38_000, 38_000],
    modelos: ["r269", "multi", "multi"],
    ultimoService: 150_000,
  }),
  camion({
    patente: "GTP 4238",
    descripcion: "Scania R 450 · 2016",
    tipoId: "doble-eje",
    km: 284_910,
    lectura: "2026-09-29",
    choferAsignado: "Julio Techera",
    kmPorDia: 410,
    recorridos: [41_000, 44_500, 58_200, 59_900, 61_300, 57_800, 72_400, 74_100, 71_000, 73_600],
    modelos: ["r269", "fr85", "fr85"],
    ultimoService: 275_000,
  }),
  camion({
    patente: "GTP 4267",
    descripcion: "Volvo FH 460 · 2017",
    tipoId: "tractor-sencillo",
    km: 198_540,
    lectura: "2026-09-30",
    choferAsignado: "Marcelo Núñez",
    kmPorDia: 380,
    recorridos: [78_600, 80_100, 22_400, 21_900, 23_100, 22_800],
    modelos: ["multi", "kmax"],
    ultimoService: 175_000,
  }),
  camion({
    patente: "GTP 4326",
    descripcion: "Scania P 410 · 2014",
    tipoId: "camion-chico",
    km: 176_020,
    lectura: "2026-09-28",
    choferAsignado: "Darío Silva",
    kmPorDia: 300,
    recorridos: [93_400, 94_200, 91_800, 95_600, 82_700, 84_100],
    modelos: ["r269", "multi"],
    ultimoService: 165_000,
  }),
  camion({
    patente: "GTP 4382",
    descripcion: "Mercedes-Benz Actros 2646 · 2019",
    tipoId: "tractor",
    km: 112_760,
    lectura: "2026-09-30",
    choferAsignado: "Walter Rocha",
    kmPorDia: 360,
    recorridos: [30_100, 29_700, 49_800, 51_200, 50_400, 48_900, 49_600, 50_100, 48_700, 51_900],
    modelos: ["kmax", "kmax", "kmax"],
    ultimoService: 100_000,
  }),
  camion({
    patente: "GTP 4383",
    descripcion: "Mercedes-Benz Actros 2646 · 2019",
    tipoId: "tractor",
    km: 118_395,
    lectura: "2026-09-27",
    choferAsignado: "Carlos Pereira",
    kmPorDia: 365,
    recorridos: [85_300, 86_700, 32_400, 33_100, 31_900, 32_800, 97_900, 99_400, 96_300, 98_700],
    modelos: ["r269", "multi", "multi"],
    ultimoService: 100_000,
  }),
  camion({
    patente: "GTP 4384",
    descripcion: "Iveco Stralis 480 · 2018",
    tipoId: "tractor",
    km: 241_880,
    lectura: "2026-09-30",
    choferAsignado: "Julio Techera",
    kmPorDia: 395,
    recorridos: [54_000, 55_500, 61_800, 63_400, 60_900, 62_700, 66_100, 67_800, 65_200, 66_900],
    modelos: ["r269", "fr85", "fr85"],
    ultimoService: 225_000,
  }),
  camion({
    patente: "GTP 4413",
    descripcion: "Volvo FH 540 · 2021",
    tipoId: "tractor",
    km: 74_650,
    lectura: "2026-09-30",
    choferAsignado: "Marcelo Núñez",
    kmPorDia: 420,
    recorridos: [74_650, 74_650, 18_200, 18_200, 18_700, 18_700, 18_900, 18_900, 19_100, 19_100],
    modelos: ["multi", "multi", "multi"],
    ultimoService: 50_000,
  }),
  semirremolque({
    patente: "SR 1204",
    descripcion: "Semirremolque furgón (ejemplo)",
    tipoId: "remolque-2",
    km: 212_480,
    lectura: "2026-09-30",
    kmPorDia: 350,
    recorridos: [48_300, 47_900, 52_600, 54_100, 61_700, 63_200, 59_800, 62_400],
    modelos: ["fr85", "kmax"],
  }),
  semirremolque({
    patente: "SR 1310",
    descripcion: "Remolque furgón (ejemplo)",
    tipoId: "remolque-3",
    km: 156_900,
    lectura: "2026-09-30",
    kmPorDia: 340,
    recorridos: [31_200, 30_800, 33_400, 34_100, 52_700, 53_900, 51_300, 54_600, 76_200, 74_800, 77_500, 78_300],
    modelos: ["multi", "fr85"],
  }),
  acoplado({
    patente: "AC 0307",
    descripcion: "Sorra con lanza (ejemplo)",
    tipoId: "sorra-sencilla",
    km: 168_300,
    lectura: "2026-09-30",
    kmPorDia: 300,
    recorridos: [39_800, 41_200, 58_700, 60_100],
    modelos: ["kmax"],
  }),
  acoplado({
    patente: "AC 0412",
    descripcion: "Sorra con lanza (ejemplo)",
    tipoId: "sorra-doble",
    km: 143_700,
    lectura: "2026-09-30",
    kmPorDia: 280,
    recorridos: [28_400, 29_100, 47_800, 49_300, 62_500, 61_900],
    modelos: ["kmax"],
  }),
  montacargas({
    patente: "Montacargas 1",
    descripcion: "Montacargas de patio · horas de uso (ejemplo)",
    km: 3_420,
    lectura: "2026-09-30",
    choferAsignado: "Walter Rocha",
    kmPorDia: 7,
    cadaService: 250,
    recorridos: [],
    modelos: ["kmax"],
    ultimoService: 3_200,
  }),
];

/** Los choferes de TSM entre los que se elige al cargar un service (de ejemplo). */
export const CHOFERES_DE_TSM = CHOFERES;
export const MECANICOS = [MECANICO, "Pepe (taller de la calle)"];

const sinSeparadores = (s: string) => s.replace(/[\s-]/g, "").toLowerCase();
export const vehiculoDe = (patente: string | undefined): Vehiculo | undefined =>
  VEHICULOS.find((v) => sinSeparadores(v.patente) === sinSeparadores(patente ?? ""));

/** La patente como va en la dirección: "GTP-4325". */
export const enLaDireccion = (patente: string) => patente.replace(/\s+/g, "-");
