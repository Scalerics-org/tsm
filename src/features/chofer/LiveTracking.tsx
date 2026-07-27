import { useEffect, useRef, useState } from "react";
import type { Trip, TripPosition } from "@shared/domain";
import { GpsSubject, type GpsFix } from "../../lib/gps/GpsSubject";
import {
  OdometerObserver,
  FuelEstimateObserver,
  RemainingDistanceObserver,
  LocalityObserver,
  SyncObserver,
} from "../../lib/gps/observers";
import { MapView, type MapPoint } from "../../components/MapView";
import { Stat } from "../../components/ui";
import { fmtKm, fmtLiters } from "../../lib/format";
import { haversineKm } from "@shared/geo";
import { estimateFuelLiters } from "@shared/domain";

/**
 * Panel de seguimiento en vivo del chofer.
 * El GpsSubject es el "observable"; el mapa, el contador de km, la localidad,
 * el estimado de gasolina y el sincronizador son los "observadores".
 */
export function LiveTracking({ trip, seedPositions }: { trip: Trip; seedPositions: TripPosition[] }) {
  const [km, setKm] = useState(trip.distance_km);
  const [liters, setLiters] = useState(() =>
    estimateFuelLiters(trip.distance_km, trip.truck_consumption ?? 0),
  );
  const [remaining, setRemaining] = useState<number | null>(() => {
    const lastPos = seedPositions[seedPositions.length - 1];
    if (!lastPos || trip.dest_lat == null || trip.dest_lon == null) return null;
    return haversineKm({ lat: lastPos.lat, lon: lastPos.lon }, { lat: trip.dest_lat, lon: trip.dest_lon });
  });
  const [locality, setLocality] = useState<{ locality: string; department: string } | null>(null);
  const [path, setPath] = useState<{ lat: number; lon: number }[]>(
    seedPositions.map((p) => ({ lat: p.lat, lon: p.lon })),
  );
  const [current, setCurrent] = useState<{ lat: number; lon: number }>(
    seedPositions.length
      ? { lat: seedPositions[seedPositions.length - 1].lat, lon: seedPositions[seedPositions.length - 1].lon }
      : { lat: trip.origin_lat ?? -34.9, lon: trip.origin_lon ?? -56.16 },
  );
  const [simulating, setSimulating] = useState(false);

  const subjectRef = useRef<GpsSubject | null>(null);
  const syncRef = useRef<SyncObserver | null>(null);
  const simTimer = useRef<number | null>(null);

  useEffect(() => {
    const seedPath: GpsFix[] = seedPositions.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      accuracy: 0,
      timestamp: Date.parse(p.recorded_at.replace(" ", "T")) || Date.now(),
    }));
    const subject = new GpsSubject(trip.distance_km, seedPath);
    subjectRef.current = subject;

    const dest = { lat: trip.dest_lat ?? current.lat, lon: trip.dest_lon ?? current.lon };
    const sync = new SyncObserver(trip.id, { onSynced: (d) => setKm(d) });
    syncRef.current = sync;

    const unsubs = [
      subject.subscribe(new OdometerObserver(setKm)),
      subject.subscribe(new FuelEstimateObserver(trip.truck_consumption ?? 0, setLiters)),
      subject.subscribe(new RemainingDistanceObserver(dest, setRemaining)),
      subject.subscribe(new LocalityObserver(setLocality)),
      subject.subscribe(sync),
      subject.subscribe({
        update: (u) => {
          setCurrent({ lat: u.fix.lat, lon: u.fix.lon });
          setPath(u.path.map((f) => ({ lat: f.lat, lon: f.lon })));
        },
      }),
    ];

    subject.start(); // GPS real del dispositivo

    return () => {
      unsubs.forEach((u) => u());
      subject.stop();
      sync.dispose();
      if (simTimer.current) window.clearInterval(simTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Simulación de movimiento hacia el destino (para probar sin GPS real / en escritorio).
  function toggleSimulation() {
    if (simulating) {
      if (simTimer.current) window.clearInterval(simTimer.current);
      setSimulating(false);
      return;
    }
    const subject = subjectRef.current;
    if (!subject) return;
    setSimulating(true);
    simTimer.current = window.setInterval(() => {
      const dest = { lat: trip.dest_lat ?? -34.46, lon: trip.dest_lon ?? -57.84 };
      const from = subject.getPath().slice(-1)[0] ?? { lat: current.lat, lon: current.lon };
      const step = 0.12; // fracción del tramo restante por tick
      const next: GpsFix = {
        lat: from.lat + (dest.lat - from.lat) * step,
        lon: from.lon + (dest.lon - from.lon) * step,
        accuracy: 8,
        timestamp: Date.now(),
      };
      subject.push(next);
      if (haversineKm(next, dest) < 1) {
        if (simTimer.current) window.clearInterval(simTimer.current);
        setSimulating(false);
      }
    }, 1500);
  }

  const markers: MapPoint[] = [{ lat: current.lat, lon: current.lon, kind: "truck", label: "Camión" }];
  if (trip.dest_lat != null && trip.dest_lon != null) {
    markers.push({ lat: trip.dest_lat, lon: trip.dest_lon, kind: "dest", label: trip.destination });
  }

  return (
    <div className="space-y-4">
      <MapView center={current} markers={markers} path={path} follow zoom={10} className="h-64 w-full overflow-hidden rounded-2xl" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Km recorridos" value={fmtKm(km)} />
        <Stat label="Km faltantes" value={remaining != null ? fmtKm(remaining) : "—"} hint="línea recta" />
        <Stat label="Gasolina estim." value={fmtLiters(liters)} hint={`${trip.truck_consumption ?? 0} L/100km`} />
        <Stat
          label="Ubicación"
          value={<span className="text-base">{locality?.locality || "—"}</span>}
          hint={locality?.department || "buscando…"}
        />
      </div>

      <button
        onClick={toggleSimulation}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
      >
        {simulating ? "⏸ Detener simulación" : "▶ Simular movimiento (demo sin GPS)"}
      </button>
      <p className="text-center text-xs text-slate-500">
        El GPS real se activa automáticamente en el celular. La simulación sirve para probar en escritorio.
      </p>
    </div>
  );
}
