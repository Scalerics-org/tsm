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
import { haversineKm, type LatLon } from "@shared/geo";
import { estimateFuelLiters } from "@shared/domain";
import { fetchRouteGeometry, indexAtDistance } from "../../lib/routeGeometry";

/**
 * Panel de seguimiento en vivo del chofer.
 * El GpsSubject es el "observable"; el mapa, el contador de km, la localidad,
 * el estimado de gasolina y el sincronizador son los "observadores".
 * La ruta se dibuja siguiendo las calles reales (geometría de OSRM); el camión
 * y la traza avanzan sobre esa ruta.
 */
export function LiveTracking({ trip, seedPositions }: { trip: Trip; seedPositions: TripPosition[] }) {
  const origin: LatLon = { lat: trip.origin_lat ?? -34.9, lon: trip.origin_lon ?? -56.16 };

  const [km, setKm] = useState(trip.distance_km);
  const [liters, setLiters] = useState(() =>
    estimateFuelLiters(trip.distance_km, trip.truck_consumption ?? 0),
  );
  const [remaining, setRemaining] = useState<number | null>(null);
  const [locality, setLocality] = useState<{ locality: string; department: string } | null>(null);
  const [routeGeom, setRouteGeom] = useState<LatLon[]>([]);
  const [path, setPath] = useState<LatLon[]>([]);
  const [current, setCurrent] = useState<LatLon>(origin);
  const [simulating, setSimulating] = useState(false);

  const subjectRef = useRef<GpsSubject | null>(null);
  const syncRef = useRef<SyncObserver | null>(null);
  const simTimer = useRef<number | null>(null);
  const geomRef = useRef<{ geometry: LatLon[]; cumKm: number[] } | null>(null);
  const simIdxRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let subject: GpsSubject | null = null;
    let sync: SyncObserver | null = null;
    const unsubs: (() => void)[] = [];

    async function setup() {
      const dest: LatLon | null =
        trip.dest_lat != null && trip.dest_lon != null
          ? { lat: trip.dest_lat, lon: trip.dest_lon }
          : null;

      // Ruta real por calles (OSRM). Si no hay, caemos a la traza GPS cruda.
      const rg = dest ? await fetchRouteGeometry(origin, dest) : null;
      if (disposed) return;

      let seedFixes: GpsFix[];
      if (rg) {
        geomRef.current = { geometry: rg.geometry, cumKm: rg.cumKm };
        const startIdx = indexAtDistance(rg.cumKm, trip.distance_km);
        simIdxRef.current = startIdx;
        const traveled = rg.geometry.slice(0, startIdx + 1);
        seedFixes = traveled.map((p) => ({ lat: p.lat, lon: p.lon, accuracy: 0, timestamp: Date.now() }));
        setRouteGeom(rg.geometry);
        setPath(traveled);
        setCurrent(rg.geometry[startIdx]);
        if (dest) setRemaining(Math.max(0, rg.distance_km - rg.cumKm[startIdx]));
      } else {
        // fallback: traza cruda del backend
        seedFixes = seedPositions.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          accuracy: 0,
          timestamp: Date.parse(p.recorded_at.replace(" ", "T")) || Date.now(),
        }));
        const last = seedPositions[seedPositions.length - 1];
        if (last) {
          setPath(seedPositions.map((p) => ({ lat: p.lat, lon: p.lon })));
          setCurrent({ lat: last.lat, lon: last.lon });
          if (dest) setRemaining(haversineKm({ lat: last.lat, lon: last.lon }, dest));
        }
      }

      subject = new GpsSubject(trip.distance_km, seedFixes);
      subjectRef.current = subject;
      sync = new SyncObserver(trip.id, { onSynced: (d) => setKm(d) });
      syncRef.current = sync;

      unsubs.push(
        subject.subscribe(new OdometerObserver(setKm)),
        subject.subscribe(new FuelEstimateObserver(trip.truck_consumption ?? 0, setLiters)),
        subject.subscribe(sync),
        subject.subscribe(new LocalityObserver(setLocality)),
        subject.subscribe({
          update: (u) => {
            setCurrent({ lat: u.fix.lat, lon: u.fix.lon });
            setPath(u.path.map((f) => ({ lat: f.lat, lon: f.lon })));
          },
        }),
      );
      if (dest) unsubs.push(subject.subscribe(new RemainingDistanceObserver(dest, setRemaining)));

      subject.start(); // GPS real del dispositivo
    }

    void setup();

    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      subject?.stop();
      sync?.dispose();
      if (simTimer.current) window.clearInterval(simTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  // Simulación de movimiento (para probar sin GPS real en escritorio).
  // Camina sobre la geometría de la ruta si está disponible.
  function toggleSimulation() {
    if (simulating) {
      if (simTimer.current) window.clearInterval(simTimer.current);
      setSimulating(false);
      return;
    }
    const subject = subjectRef.current;
    if (!subject) return;
    setSimulating(true);

    const geom = geomRef.current;
    simTimer.current = window.setInterval(() => {
      if (geom) {
        const stepPoints = Math.max(1, Math.round(geom.geometry.length / 60));
        const target = Math.min(geom.geometry.length - 1, simIdxRef.current + stepPoints);
        for (let i = simIdxRef.current + 1; i <= target; i++) {
          const p = geom.geometry[i];
          subject.push({ lat: p.lat, lon: p.lon, accuracy: 6, timestamp: Date.now() });
        }
        simIdxRef.current = target;
        if (target >= geom.geometry.length - 1) {
          if (simTimer.current) window.clearInterval(simTimer.current);
          setSimulating(false);
        }
      } else {
        // fallback sin geometría: interpolación recta hacia el destino
        const dest = { lat: trip.dest_lat ?? -34.46, lon: trip.dest_lon ?? -57.84 };
        const from = subject.getPath().slice(-1)[0] ?? current;
        const next: GpsFix = {
          lat: from.lat + (dest.lat - from.lat) * 0.12,
          lon: from.lon + (dest.lon - from.lon) * 0.12,
          accuracy: 8,
          timestamp: Date.now(),
        };
        subject.push(next);
        if (haversineKm(next, dest) < 1) {
          if (simTimer.current) window.clearInterval(simTimer.current);
          setSimulating(false);
        }
      }
    }, 1500);
  }

  const markers: MapPoint[] = [{ lat: current.lat, lon: current.lon, kind: "truck", label: "Camión" }];
  if (trip.origin_lat != null && trip.origin_lon != null) {
    markers.push({ lat: trip.origin_lat, lon: trip.origin_lon, kind: "origin", label: trip.origin });
  }
  if (trip.dest_lat != null && trip.dest_lon != null) {
    markers.push({ lat: trip.dest_lat, lon: trip.dest_lon, kind: "dest", label: trip.destination });
  }

  return (
    <div className="space-y-4">
      <MapView
        center={current}
        markers={markers}
        route={routeGeom}
        path={path}
        follow
        zoom={10}
        className="h-64 w-full overflow-hidden "
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Km recorridos" value={fmtKm(km)} />
        <Stat label="Km faltantes" value={remaining != null ? fmtKm(remaining) : "—"} hint="aprox. al destino" />
        <Stat label="Gasolina estim." value={fmtLiters(liters)} hint={`${trip.truck_consumption ?? 0} L/100km`} />
        <Stat
          label="Ubicación"
          value={<span className="text-base">{locality?.locality || "—"}</span>}
          hint={locality?.department || "buscando…"}
        />
      </div>

      <button
        onClick={toggleSimulation}
        className="w-full border border-ink/15 bg-surface px-4 py-2 text-sm text-ink/70 hover:bg-ink/[.06]"
      >
        {simulating ? "⏸ Detener simulación" : "▶ Simular movimiento (demo sin GPS)"}
      </button>
      <p className="text-center text-xs text-ink/45">
        El GPS real se activa automáticamente en el celular. La simulación sirve para probar en escritorio.
      </p>
    </div>
  );
}
