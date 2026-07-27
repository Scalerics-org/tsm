import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FIELD_STAGE,
  PHOTO_KIND,
  PHOTO_KIND_LABEL,
  TRIP_STATUS,
  type PhotoKind,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner, StatusBadge } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { PhotoImage } from "../../components/PhotoImage";
import { compressImage } from "../../lib/image";
import { fmtDateTime } from "../../lib/format";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
  arrival_photo_label: string | null;
}

async function uploadPhoto(tripId: number, file: File, kind: string) {
  const fd = new FormData();
  fd.append("file", await compressImage(file));
  fd.append("trip_id", String(tripId));
  fd.append("kind", kind);
  await api.upload("/photos", fd);
}

export function ChoferTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const { trip, photos, arrival_photo_label } = data;
  const fields = trip.fields ?? [];

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Inicio
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="kicker">{trip.provider_name}</div>
          <h1 className="text-2xl text-ink">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.destinatario ? `${trip.destinatario} · ` : ""}🚛 {trip.truck_plate}
          </p>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {fields.map((f) => (
            <Info key={f.key} label={f.label} value={trip.field_values[f.key] || "—"} />
          ))}
          <Info label="Salida" value={fmtDateTime(trip.started_at)} />
          {trip.finished_at && <Info label="Llegada" value={fmtDateTime(trip.finished_at)} />}
        </div>
        {trip.notes && (
          <div className="mt-3 border-l-4 border-brand bg-surface p-3 text-sm text-ink/80">
            <span className="font-semibold">Observaciones:</span> {trip.notes}
          </div>
        )}
      </Card>

      {trip.status === TRIP_STATUS.EN_CURSO && (
        <ArrivalForm
          tripId={trip.id}
          descargaFields={fields.filter((f) => f.stage === FIELD_STAGE.DESCARGA)}
          photoLabel={arrival_photo_label}
          onDone={load}
        />
      )}

      {photos.length > 0 && <Gallery photos={photos} />}

      {trip.status === TRIP_STATUS.EN_CURSO && (
        <button
          onClick={async () => {
            if (!confirm("¿Cancelar este viaje?")) return;
            await api.post(`/trips/${trip.id}/cancel`, {});
            navigate("/");
          }}
          className="text-sm text-st-redTx hover:underline"
        >
          Cancelar viaje
        </button>
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

function ArrivalForm({
  tripId,
  descargaFields,
  photoLabel,
  onDone,
}: {
  tripId: number;
  descargaFields: TemplateField[];
  photoLabel: string | null;
  onDone: () => void;
}) {
  const [descarga, setDescarga] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoRequired = !!photoLabel;

  async function confirm() {
    setError("");
    for (const f of descargaFields) {
      if (f.required && !String(values[f.key] ?? "").trim()) return setError(`Cargá ${f.label}.`);
    }
    if (photoRequired && !descarga) return setError(`Sacá la foto: ${photoLabel}.`);
    setBusy(true);
    try {
      if (descarga) await uploadPhoto(tripId, descarga, PHOTO_KIND.DESCARGA);
      await api.post(`/trips/${tripId}/finish`, { field_values: values, notes: notes || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la llegada");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Registrar llegada</h2>
      {descargaFields.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? "" : " (opcional)"}`}>
          <input
            className="input"
            type={f.type === "numero" ? "number" : "text"}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        </Field>
      ))}
      <CameraCapture
        label={photoLabel ? `Foto: ${photoLabel}` : "Foto de descarga (opcional)"}
        onChange={setDescarga}
      />
      <Field label="Observaciones (opcional)">
        <textarea
          className="input min-h-[70px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dejá cualquier comentario, como lo hacés por mensaje."
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button variant="success" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Confirmar llegada ✓
      </Button>
    </Card>
  );
}

function Gallery({ photos }: { photos: TripPhoto[] }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink">Fotos</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <div key={p.id}>
            <PhotoImage r2Key={p.r2_key} alt={PHOTO_KIND_LABEL[p.kind as PhotoKind]} className="h-32 w-full" />
            <div className="mt-1 text-xs text-ink/60">{PHOTO_KIND_LABEL[p.kind as PhotoKind]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
