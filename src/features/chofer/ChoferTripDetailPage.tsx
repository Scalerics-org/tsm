import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  PHOTO_KIND,
  TRIP_STATUS,
  TRIP_STATUS_LABEL,
  type PhotoKind,
  type Trip,
  type TripPhoto,
  type TripPosition,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner, StatusBadge } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { PhotoImage } from "../../components/PhotoImage";
import { MapView } from "../../components/MapView";
import { LiveTracking } from "./LiveTracking";
import { fmtDateTime, fmtKm } from "../../lib/format";

interface TripDetail {
  trip: Trip;
  photos: TripPhoto[];
  positions: TripPosition[];
}

function getPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function uploadPhoto(tripId: number, file: File, kind: PhotoKind) {
  const pos = await getPosition();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("trip_id", String(tripId));
  fd.append("kind", kind);
  if (pos) {
    fd.append("lat", String(pos.lat));
    fd.append("lon", String(pos.lon));
  }
  fd.append("taken_at", new Date().toISOString().replace("T", " ").slice(0, 19));
  await api.upload("/photos", fd);
}

export function ChoferTripDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<TripDetail>(`/trips/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar el viaje"));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner size={28} />;

  const { trip, photos, positions } = data;

  return (
    <div className="space-y-5">
      <Link to="/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Mis viajes
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-sm text-ink/60">
            🚛 {trip.truck_plate} · {fmtDateTime(trip.scheduled_at)}
          </p>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      {trip.cargo && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-ink/60">Carga</div>
          <div className="mt-1 font-semibold text-ink">{trip.cargo.description}</div>
          <div className="text-sm text-ink/60">
            {trip.cargo.client ? `${trip.cargo.client} · ` : ""}
            {trip.cargo.weight_kg ? `${trip.cargo.weight_kg} kg` : ""}
            {trip.cargo.doc_number ? ` · ${trip.cargo.doc_number}` : ""}
          </div>
        </Card>
      )}

      {trip.status === TRIP_STATUS.PENDIENTE && <DepartureForm trip={trip} onDone={load} />}

      {trip.status === TRIP_STATUS.EN_RUTA && (
        <>
          <LiveTracking trip={trip} seedPositions={positions} />
          <ArrivalForm trip={trip} onDone={load} />
        </>
      )}

      {(trip.status === TRIP_STATUS.COMPLETADO ||
        trip.status === TRIP_STATUS.CANCELADO ||
        trip.status === TRIP_STATUS.CON_INCIDENCIA) && (
        <CompletedSummary trip={trip} photos={photos} positions={positions} />
      )}

      {(trip.status === TRIP_STATUS.PENDIENTE || trip.status === TRIP_STATUS.EN_RUTA) && (
        <IncidentForm tripId={trip.id} onDone={load} />
      )}

      {photos.length > 0 && trip.status === TRIP_STATUS.EN_RUTA && (
        <PhotoGallery photos={photos} />
      )}
    </div>
  );
}

function DepartureForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!file) {
      setError("Sacá la foto de la carga antes de confirmar la salida.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadPhoto(trip.id, file, PHOTO_KIND.CARGA_SALIDA);
      await api.post(`/trips/${trip.id}/departure`);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la salida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Registrar salida</h2>
      <p className="text-sm text-ink/60">
        Antes de partir, sacá la foto de la carga cargada. Se guarda con fecha, hora y ubicación.
      </p>
      <CameraCapture label="Foto de la carga" onChange={setFile} />
      <ErrorText>{error}</ErrorText>
      <Button variant="success" loading={busy} onClick={confirm} className="w-full">
        Confirmar salida →
      </Button>
    </Card>
  );
}

function ArrivalForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const [cargoFile, setCargoFile] = useState<File | null>(null);
  const [fuelFile, setFuelFile] = useState<File | null>(null);
  const [manualKm, setManualKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!cargoFile || !fuelFile) {
      setError("Necesitás la foto de la carga y la foto del combustible.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadPhoto(trip.id, cargoFile, PHOTO_KIND.CARGA_LLEGADA);
      await uploadPhoto(trip.id, fuelFile, PHOTO_KIND.COMBUSTIBLE);
      await api.post(`/trips/${trip.id}/arrival`, {
        manual_km: manualKm ? Number(manualKm) : undefined,
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
      <p className="text-sm text-ink/60">
        Los km se toman del GPS automáticamente. Podés cargar km a mano como respaldo si el GPS falló.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CameraCapture label="Foto de la carga" onChange={setCargoFile} />
        <CameraCapture label="Foto del combustible" onChange={setFuelFile} />
      </div>
      <Field label="Km a mano (respaldo, opcional)">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          value={manualKm}
          onChange={(e) => setManualKm(e.target.value)}
          placeholder="Ej: 72"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button variant="success" loading={busy} onClick={confirm} className="w-full">
        Confirmar llegada ✓
      </Button>
    </Card>
  );
}

function IncidentForm({ tripId, onDone }: { tripId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function report() {
    setBusy(true);
    try {
      await api.post(`/trips/${tripId}/incident`, { notes });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-st-amberTx hover:underline">
        ⚠ Reportar una incidencia
      </button>
    );
  }
  return (
    <Card className="space-y-3 border-st-amberBd">
      <h3 className="font-semibold text-st-amberTx">Reportar incidencia</h3>
      <textarea
        className="input min-h-[80px]"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Describí el problema (demora, desperfecto, carga, etc.)"
      />
      <div className="flex gap-2">
        <Button variant="danger" loading={busy} onClick={report}>
          Enviar incidencia
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

function CompletedSummary({
  trip,
  photos,
  positions,
}: {
  trip: Trip;
  photos: TripPhoto[];
  positions: TripPosition[];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-ink/60">Estado</div>
            <div className="font-semibold text-ink">{TRIP_STATUS_LABEL[trip.status]}</div>
          </div>
          <div>
            <div className="text-ink/60">Km recorridos</div>
            <div className="font-semibold text-ink">{fmtKm(trip.distance_km)}</div>
          </div>
          <div>
            <div className="text-ink/60">Salida</div>
            <div className="text-ink">{fmtDateTime(trip.departed_at)}</div>
          </div>
          <div>
            <div className="text-ink/60">Llegada</div>
            <div className="text-ink">{fmtDateTime(trip.arrived_at)}</div>
          </div>
        </div>
        {trip.notes && (
          <div className="mt-3 bg-st-amberBg p-3 text-sm text-st-amberTx">{trip.notes}</div>
        )}
      </Card>

      {positions.length > 1 && trip.dest_lat != null && (
        <MapView
          center={{ lat: positions[positions.length - 1].lat, lon: positions[positions.length - 1].lon }}
          markers={[{ lat: trip.dest_lat, lon: trip.dest_lon!, kind: "dest", label: trip.destination }]}
          path={positions.map((p) => ({ lat: p.lat, lon: p.lon }))}
          zoom={9}
        />
      )}

      {photos.length > 0 && <PhotoGallery photos={photos} />}
    </div>
  );
}

function PhotoGallery({ photos }: { photos: TripPhoto[] }) {
  const LABEL: Record<PhotoKind, string> = {
    carga_salida: "Carga (salida)",
    carga_llegada: "Carga (llegada)",
    combustible: "Combustible",
  };
  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink">Fotos</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <div key={p.id}>
            <PhotoImage r2Key={p.r2_key} alt={LABEL[p.kind]} className="h-32 w-full" />
            <div className="mt-1 text-xs text-ink/60">{LABEL[p.kind]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
