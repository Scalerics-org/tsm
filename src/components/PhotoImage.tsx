import { useFotoUrl } from "./VisorFotos";

/**
 * Muestra una foto protegida de R2. Si la foto no existe (p. ej. datos de ejemplo), muestra
 * un marcador de posición en lugar de romper la vista.
 *
 * Con `onAmpliar` se vuelve un botón: la miniatura va recortada y de un remito se ve un
 * pedazo, así que en la oficina se toca para abrirla entera en el visor.
 */
export function PhotoImage({
  r2Key,
  alt,
  className = "",
  onAmpliar,
}: {
  r2Key: string;
  alt: string;
  className?: string;
  onAmpliar?: () => void;
}) {
  const { url, falló } = useFotoUrl(r2Key);

  if (falló) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 border border-dashed border-ink/25 bg-surface text-ink/45 ${className}`}
      >
        <span className="text-2xl">🖼️</span>
        <span className="text-xs">Sin imagen</span>
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse bg-surface ${className}`} />;
  }

  const img = <img src={url} alt={alt} className={`object-cover ${className}`} />;
  if (!onAmpliar) return img;

  return (
    <button
      type="button"
      onClick={onAmpliar}
      title="Tocá para ampliar"
      className="group relative block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      {img}
      <span className="absolute inset-0 hidden place-items-center bg-navy/30 text-2xl text-white group-hover:grid">
        ⤢
      </span>
    </button>
  );
}
