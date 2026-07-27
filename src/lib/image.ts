/**
 * Comprime/redimensiona una foto en el navegador antes de subirla.
 * Reduce el peso ~5-10x manteniendo calidad de evidencia y sube más rápido
 * con mala señal. Si el navegador no puede decodificar la imagen (p. ej. HEIC)
 * o no hay ganancia, devuelve el archivo original.
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.7;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file; // sin ganancia (ej. imagen ya chica)

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // fallback: subir el original
  }
}
