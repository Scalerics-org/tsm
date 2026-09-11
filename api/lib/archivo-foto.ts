/**
 * Una foto subida, validada por su CONTENIDO y no por lo que dice ser.
 *
 * Las tres subidas (fotos del viaje, tacógrafo y boleta de la surtida, lectura del mes)
 * guardaban en R2 cualquier archivo, de cualquier tamaño, con el Content-Type que mandaba el
 * cliente. Un chofer —o cualquiera con un token— podía subir un HTML diciendo que era una foto,
 * o un archivo de varios GB que el Worker intentaba cargar entero en memoria. Y una foto que el
 * navegador no pudiera mostrar (un HEIC que no se llegó a comprimir) quedaba guardada como
 * evidencia sin que nadie pudiera abrirla.
 *
 * Por eso se miran los primeros bytes: JPEG empieza con FF D8 FF, PNG con 89 50 4E 47 y WEBP con
 * "RIFF….WEBP". Eso resuelve también el archivo sin tipo que mandan algunos celulares Android,
 * que antes se guardaba como "image/jpeg" a ciegas.
 */

export const MAX_FOTO_BYTES = 12 * 1024 * 1024;

export type TipoDeImagen = "image/jpeg" | "image/png" | "image/webp";
const EXTENSION: Record<TipoDeImagen, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const ascii = (b: Uint8Array, desde: number, hasta: number) => String.fromCharCode(...b.subarray(desde, hasta));

/** El tipo real de la imagen según sus primeros bytes, o `null` si no es una que se pueda ver. */
export function tipoDeImagen(b: Uint8Array): TipoDeImagen | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && ascii(b, 1, 4) === "PNG" && b[0] === 0x89 && b[4] === 0x0d && b[5] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export type FotoLeida =
  | { ok: true; bytes: ArrayBuffer; tipo: TipoDeImagen; ext: string }
  | { ok: false; motivo: string };

/**
 * Lee y valida una foto. El tamaño se mira ANTES de leerla: un archivo enorme no se carga entero
 * en memoria para después rechazarlo.
 */
export async function leerFoto(f: { size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<FotoLeida> {
  if (!f.size) return { ok: false, motivo: "La foto llegó vacía. Probá sacarla de nuevo." };
  if (f.size > MAX_FOTO_BYTES) {
    return { ok: false, motivo: "La foto es demasiado grande. Probá sacarla de nuevo con la cámara." };
  }
  const bytes = await f.arrayBuffer();
  const tipo = tipoDeImagen(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (!tipo) {
    return {
      ok: false,
      motivo: "Ese archivo no es una foto que se pueda ver (tiene que ser JPG, PNG o WEBP). Sacala de nuevo con la cámara.",
    };
  }
  return { ok: true, bytes, tipo, ext: EXTENSION[tipo] };
}
