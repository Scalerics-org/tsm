/**
 * La disposición de un vehículo: qué ejes tiene y si cada uno es simple o dual. De acá salen las posiciones
 * de cubierta (con su número y su nombre) y el dibujo: sumar un acoplado o cualquier otra configuración es
 * escribir su lista de ejes, no dibujar nada a mano.
 */

export type TipoEje = "simple" | "dual";
export type Carroceria = "camion" | "semirremolque";

export interface EjeDef {
  id: string;
  nombre: string;
  tipo: TipoEje;
  /** Dónde cae el eje en el dibujo (unidades del viewBox, de arriba hacia abajo). */
  y: number;
}

export interface Disposicion {
  id: string;
  nombre: string;
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

export const CAMION: Disposicion = {
  id: "camion-10",
  nombre: "Camión de 10 cubiertas",
  carroceria: "camion",
  ejes: [
    { id: "dir", nombre: "Dirección", tipo: "simple", y: 112 },
    { id: "t1", nombre: "Eje trasero 1", tipo: "dual", y: 330 },
    { id: "t2", nombre: "Eje trasero 2", tipo: "dual", y: 420 },
  ],
};

export const SEMIRREMOLQUE: Disposicion = {
  id: "semi-8",
  nombre: "Semirremolque de 8 cubiertas",
  carroceria: "semirremolque",
  ejes: [
    { id: "e1", nombre: "Eje 1", tipo: "dual", y: 344 },
    { id: "e2", nombre: "Eje 2", tipo: "dual", y: 428 },
  ],
};

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
