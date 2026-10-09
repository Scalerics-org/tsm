import { claveDeLugar, kmEstimados } from "./distancias";

/**
 * Desde dónde sale el camión a buscar la carga, para los km vacíos.
 *
 * "Somos de base Bella Unión, pero es variable." (Rodrigo, 10/10). El viaje dice dónde carga, pero no dónde
 * estaba el camión antes: los 130 km de Bella Unión a Artigas, a buscar carga, no los ve nadie. Se le pregunta
 * al chofer al salir.
 *
 * LISTA CERRADA, no texto libre: un lugar que la tabla de distancias no conoce da km vacío, y el tramo
 * quedaría "sin medir", que es peor que no preguntar. Cada entrada se prueba contra `kmEstimados`.
 */

interface Localidad {
  nombre: string;
  /** Otros nombres con los que aparece el mismo lugar (el departamento y su capital). */
  tambien?: string[];
}

/** Las que más se usan, en este orden. El resto va alfabético. */
const MAS_USADAS: Localidad[] = [
  { nombre: "Bella Unión" },
  { nombre: "Artigas" },
  { nombre: "Montevideo" },
  { nombre: "Salto" },
];

const RESTO: Localidad[] = [
  { nombre: "Canelones" },
  { nombre: "Chuy" },
  { nombre: "Colonia del Sacramento", tambien: ["Colonia"] },
  { nombre: "Concordia" },
  { nombre: "Durazno" },
  { nombre: "Fray Bentos", tambien: ["Río Negro"] },
  { nombre: "Florida" },
  { nombre: "Maldonado" },
  { nombre: "Melo", tambien: ["Cerro Largo"] },
  { nombre: "Mercedes", tambien: ["Soriano"] },
  { nombre: "Minas", tambien: ["Lavalleja"] },
  { nombre: "Paysandú" },
  { nombre: "Punta del Este" },
  { nombre: "Rivera" },
  { nombre: "Rocha" },
  { nombre: "San José de Mayo", tambien: ["San José"] },
  { nombre: "Tacuarembó" },
  { nombre: "Treinta y Tres" },
  { nombre: "Trinidad", tambien: ["Flores"] },
];

const ORDEN_ALFABETICO = (a: Localidad, b: Localidad) => a.nombre.localeCompare(b.nombre, "es");

const TODAS: Localidad[] = [...MAS_USADAS, ...[...RESTO].sort(ORDEN_ALFABETICO)];

/** Los nombres que se le ofrecen al chofer y a la oficina, en el orden en que se muestran. */
export const LOCALIDADES_DE_SALIDA: string[] = TODAS.map((l) => l.nombre);

/**
 * El nombre de la lista al que corresponde un texto, o `null` si no es ninguno ("Otra", vacío, un lugar que no
 * está). Reconoce el departamento y la capital ("Lavalleja" es "Minas") y no distingue mayúsculas ni acentos.
 * Es lo que se guarda: nunca queda en la base un texto que la app no entienda.
 */
export function salidaValida(texto: unknown): string | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const clave = claveDeLugar(texto);
  const hallada = TODAS.find((l) => [l.nombre, ...(l.tambien ?? [])].some((n) => claveDeLugar(n) === clave));
  return hallada?.nombre ?? null;
}

/** ¿Es una salida que la app sabe medir? (Lo prueba el test contra la tabla de distancias.) */
export const sabeMedirDesde = (nombre: string): boolean => kmEstimados(nombre, "Montevideo") != null;
