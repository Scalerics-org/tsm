/**
 * Reintentos cuando NO llegó respuesta (sin señal o sin contestar a tiempo).
 *
 * Es el único lugar que dice qué se reintenta. Un error con respuesta (4xx, 5xx) nunca se
 * reintenta: el servidor contestó y repetir el pedido no cambia nada. Sin respuesta no se sabe si
 * el pedido llegó, y por eso sólo se reenvía lo que el servidor sabe reconocer como reenvío
 * (ver la tabla en docs/DECISIONES.md). Sumar una ruta acá es decidir que reenviarla es seguro.
 */

/** Cuántas veces se vuelve a mandar después del primer intento: 3 intentos en total. */
export const ESPERAS_ENTRE_INTENTOS_MS = [1_000, 3_000] as const;

/**
 * Tope de cada reintento. El primer intento espera lo de siempre (30 s); los reintentos, menos:
 * ya hubo una falla y quien espera es el chofer. Peor caso: 30 + 1 + 15 + 3 + 15 = 64 s, contra
 * los 30 s de hoy. Un corte de señal de verdad falla al instante, así que ahí son 4 s de espera.
 */
export const ESPERA_REINTENTO_MS = 15_000;

/** Evento que escucha el aviso "reintentando" del chofer. `detail` null = ya terminó. */
export const EVENTO_REINTENTANDO = "tsm:reintentando";

export interface Reintentando {
  /** Número del intento que se está por hacer (2 o 3). */
  intento: number;
  de: number;
}

/** Escrituras que el servidor reconoce como reenvío. Todo lo que no está acá se manda una vez. */
const ESCRITURAS_REENVIABLES: readonly { metodo: string; ruta: RegExp }[] = [
  { metodo: "POST", ruta: /^\/trips\/\d+\/segments$/ }, // sumar una carga: el sid la identifica
  { metodo: "PATCH", ruta: /^\/trips\/\d+\/segments\/[^/]+$/ }, // cantidad de una carga: pone un valor
  { metodo: "PATCH", ruta: /^\/trips\/\d+\/campos$/ }, // datos del camino: pone valores
  { metodo: "POST", ruta: /^\/libreta$/ }, // alta por nombre: reutiliza la entrada existente
];

/**
 * Las lecturas de la sesión no se reintentan: al abrir sin señal la app sigue con el usuario
 * guardado, y esperar 4 s de más antes de seguir sería peor que el corte.
 */
const LECTURAS_SIN_REINTENTO = /^\/auth\//;

export function sePuedeReintentar(metodo: string, path: string): boolean {
  const ruta = path.split("?")[0];
  if (metodo === "GET") return !LECTURAS_SIN_REINTENTO.test(ruta);
  return ESCRITURAS_REENVIABLES.some((e) => e.metodo === metodo && e.ruta.test(ruta));
}

interface Opciones {
  reintentable: boolean;
  /** true si el error es "no llegó respuesta". */
  sinRespuesta: (e: unknown) => boolean;
  avisar: (estado: Reintentando | null) => void;
  dormir?: (ms: number) => Promise<void>;
}

/**
 * Corre `intento` y, si no llega respuesta y la ruta lo permite, lo vuelve a correr con espera
 * creciente. Le pasa a cada intento su tope de espera (undefined = el de siempre).
 */
export async function conReintentos<T>(
  intento: (esperaMs: number | undefined) => Promise<T>,
  { reintentable, sinRespuesta, avisar, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }: Opciones,
): Promise<T> {
  const de = ESPERAS_ENTRE_INTENTOS_MS.length + 1;
  let avisado = false;
  try {
    for (let n = 1; ; n++) {
      try {
        return await intento(n === 1 ? undefined : ESPERA_REINTENTO_MS);
      } catch (e) {
        if (!reintentable || !sinRespuesta(e) || n >= de) throw e;
        avisar({ intento: n + 1, de });
        avisado = true;
        await dormir(ESPERAS_ENTRE_INTENTOS_MS[n - 1]);
      }
    }
  } finally {
    if (avisado) avisar(null);
  }
}
