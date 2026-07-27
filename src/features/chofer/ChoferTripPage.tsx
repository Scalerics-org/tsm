import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PHOTO_KIND,
  PHOTO_KIND_LABEL,
  TRIP_STATUS,
  type PhotoKind,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { PhotoImage } from "../../components/PhotoImage";
import { fmtDateTime } from "../../lib/format";

interface Detail {
  trip: Trip;
  photos: TripPhoto[];
}

async function uploadPhoto(tripId: number, file: File, kind: string) {
  const fd = new FormData();
  fd.append("file", file);
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
  const { trip, photos } = data;

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
          <p className="text-sm text-ink/60">🚛 {trip.truck_plate}</p>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Carga" value={trip.cargo_type || "—"} />
          <Info label="Kilos" value={trip.kilos != null ? `${trip.kilos.toLocaleString("es-UY")} kg` : "—"} />
          {trip.extra_label && <Info label={trip.extra_label} value={trip.extra_value || "—"} />}
          <Info label="Salida" value={fmtDateTime(trip.started_at)} />
          {trip.finished_at && <Info label="Llegada" value={fmtDateTime(trip.finished_at)} />}
        </div>
      </Card>

      {trip.status === TRIP_STATUS.EN_CURSO && <ArrivalForm tripId={trip.id} onDone={load} />}

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

function ArrivalForm({ tripId, onDone }: { tripId: number; onDone: () => void }) {
  const [descarga, setDescarga] = useState<File | null>(null);
  const [doc, setDoc] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setError("");
    if (!descarga) return setError("Sacá la foto de la descarga.");
    setBusy(true);
    try {
      await uploadPhoto(tripId, descarga, PHOTO_KIND.DESCARGA);
      if (doc) await uploadPhoto(tripId, doc, PHOTO_KIND.DOCUMENTO);
      await api.post(`/trips/${tripId}/finish`);
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
      <CameraCapture label="Foto de la descarga" onChange={setDescarga} />
      <CameraCapture label="Documento (opcional)" onChange={setDoc} />
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
