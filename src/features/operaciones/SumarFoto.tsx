import { useRef, useState } from "react";
import type { PhotoKind } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { compressImage } from "../../lib/image";

/**
 * Sumar una foto al viaje desde la oficina: el remito de descarga, la Hoja MIC o la boleta de un lugar.
 *
 * Usa la misma ruta y la misma compresión que el celular del chofer (`POST /photos` con `kind` y, si es de
 * una carga o de un lugar, su `segment_sid`). Sube de a una y sin reintento automático, como el resto: si
 * falla, lo dice y el botón queda para volver a probar. La foto queda como cualquier otra del viaje.
 */
export function SumarFoto({
  tripId,
  kind,
  segmentSid,
  texto,
  onSubida,
}: {
  tripId: number;
  kind: PhotoKind;
  segmentSid?: string;
  /** Lo que dice el botón: "Sumar foto de llegada", "Sumar Hoja MIC"… */
  texto: string;
  onSubida: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  async function subir(file: File | null) {
    if (input.current) input.current.value = "";
    if (!file || subiendo) return;
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      fd.append("trip_id", String(tripId));
      fd.append("kind", kind);
      if (segmentSid) fd.append("segment_sid", segmentSid);
      await api.upload("/photos", fd);
      onSubida();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {/* Sin `capture`: en la oficina la foto suele ser un archivo o una captura, no la cámara. */}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0] ?? null)} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={subiendo}
        className="btn btn-secondary min-h-[44px] text-[13px] disabled:opacity-60"
      >
        {subiendo ? "Subiendo…" : `+ ${texto}`}
      </button>
      {error && <span className="text-xs text-st-redTx">{error}</span>}
    </span>
  );
}
