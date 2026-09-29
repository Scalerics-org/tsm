import { ApiError } from "./api";

/**
 * Mandar algo que no se puede reenviar a ciegas (una surtida, un cierre, una salida) sin duplicarlo.
 *
 * Si el pedido termina en "sin respuesta" no se sabe si llegó. Antes de dejar que el chofer vuelva
 * a tocar, se pregunta con una lectura (que sí es segura) si lo que mandó ya está:
 *   - está → sale como si hubiera salido bien (`yaEstaba`), sin mandar nada más;
 *   - no está → se manda UNA vez más;
 *   - la lectura tampoco contesta → el error de sin señal de siempre.
 * Si ese único reenvío responde con un 409 ("ya está cargada", "no está en curso"…), tampoco se lo
 * muestra sin mirar antes: puede ser justo lo que el primer pedido dejó hecho.
 *
 * El servidor no cambia: nunca descarta nada por su cuenta. Esto sólo evita mandar dos veces.
 */

/** Lo que tarda el servidor en terminar un pedido que se cortó del lado del celular, antes de leer. */
export const ESPERA_ANTES_DE_VERIFICAR_MS = 2_000;

export type ResultadoEnvio<T> = { yaEstaba: false; dato: T } | { yaEstaba: true };

const sinRespuesta = (e: unknown) => e instanceof ApiError && e.status === 0;
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function enviarVerificando<T>(
  enviar: () => Promise<T>,
  yaLlego: () => Promise<boolean>,
  espera: (ms: number) => Promise<void> = esperar,
): Promise<ResultadoEnvio<T>> {
  try {
    return { yaEstaba: false, dato: await enviar() };
  } catch (primero) {
    if (!sinRespuesta(primero)) throw primero;

    await espera(ESPERA_ANTES_DE_VERIFICAR_MS);
    // Si la lectura tampoco llega, se queda el error del primer pedido, que es el que entiende el chofer.
    if (await yaLlego().catch(() => Promise.reject(primero))) return { yaEstaba: true };

    try {
      return { yaEstaba: false, dato: await enviar() };
    } catch (segundo) {
      // Un 409 acá puede ser el primer pedido, que sí llegó y se está terminando de guardar.
      if (segundo instanceof ApiError && segundo.status === 409 && (await yaLlego().catch(() => false))) {
        return { yaEstaba: true };
      }
      throw segundo;
    }
  }
}
