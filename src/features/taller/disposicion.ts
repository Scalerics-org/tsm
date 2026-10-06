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
 * El código del sticker del Ministerio (MTOP) de cada tipo va en `mtop`, como texto: queda vacío hasta que
 * llegue la foto del sticker.
 */
export interface Disposicion {
  id: string;
  nombre: string;
  /** Código MTOP del tipo, tal cual está en el sticker. Vacío = todavía no lo tenemos. */
  mtop: string;
  carroceria: Carroceria;
  ejes: EjeDef[];
}

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

type Plano = { simples?: number; duales: number };

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
    const n = conDireccion ? (resto.length > 1 ? `Eje trasero ${i + 1}` : "Eje trasero") : `Eje ${i + 1}`;
    ejes.push({ id: `e${i + 1}`, nombre: n, tipo, y: primero + i * paso });
  });
  return ejes;
}

const tipo = (id: string, nombre: string, carroceria: Carroceria, plano: Plano): Disposicion => ({
  id,
  nombre,
  mtop: "",
  carroceria,
  ejes: ejesDe(carroceria, plano),
});

/**
 * Los tipos de vehículo que se pueden elegir. Cada uno dice sus ejes, simples o duales. Camión rígido (con su caja
 * de carga) y camión tractor (sin caja, con quinta rueda) se dibujan distinto. Los ejes del acoplado van simples
 * como en la foto 19.jpg; con duales sería otro tipo.
 */
export const TIPOS_DE_VEHICULO: Disposicion[] = [
  tipo("rigido-2", "Camión rígido de 2 ejes", "rigido", { duales: 1 }),
  tipo("rigido-3", "Camión rígido de 3 ejes", "rigido", { duales: 2 }),
  tipo("tractor-2", "Camión tractor de 2 ejes", "tractor", { duales: 1 }),
  tipo("tractor-3", "Camión tractor de 3 ejes", "tractor", { duales: 2 }),
  tipo("semi-2", "Semirremolque de 2 ejes", "semirremolque", { duales: 2 }),
  tipo("semi-3", "Semirremolque de 3 ejes", "semirremolque", { duales: 3 }),
  tipo("acoplado-2", "Acoplado de 2 ejes", "acoplado", { simples: 2, duales: 0 }),
];

export const tipoDeVehiculo = (id: string): Disposicion => TIPOS_DE_VEHICULO.find((t) => t.id === id) ?? TIPOS_DE_VEHICULO[3];

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
export const CUBIERTA_H = 68;
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
