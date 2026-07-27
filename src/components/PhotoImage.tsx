import { useEffect, useState } from "react";
import { fetchPhotoUrl } from "../lib/api";

/**
 * Muestra una foto protegida de R2. Descarga el blob con el token de auth y
 * genera un object URL. Si la foto no existe (p. ej. datos de ejemplo), muestra
 * un marcador de posición en lugar de romper la vista.
 */
export function PhotoImage({
  r2Key,
  alt,
  className = "",
}: {
  r2Key: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setUrl(null);
    fetchPhotoUrl(r2Key)
      .then((u) => {
        if (!active) return;
        if (!u) {
          setFailed(true);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [r2Key]);

  if (failed) {
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
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}
