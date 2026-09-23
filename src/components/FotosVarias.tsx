import { useEffect, useMemo, useRef } from "react";

/**
 * Varias fotos antes de guardar, para una misma cosa (las cargas de un combinado).
 *
 * "Cuando agregás la carga y sacás foto, que te dé la opción de sacar una foto más." — Rodrigo,
 * 22/9. `CameraCapture` guarda UNA foto y su único botón, "Cambiar", la reemplaza: con una foto
 * movida o de un remito de dos hojas no había forma de sumar la segunda antes de guardar.
 *
 * Es la pantalla del chofer parado en el lugar de carga y con una mano: dos botones grandes.
 * "Sumar otra foto" nunca toca las que ya están; sacar una foto sin querer se arregla con
 * "Quitar" en esa foto, y nada más la pierde.
 */
export function FotosVarias({
  label,
  fotos,
  onChange,
  disabled = false,
}: {
  label: string;
  fotos: File[];
  onChange: (fotos: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Una vista previa por foto. Se arma otra sola cuando cambia la lista y se libera al
  // desmontar o al cambiar: cuatro fotos sin liberar son cuatro imágenes colgadas en el celular.
  const vistas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas]);

  function agregar(file: File | null) {
    if (file) onChange([...fotos, file]);
    // Sin esto, sacar dos veces la misma foto seguida no dispara el evento.
    if (inputRef.current) inputRef.current.value = "";
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
        onChange={(e) => agregar(e.target.files?.[0] ?? null)}
      />

      {fotos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-ink/25 bg-surface text-ink/60 hover:border-brand-500/50 hover:text-brand-700 disabled:opacity-40"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium">Tomar foto</span>
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {fotos.map((f, i) => (
              <div key={`${f.name}-${f.lastModified}-${i}`} className="relative">
                <img src={vistas[i]} alt={`${label} ${i + 1}`} className="h-32 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                  disabled={disabled}
                  aria-label={`Quitar la foto ${i + 1}`}
                  className="absolute right-1 top-1 flex h-11 min-w-[44px] items-center justify-center bg-black/60 px-2 text-xs font-semibold text-ink disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-brand/40 bg-brand/[.06] py-3 font-cond text-[15px] font-semibold text-brand-700 disabled:opacity-40"
          >
            <span className="text-lg leading-none">+</span> Sumar otra foto
          </button>
        </div>
      )}
    </div>
  );
}
