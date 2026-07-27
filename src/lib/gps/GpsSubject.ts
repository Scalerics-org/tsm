import { haversineKm, isPlausibleStep, type LatLon } from "@shared/geo";

export interface GpsFix {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

/** Notificación que el sujeto emite a cada observador en cada nueva posición. */
export interface GpsUpdate {
  fix: GpsFix;
  totalKm: number; // km acumulados desde el inicio del seguimiento
  deltaKm: number; // km del último tramo
  path: GpsFix[]; // traza completa hasta ahora
}

export interface GpsObserver {
  update(u: GpsUpdate): void;
}

/**
 * Sujeto/Observable del patrón Observer.
 * Envuelve navigator.geolocation.watchPosition. En cada fix acumula km
 * (Haversine, descartando ruido/outliers) y notifica a todos los observadores.
 * Los observadores (mapa, odómetro, localidad, estimado de gasolina, sync)
 * se suscriben y reaccionan sin conocerse entre sí.
 */
export class GpsSubject {
  private observers = new Set<GpsObserver>();
  private path: GpsFix[] = [];
  private totalKm = 0;
  private watchId: number | null = null;
  private last: LatLon | null = null;

  constructor(initialKm = 0, seedPath: GpsFix[] = []) {
    this.totalKm = initialKm;
    this.path = [...seedPath];
    this.last = seedPath.length ? seedPath[seedPath.length - 1] : null;
  }

  subscribe(o: GpsObserver): () => void {
    this.observers.add(o);
    return () => this.observers.delete(o);
  }

  getTotalKm(): number {
    return this.totalKm;
  }

  getPath(): GpsFix[] {
    return this.path;
  }

  /** Punto de entrada de una nueva posición (llamado por watchPosition o manualmente en tests/demo). */
  push(fix: GpsFix): void {
    const plausible = isPlausibleStep(this.last, fix, { minMeters: 15, maxJumpKm: 30 });
    let delta = 0;
    if (plausible) {
      if (this.last) delta = haversineKm(this.last, fix);
      this.totalKm += delta;
      this.path.push(fix);
      this.last = { lat: fix.lat, lon: fix.lon };
    } else if (!this.last) {
      // primer punto
      this.path.push(fix);
      this.last = { lat: fix.lat, lon: fix.lon };
    }
    const update: GpsUpdate = {
      fix,
      totalKm: this.totalKm,
      deltaKm: delta,
      path: this.path,
    };
    for (const o of this.observers) o.update(update);
  }

  start(): void {
    if (this.watchId != null) return;
    if (!("geolocation" in navigator)) {
      console.warn("Geolocalización no disponible en este dispositivo");
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.push({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => console.warn("Error de GPS:", err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  stop(): void {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
