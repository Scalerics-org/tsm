import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  TRIP_STATUS,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { CargasDelViaje } from "./CargasDelViaje";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
}

export function OpsTripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);

  const load = useCallback(() => {
    api
      .get<Detail>(`/trips/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner size={28} />;
  const { trip, photos } = data;
  const fields = trip.fields ?? [];

  async function cancel() {
    if (!confirm("¿Cancelar este viaje?")) return;
    try {
      await api.post(`/trips/${trip.id}/cancel`, {});
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cancelar el viaje");
    }
  }

  /**
   * Borrar el viaje entero. "Borrar viajes o agregar viajes desde oficina, para posibles
   * correcciones."
   *
   * La confirmación dice cuántas cargas se lleva porque cada una es una unidad facturable:
   * un "¿Seguro?" pelado no deja ver que se están tirando tres renglones cobrables. Cancelar
   * sigue siendo la opción blanda — el viaje queda, marcado, y no desaparece del historial.
   */
  async function eliminar() {
    const cargas = trip.segments.length;
    const detalle = cargas
      ? `Se van a borrar también sus ${cargas} carga${cargas === 1 ? "" : "s"}, que ya no van a aparecer en el Excel de facturación.`
      : "El viaje no tiene cargas registradas.";
    if (!confirm(`¿Borrar el viaje ${trip.origin} → ${trip.destination} del ${fmtDateTime(trip.started_at)}?\n\n${detalle}\n\nEsto no se puede deshacer. Si solo querés dejarlo sin efecto, usá Cancelar.`)) {
      return;
    }
    setBorrando(true);
    try {
      await api.del(`/trips/${trip.id}`);
      navigate("/panel/viajes");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar el viaje");
      setBorrando(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/panel/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="kicker">{trip.provider_name}</div>
          <h1 className="text-2xl text-ink">
            {trip.origin} → {trip.destination}
            {trip.destinatario ? ` (${trip.destinatario})` : ""}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.driver_name} · 🚛 {trip.truck_plate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={trip.status} />
          {trip.status === TRIP_STATUS.EN_CURSO && (
            <Button variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
          )}
          <Button variant="danger" onClick={eliminar} loading={borrando}>
            Borrar
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {trip.remite && <Info label="Remite" value={trip.remite} />}
          <Info label="Carga" value={trip.cargo_type || "—"} />
          <Info label="Toneladas" value={trip.weight_tons != null ? `${trip.weight_tons} t` : "—"} />
          {fields
            .filter((f) => !f.is_weight)
            .map((f) => (
              <Info key={f.key} label={f.label} value={trip.field_values[f.key] || "—"} />
            ))}
          <Info label="Salida" value={fmtDateTime(trip.started_at)} />
          <Info label="Llegada" value={trip.finished_at ? fmtDateTime(trip.finished_at) : "—"} />
        </div>
        {trip.notes && (
          <div className="mt-3 border-l-4 border-brand bg-surface p-3 text-sm text-ink/80">
            <span className="font-semibold">Observaciones:</span> {trip.notes}
          </div>
        )}
      </Card>

      <CargasDelViaje segments={trip.segments} photos={photos} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        {label}
      </div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}
