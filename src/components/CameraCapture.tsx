import { useEffect, useRef, useState } from "react";

/**
 * Captura una foto desde la cámara del celular (o galería como respaldo).
 * Muestra vista previa y entrega el File al padre.
 */
export function CameraCapture({
  label,
  onChange,
}: {
  label: string;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // El object URL de la vista previa se libera al cambiar de foto Y al desmontar. Lo segundo
  // faltaba: cuando se sacaba una sola foto por viaje no se notaba, pero la llegada ahora
  // remonta este componente una vez por foto, y con cuatro hojas de ruta serían cuatro
  // imágenes colgadas en la memoria del celular.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function handleFile(file: File | null) {
    onChange(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div>
      <span className="label">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="relative">
          <img src={preview} alt={label} className="h-48 w-full object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 bg-black/60 px-3 py-1 text-xs font-semibold text-ink"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-ink/25 bg-surface text-ink/60 hover:border-brand-500/50 hover:text-brand-700"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium">Tomar foto</span>
        </button>
      )}
    </div>
  );
}
