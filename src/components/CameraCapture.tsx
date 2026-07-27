import { useRef, useState } from "react";

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

  function handleFile(file: File | null) {
    onChange(file);
    if (preview) URL.revokeObjectURL(preview);
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
          <img src={preview} alt={label} className="h-48 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-1 text-xs font-semibold text-white"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] text-slate-400 hover:border-brand-500/50 hover:text-brand-300"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium">Tomar foto</span>
        </button>
      )}
    </div>
  );
}
