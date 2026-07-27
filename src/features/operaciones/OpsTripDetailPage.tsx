import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  PHOTO_KIND,
  TRIP_STATUS,
  estimateFuelLiters,
  type PhotoKind,
  type Trip,
  type TripPhoto,
  type TripPosition,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner, Stat, StatusBadge } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { MapView, type MapPoint } from "../../components/MapView";
import { fetchRouteGeometry } from "../../lib/routeGeometry";
import type { LatLon } from "@shared/geo";
import { fmtDateTime, fmtKm, fmtLiters } from "../../lib/format";

interface TripDetail {
  trip: Trip;
  photos: TripPhoto[];
  positions: TripPosition[];
}

const POLL_MS = 8000;

export function OpsTripDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState("");
  const [livePositions, setLivePositions] = useState<TripPosition[]>([]);
  const [liveKm, setLiveKm] = useState<number | null>(null);
  const [routeGeom, setRouteGeom] = useState<LatLon[]>([]);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(() => {
    api
      .get<TripDetail>(`/trips/${id}`)
      .then((d) => {
        setData(d);
        setLivePositions(d.positions);
        setLiveKm(d.trip.distance_km);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  }, [id]);

  useEffect(load, [load]);

  // Ruta real por calles (OSRM) para dibujarla en el mapa.
  useEffect(() => {
    const t = data?.trip;
    if (!t || t.origin_lat == null || t.origin_lon == null || t.dest_lat == null || t.dest_lon == null) return;
    let active = true;
    fetchRouteGeometry(
      { lat: t.origin_lat, lon: t.origin_lon },
      { lat: t.dest_lat, lon: t.dest_lon },
    ).then((rg) => {
      if (active && rg) setRouteGeom(rg.geometry);
    });
    return () => {
      active = false;
    };
  }, [data?.trip.id, data?.trip.origin_lat, data?.trip.dest_lat]);

  // Poll de posiciones mientras el viaje está EN_RUTA.
  useEffect(() => {
    if (data?.trip.status !== TRIP_STATUS.EN_RUTA) return;
    pollRef.current = window.setInterval(() => {
      api
        .get<{ positions: TripPosition[]; distance_km: number }>(`/trips/${id}/positions`)
        .then((r) => {
          setLivePositions(r.positions);
          setLiveKm(r.distance_km);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [data?.trip.status, id]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner size={28} />;

  const { trip, photos } = data;
  const km = liveKm ?? trip.distance_km;
  const estimatedLiters = estimateFuelLiters(km, trip.truck_consumption ?? 0);
  const fuelPhoto = photos.find((p) => p.kind === PHOTO_KIND.COMBUSTIBLE);
  const last = livePositions[livePositions.length - 1];

  const markers: MapPoint[] = [];
  if (last) markers.push({ lat: last.lat, lon: last.lon, kind: "truck", label: "Camión" });
  if (trip.dest_lat != null) markers.push({ lat: trip.dest_lat, lon: trip.dest_lon!, kind: "dest", label: trip.destination });

  const center = last
    ? { lat: last.lat, lon: last.lon }
    : { lat: trip.origin_lat ?? -34.9, lon: trip.origin_lon ?? -56.16 };

  async function cancel() {
    if (!confirm("¿Cancelar este viaje?")) return;
    await api.post(`/trips/${trip.id}/cancel`);
    load();
  }

  return (
    <div className="space-y-5">
      <Link to="/panel/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.driver_name} · 🚛 {trip.truck_plate} · {fmtDateTime(trip.scheduled_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={trip.status} />
          {trip.status === TRIP_STATUS.PENDIENTE && (
            <Link to={`/panel/viajes/${trip.id}/editar`} className="btn btn-secondary">
              Editar
            </Link>
          )}
          {(trip.status === TRIP_STATUS.PENDIENTE || trip.status === TRIP_STATUS.EN_RUTA) && (
            <Button variant="danger" onClick={cancel}>
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {(livePositions.length > 0 || trip.dest_lat != null) && (
        <div className="relative">
          {trip.status === TRIP_STATUS.EN_RUTA && (
            <span className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 bg-navy px-3 py-1 font-cond text-xs font-semibold uppercase tracking-[0.1em] text-bg">
              <span className="h-2 w-2 animate-fl bg-st-greenDot" /> En vivo
            </span>
          )}
          <MapView
            center={center}
            markers={markers}
            route={routeGeom}
            path={livePositions.map((p) => ({ lat: p.lat, lon: p.lon }))}
            follow={trip.status === TRIP_STATUS.EN_RUTA}
            zoom={9}
            className="h-72 w-full overflow-hidden "
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Km recorridos" value={fmtKm(km)} />
        <Stat label="Gasolina estimada" value={fmtLiters(estimatedLiters)} hint={`${trip.truck_consumption ?? 0} L/100km`} />
        <Stat label="Salida" value={<span className="text-base">{fmtDateTime(trip.departed_at)}</span>} />
        <Stat label="Llegada" value={<span className="text-base">{fmtDateTime(trip.arrived_at)}</span>} />
      </div>

      {trip.cargo && (
        <Card>
          <div className="text-xs uppercase tracking-wide text-ink/60">Carga</div>
          <div className="mt-1 font-semibold text-ink">{trip.cargo.description}</div>
          <div className="text-sm text-ink/60">
            {trip.cargo.client ? `${trip.cargo.client} · ` : ""}
            {trip.cargo.weight_kg ? `${trip.cargo.weight_kg} kg` : ""}
            {trip.cargo.type ? ` · ${trip.cargo.type}` : ""}
          </div>
        </Card>
      )}

      {trip.notes && (
        <Card className="border-st-amberBd">
          <div className="text-xs uppercase tracking-wide text-st-amberTx">Observaciones / incidencia</div>
          <p className="mt-1 text-sm text-st-amberTx">{trip.notes}</p>
        </Card>
      )}

      {/* Comparación gasolina estimada vs. litros reales vs. foto */}
      <Card>
        <h2 className="mb-3 font-semibold text-ink">Combustible: estimado vs. real</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="border-l-4 border-l-st-blueDot bg-surface p-4">
            <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-700">
              Estimado del sistema
            </div>
            <div className="mt-1 font-cond text-3xl font-semibold text-ink">{fmtLiters(estimatedLiters)}</div>
            <div className="mt-1 text-xs text-ink/45">
              {fmtKm(km)} × {trip.truck_consumption ?? 0} L/100km
            </div>
          </div>

          <div className="border-l-4 border-l-st-greenDot bg-surface p-4">
            <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-st-greenTx">
              Cargado por el chofer
            </div>
            {trip.actual_liters != null ? (
              <>
                <div className="mt-1 font-cond text-3xl font-semibold text-ink">
                  {fmtLiters(trip.actual_liters)}
                </div>
                <FuelDiff estimated={estimatedLiters} actual={trip.actual_liters} />
              </>
            ) : (
              <div className="mt-2 text-sm text-ink/45">Sin registro de litros</div>
            )}
          </div>

          <div>
            <div className="mb-1 font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
              Foto (evidencia)
            </div>
            {fuelPhoto ? (
              <PhotoImage r2Key={fuelPhoto.r2_key} alt="Combustible" className="h-32 w-full" />
            ) : (
              <div className="flex h-32 items-center justify-center border border-dashed border-ink/25 text-ink/45">
                Sin foto
              </div>
            )}
          </div>
        </div>
      </Card>

      <PhotoGallery photos={photos} />
    </div>
  );
}

function FuelDiff({ estimated, actual }: { estimated: number; actual: number }) {
  if (estimated <= 0) return null;
  const diff = actual - estimated;
  const pct = (diff / estimated) * 100;
  const over = pct > 8; // consumo real por encima de lo esperado
  const under = pct < -8;
  const cls = over ? "text-st-redTx" : under ? "text-st-amberTx" : "text-st-greenTx";
  const sign = diff >= 0 ? "+" : "";
  return (
    <div className={`mt-1 font-cond text-sm font-semibold ${cls}`}>
      {sign}
      {diff.toFixed(1)} L ({sign}
      {pct.toFixed(0)}%) {over ? "· sobreconsumo" : under ? "· bajo lo esperado" : "· ok"}
    </div>
  );
}

function PhotoGallery({ photos }: { photos: TripPhoto[] }) {
  const LABEL: Record<PhotoKind, string> = {
    carga_salida: "Carga (salida)",
    carga_llegada: "Carga (llegada)",
    combustible: "Combustible",
  };
  if (photos.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink">Todas las fotos</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p) => (
          <div key={p.id}>
            <PhotoImage r2Key={p.r2_key} alt={LABEL[p.kind]} className="h-32 w-full" />
            <div className="mt-1 text-xs text-ink/60">
              {LABEL[p.kind]} · {fmtDateTime(p.taken_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
