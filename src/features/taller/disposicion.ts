/**
 * La disposición de un vehículo: qué ejes tiene y si cada uno es simple o dual. De acá salen las posiciones
 * de cubierta (con su número y su nombre) y el dibujo: sumar un acoplado o cualquier otra configuración es
 * escribir su lista de ejes, no dibujar nada a mano.
 */

export type TipoEje = "simple" | "dual";
export type Carroceria = "rigido" | "tractor" | "semirremolque" | "acoplado";

export interface EjeDef {
  id: string;
  nombre: string;
  tipo: TipoEje;
  /** Dónde cae el eje en el dibujo (unidades del viewBox, de arriba hacia abajo). */
  y: number;
}

/**
 * Un tipo de vehículo: la configuración de ejes que se registra una vez y de la que sale el dibujo.
 * El `nombre` es como se muestra: Rodrigo va a pasar los nombres como los usan ellos y se cambian acá, en
 * `TIPOS_DE_VEHICULO`, y en ningún otro lugar.
 */
export interface Disposicion {
  id: string;
  nombre: string;
  carroceria: Carroceria;
  ejes: EjeDef[];
  /** Cada cuántos km toca un service. `null`: este tipo (remolque, sorra) no tiene service por km. */
  intervaloServiceKm: number | null;
  /** Lo que se asumió y falta confirmar con Rodrigo sobre este tipo (una línea): se muestra en pantalla. */
  aConfirmar?: string;
}

/** El montacargas no tiene ejes que dibujar (cuenta horas): su tipo se muestra sólo por el nombre. */
export const NOMBRE_MONTACARGAS = "Montacargas";

/**
 * Los intervalos de service (dato de Rodrigo): 25.000 km los camiones grandes y 15.000 los chicos. Qué es grande y qué
 * es chico no está definido todavía; se asume que grande = camión tractor, tractor sencillo y doble eje, y chico =
 * rígido de 2 ejes.
 */
export const INTERVALO_GRANDE_KM = 25_000;
export const INTERVALO_CHICO_KM = 15_000;

/**
 * Cómo se pinta lo que falta para el próximo service por km (lo pidió Rodrigo): cortes FIJOS en km, iguales para camiones
 * grandes y chicos. Rojo con menos de 3.000 km o ya pasado, ámbar entre 3.000 y 10.000, verde con más de 10.000. Son
 * constantes con nombre para cambiarlas en un solo lugar.
 */
export const UMBRAL_ROJO_SERVICE_KM = 3_000;
export const UMBRAL_AMBAR_SERVICE_KM = 10_000;

/** El montacargas mide en horas y conserva su criterio: ámbar si falta un tercio del intervalo o menos, rojo bajo 25 horas. */
export const FRACCION_AMBAR_SERVICE_HORAS = 1 / 3;
export const UMBRAL_ROJO_SERVICE_HORAS = 25;

export type Lado = "izquierda" | "derecha";
export type Lugar = "unica" | "exterior" | "interior";

export interface Posicion {
  /** El número que lleva la cubierta en el dibujo: 1, 2, 3… */
  numero: number;
  eje: EjeDef;
  lado: Lado;
  lugar: Lugar;
  /** "Eje trasero 1 · izquierda exterior" */
  nombre: string;
}

type Plano = { simples?: number; duales: number; nombres?: string[]; ys?: number[] };

/** Los ejes de una configuración: la dirección (si la lleva) y los demás, de adelante hacia atrás. */
function ejesDe(c: Carroceria, plano: Plano): EjeDef[] {
  const ejes: EjeDef[] = [];
  const conDireccion = c === "rigido" || c === "tractor";
  if (conDireccion) ejes.push({ id: "dir", nombre: "Dirección", tipo: "simple", y: 112 });
  const resto: TipoEje[] = [
    ...Array<TipoEje>(plano.simples ?? 0).fill("simple"),
    ...Array<TipoEje>(plano.duales).fill("dual"),
  ];
  const primero = conDireccion ? (resto.length > 1 ? 330 : 372) : c === "acoplado" ? 292 : 344;
  const paso = c === "acoplado" ? 92 : conDireccion ? 90 : 84;
  resto.forEach((tipo, i) => {
    const n = plano.nombres?.[i] ?? (conDireccion ? (resto.length > 1 ? `Eje trasero ${i + 1}` : "Eje trasero") : `Eje ${i + 1}`);
    ejes.push({ id: `e${i + 1}`, nombre: n, tipo, y: plano.ys?.[i] ?? primero + i * paso });
  });
  return ejes;
}

const tipo = (id: string, nombre: string, carroceria: Carroceria, plano: Plano, intervaloServiceKm: number | null, aConfirmar?: string): Disposicion => ({
  id,
  nombre,
  carroceria,
  ejes: ejesDe(carroceria, plano),
  intervaloServiceKm,
  aConfirmar,
});

const EJES_DUALES = "Se asumieron ejes duales: en las fotos de Rodrigo se ven de costado y no se distingue. A confirmar.";
const EJES_SIMPLES = "Se asumieron ejes simples: en las fotos de Rodrigo se ven de costado y no se distingue. A confirmar.";

/**
 * Los tipos de vehículo, con los nombres como los usa Rodrigo (se cambian acá y en ningún otro lugar), en este orden.
 * Cada uno dice sus ejes, simples o duales: de ahí salen el dibujo, las posiciones y el intervalo de service.
 * El camión tractor y el tractor sencillo llevan quinta rueda; el doble eje y el camión chico, caja de carga.
 */
export const TIPOS_DE_VEHICULO: Disposicion[] = [
  tipo("tractor", "Camión tractor", "tractor", { duales: 2 }, INTERVALO_GRANDE_KM),
  tipo("tractor-sencillo", "Camión tractor sencillo", "tractor", { duales: 1 }, INTERVALO_GRANDE_KM, "Se asumió que es un camión grande (service cada 25.000 km). A confirmar."),
  tipo("doble-eje", "Camión doble eje", "rigido", { duales: 2 }, INTERVALO_GRANDE_KM),
  tipo("camion-chico", "Camión chico", "rigido", { duales: 1 }, INTERVALO_CHICO_KM),
  tipo("remolque-3", "Remolque tres ejes", "semirremolque", { duales: 3 }, null, EJES_DUALES),
  tipo("remolque-2", "Remolque dos ejes", "semirremolque", { duales: 2 }, null, EJES_DUALES),
  tipo("sorra-sencilla", "Sorra sencilla", "acoplado", { simples: 2, duales: 0, nombres: ["Eje delantero", "Eje trasero"], ys: [292, 384] }, null, EJES_SIMPLES),
  tipo(
    "sorra-doble",
    "Sorra doble eje",
    "acoplado",
    { simples: 3, duales: 0, nombres: ["Eje delantero", "Eje trasero 1", "Eje trasero 2"], ys: [262, 380, 464] },
    null,
    EJES_SIMPLES,
  ),
];

export const tipoDeVehiculo = (id: string): Disposicion => TIPOS_DE_VEHICULO.find((t) => t.id === id) ?? TIPOS_DE_VEHICULO[0];

/**
 * Las posiciones, numeradas de adelante hacia atrás y, en cada eje, de izquierda a derecha:
 * izquierda exterior, izquierda interior, derecha interior, derecha exterior (como el dibujo de Rodrigo).
 */
export function posiciones(d: Disposicion): Posicion[] {
  const lista: Omit<Posicion, "numero">[] = [];
  for (const eje of d.ejes) {
    if (eje.tipo === "simple") {
      lista.push({ eje, lado: "izquierda", lugar: "unica", nombre: `${eje.nombre} · izquierda` });
      lista.push({ eje, lado: "derecha", lugar: "unica", nombre: `${eje.nombre} · derecha` });
    } else {
      lista.push({ eje, lado: "izquierda", lugar: "exterior", nombre: `${eje.nombre} · izquierda exterior` });
      lista.push({ eje, lado: "izquierda", lugar: "interior", nombre: `${eje.nombre} · izquierda interior` });
      lista.push({ eje, lado: "derecha", lugar: "interior", nombre: `${eje.nombre} · derecha interior` });
      lista.push({ eje, lado: "derecha", lugar: "exterior", nombre: `${eje.nombre} · derecha exterior` });
    }
  }
  return lista.map((p, i) => ({ ...p, numero: i + 1 }));
}

/** Las medidas del dibujo, en unidades del viewBox (que mide 360 de ancho: en el celular es 1 a 1). */
export const ANCHO = 360;
export const CUBIERTA_W = 44;
export const CUBIERTA_H = 74;
const SEPARACION_DUAL = 4;

/** Dónde va la esquina de arriba a la izquierda de una cubierta. */
export function lugarEnElDibujo(p: Posicion): { x: number; y: number } {
  const y = p.eje.y - CUBIERTA_H / 2;
  if (p.lugar === "unica") return { x: p.lado === "izquierda" ? 50 : ANCHO - 50 - CUBIERTA_W, y };
  const afuera = 28;
  const adentro = afuera + CUBIERTA_W + SEPARACION_DUAL;
  const izquierda = p.lugar === "exterior" ? afuera : adentro;
  return { x: p.lado === "izquierda" ? izquierda : ANCHO - izquierda - CUBIERTA_W, y };
}

export function altoDelDibujo(d: Disposicion): number {
  const ultimo = Math.max(...d.ejes.map((e) => e.y));
  return ultimo + CUBIERTA_H / 2 + 52;
}
