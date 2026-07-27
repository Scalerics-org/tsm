import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  PHOTO_KIND_LABEL,
  TRIP_STATUS,
  type PhotoKind,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { fmtDateTime } from "../../lib/format";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
}

export function OpsTripDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

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
    await api.post(`/trips/${trip.id}/cancel`, {});
    load();
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
            <Button variant="danger" onClick={cancel}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
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

      {photos.length > 0 ? (
        <div>
          <h3 className="mb-2 font-semibold text-ink">Fotos</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id}>
                <PhotoImage r2Key={p.r2_key} alt={PHOTO_KIND_LABEL[p.kind as PhotoKind]} className="h-32 w-full" />
                <div className="mt-1 text-xs text-ink/60">
                  {PHOTO_KIND_LABEL[p.kind as PhotoKind]} · {fmtDateTime(p.taken_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink/50">Sin fotos cargadas todavía.</p>
      )}
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
