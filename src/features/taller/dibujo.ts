import type { Disposicion, Posicion } from "@shared/taller/disposicion";

/**
 * El dibujo de las cubiertas visto desde arriba: medidas y lugares. Es de pantalla (SVG), por eso no vive en
 * shared/taller/: la disposición de ejes y la numeración de las posiciones, que son dominio, sí.
 */

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
