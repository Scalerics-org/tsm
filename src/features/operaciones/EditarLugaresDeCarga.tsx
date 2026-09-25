import { useState } from "react";
import { LIBRETA_ESTADO, LIBRETA_TIPO, TIPO_DEPARTAMENTO, type LibretaEntry, type TripSegment } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Button, ErrorText, Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

/** El nombre de un departamento como lo espera el selector: sólo el nombre importa. */
function departamento(nombre: string | null): LibretaEntry | null {
  const n = nombre?.trim();
  if (!n) return null;
  return {
    id: 0,
    tipo: LIBRETA_TIPO.LUGAR,
    nombre: n,
    provider_id: null,
    agrupador: false,
    estado: LIBRETA_ESTADO.CONFIRMADO,
    usos: 0,
    created_by: null,
  };
}

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
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<string | null>(carga.origen);
  const [lugar, setLugar] = useState(carga.remitente);
  const [destino, setDestino] = useState<string | null>(carga.destino);
  const [descarga, setDescarga] = useState(carga.clientes[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const abrir = () => {
    setOrigen(carga.origen);
    setLugar(carga.remitente);
    setDestino(carga.destino);
    setDescarga(carga.clientes[0] ?? "");
    setError("");
    setAbierto(true);
  };

  async function guardar() {
    // Sin lugar de carga el servidor descarta el renglón entero: es lo único que no puede quedar vacío.
    if (!lugar.trim()) return setError("Escribí el lugar de carga.");
    if (!origen) return setError("Elegí el departamento donde cargó.");
    setBusy(true);
    setError("");
    try {
      await api.put(`/trips/${tripId}/segments`, {
        segments: segments.map((x) =>
          x.sid === carga.sid
            ? {
                ...x,
                origen,
                remitente: lugar.trim(),
                destino: destino || null,
                clientes: descarga.trim() ? [descarga.trim()] : [],
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
      <div className="grid gap-3 sm:grid-cols-2">
        <LibretaPicker
          tipo={TIPO_DEPARTAMENTO}
          label="Departamento de carga"
          value={departamento(origen)}
          onChange={(e) => setOrigen(e?.nombre ?? null)}
        />
        <Field label="Lugar de carga">
          <input className="input" value={lugar} onChange={(e) => setLugar(e.target.value)} autoCapitalize="words" />
        </Field>
        <LibretaPicker
          tipo={TIPO_DEPARTAMENTO}
          label="Departamento de destino"
          value={departamento(destino)}
          onChange={(e) => setDestino(e?.nombre ?? null)}
        />
        <Field label="Lugar de descarga">
          <input
            className="input"
            value={descarga}
            onChange={(e) => setDescarga(e.target.value)}
            placeholder="Todavía no se sabe"
            autoCapitalize="words"
          />
        </Field>
      </div>
      {destino && (
        <button type="button" onClick={() => setDestino(null)} className="text-xs text-ink/55 hover:underline">
          Todavía no se sabe el destino: dejarlo a definir
        </button>
      )}
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
