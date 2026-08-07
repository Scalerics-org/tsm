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
import { CargasPanel } from "./CargasPanel";
import { compressImage } from "../../lib/image";
import { estimateTravel, fmtDuration } from "../../lib/eta";
import { fmtDateTime } from "../../lib/format";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
  arrival_photo_label: string | null;
  multi_renglon: boolean;
  pide_kilometros: boolean;
  viaje_vacio: boolean;
  /** Si el cierre va a exigir la foto de la carga. Lo resuelve el backend con la plantilla. */
  foto_carga_requerida: boolean;
  provider_id: number | null;
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
  const { trip, photos, arrival_photo_label, multi_renglon, provider_id } = data;
  const fields = trip.fields ?? [];
  const enCurso = trip.status === TRIP_STATUS.EN_CURSO;

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

      {trip.status === TRIP_STATUS.EN_CURSO &&
        (() => {
          const est = estimateTravel(trip.origin, trip.destination);
          if (!est) return null;
          const llegada = new Date(
            (Date.parse(trip.started_at.replace(" ", "T") + "Z") || Date.now()) + est.hours * 3_600_000,
          ).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
          return (
            <div className="border-l-4 border-l-st-blueDot bg-surface px-4 py-3">
              <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                Tiempo estimado
              </div>
              <div className="font-cond text-3xl font-semibold text-ink">{fmtDuration(est.hours)}</div>
              <div className="text-xs text-ink/55">
                ≈ {est.km} km · llegada aprox. {llegada}
              </div>
            </div>
          );
        })()}

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {trip.remite && <Info label="Remite" value={trip.remite} />}
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

      {multi_renglon && (
        <CargasPanel
          tripId={trip.id}
          providerId={provider_id}
          segments={trip.segments}
          editable={enCurso}
          onChange={load}
        />
      )}

      {/* Si la foto de la carga no llegó a subirse (mala señal en el muelle), el viaje no
          puede cerrarse. Se puede sacar de nuevo desde acá para no quedar trabado. */}
      {enCurso && data.foto_carga_requerida && !photos.some((p) => p.kind === PHOTO_KIND.CARGA) && (
        <MissingCargoPhoto tripId={trip.id} onDone={load} />
      )}

      {trip.status === TRIP_STATUS.EN_CURSO && (
        <ArrivalForm
          tripId={trip.id}
          descargaFields={fields.filter((f) => f.stage === FIELD_STAGE.DESCARGA)}
          photoLabel={arrival_photo_label}
          pideKilometros={data.pide_kilometros}
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

/** Reintento de la foto de la carga cuando no quedó guardada al iniciar el viaje. */
function MissingCargoPhoto({ tripId, onDone }: { tripId: number; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function subir() {
    if (!file) return setError("Sacá la foto de la carga.");
    setError("");
    setBusy(true);
    try {
      await uploadPhoto(tripId, file, PHOTO_KIND.CARGA);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent="amber" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">Falta la foto de la carga</h2>
        <p className="text-sm text-ink/60">
          No llegó a guardarse cuando saliste. Sacala de nuevo para poder cerrar el viaje.
        </p>
      </div>
      <CameraCapture label="Foto de la carga" onChange={setFile} />
      <ErrorText>{error}</ErrorText>
      <Button loading={busy} onClick={subir} className="w-full py-3">
        Guardar foto
      </Button>
    </Card>
  );
}

function ArrivalForm({
  tripId,
  descargaFields,
  photoLabel,
  pideKilometros,
  onDone,
}: {
  tripId: number;
  descargaFields: TemplateField[];
  photoLabel: string | null;
  pideKilometros: boolean;
  onDone: () => void;
}) {
  const [kilometros, setKilometros] = useState("");
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
    if (pideKilometros && !kilometros) return setError("Cargá los kilómetros del recorrido.");
    setBusy(true);
    try {
      if (descarga) await uploadPhoto(tripId, descarga, PHOTO_KIND.DESCARGA);
      await api.post(`/trips/${tripId}/finish`, {
        field_values: values,
        notes: notes || undefined,
        kilometros: kilometros ? Number(kilometros) : undefined,
      });
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
      {pideKilometros && (
        <Field label="Kilómetros del recorrido">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={kilometros}
            onChange={(e) => setKilometros(e.target.value)}
            placeholder="Ej: 500"
          />
        </Field>
      )}
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
