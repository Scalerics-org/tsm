import { useState } from "react";
import type { TripSegment } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Button, ErrorText } from "../../components/ui";
import { CamposDeLugares, errorDeLugares, type Lugares } from "./CamposDeLugares";

/**
 * Dónde cargó y dónde descargó una carga, corregible desde la oficina.
 *
 * Es para las plantillas donde el recorrido sale de las cargas (Otros Viajes): ahí Corregir el
 * viaje deja Origen y Destino apagados y manda a "corregir el lugar en la carga", y hasta ahora
 * no había ninguna pantalla donde hacerlo (Rodrigo, 25/9: "no me deja corregir, Otros Viajes, a
 * dónde va"). El destino y el lugar de descarga se pueden dejar sin definir: hay viajes en que
 * todavía no se sabe adónde va una carga, y ese "a definir" se ve en la lista hasta que se pone.
 *
 * Se manda la lista entera por `PUT /trips/:id/segments`, cambiando sólo esta carga y
 * identificada por su `sid`: sus fotos y su cobro escrito a mano no se mueven. Un viaje ya
 * facturado lo frena el servidor con su mensaje.
 */
export function EditarLugaresDeCarga({
  tripId,
  segments,
  carga,
  onGuardado,
}: {
  tripId: number;
  segments: TripSegment[];
  carga: TripSegment;
  onGuardado: () => void;
}) {
  const desdeLaCarga = (): Lugares => ({
    origen: carga.origen,
    lugar: carga.remitente,
    destino: carga.destino,
    descarga: carga.clientes[0] ?? "",
  });
  const [abierto, setAbierto] = useState(false);
  const [lugares, setLugares] = useState<Lugares>(desdeLaCarga);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const abrir = () => {
    setLugares(desdeLaCarga());
    setError("");
    setAbierto(true);
  };

  async function guardar() {
    const falta = errorDeLugares(lugares);
    if (falta) return setError(falta);
    setBusy(true);
    setError("");
    try {
      await api.put(`/trips/${tripId}/segments`, {
        segments: segments.map((x) =>
          x.sid === carga.sid
            ? {
                ...x,
                origen: lugares.origen,
                remitente: lugares.lugar.trim(),
                destino: lugares.destino || null,
                clientes: lugares.descarga.trim() ? [lugares.descarga.trim()] : [],
                cliente_ids: [],
              }
            : x,
        ),
      });
      setAbierto(false);
      onGuardado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudieron corregir los lugares"));
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink/55">
        <span>
          {carga.origen || "sin departamento"} → {carga.destino || <em className="text-st-amberTx">destino a definir</em>}
        </span>
        <button type="button" onClick={abrir} className="text-brand-700 hover:underline">
          Corregir lugares
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 border border-brand/30 bg-brand/[.04] p-3">
      <CamposDeLugares value={lugares} onChange={setLugares} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button loading={busy} onClick={guardar}>
          Guardar lugares
        </Button>
        <Button variant="ghost" onClick={() => setAbierto(false)} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
