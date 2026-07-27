import type { GpsObserver, GpsUpdate, GpsFix } from "./GpsSubject";
import { haversineKm } from "@shared/geo";
import { estimateFuelLiters } from "@shared/domain";
import { api } from "../api";

/**
 * Observador que reporta los km acumulados.
 * (El contador de km "observa" al GPS.)
 */
export class OdometerObserver implements GpsObserver {
  constructor(private onKm: (totalKm: number) => void) {}
  update(u: GpsUpdate): void {
    this.onKm(u.totalKm);
  }
}

/**
 * Observador que estima la gasolina gastada = km × (L/100km) / 100.
 */
export class FuelEstimateObserver implements GpsObserver {
  constructor(
    private consumptionL100: number,
    private onLiters: (liters: number) => void,
  ) {}
  update(u: GpsUpdate): void {
    this.onLiters(estimateFuelLiters(u.totalKm, this.consumptionL100));
  }
}

/**
 * Observador que indica km faltantes al destino (línea recta, actualización local barata).
 * El ruteo preciso por OSRM se consulta aparte con menor frecuencia.
 */
export class RemainingDistanceObserver implements GpsObserver {
  constructor(
    private dest: { lat: number; lon: number },
    private onRemaining: (km: number) => void,
  ) {}
  update(u: GpsUpdate): void {
    this.onRemaining(haversineKm(u.fix, this.dest));
  }
}

/**
 * Observador de localidad/departamento (geocodificación inversa vía Nominatim proxy).
 * Debounce por distancia y tiempo para respetar los límites del servicio.
 */
export class LocalityObserver implements GpsObserver {
  private lastQueried: GpsFix | null = null;
  private lastAt = 0;
  constructor(
    private onLocality: (loc: { locality: string; department: string }) => void,
    private opts: { minMeters?: number; minMs?: number } = {},
  ) {}
  update(u: GpsUpdate): void {
    const minKm = (this.opts.minMeters ?? 400) / 1000;
    const minMs = this.opts.minMs ?? 20000;
    const now = Date.now();
    const movedEnough = !this.lastQueried || haversineKm(this.lastQueried, u.fix) >= minKm;
    const waitedEnough = now - this.lastAt >= minMs;
    if (!movedEnough && !waitedEnough) return;
    this.lastQueried = u.fix;
    this.lastAt = now;
    api
      .get<{ locality: string; department: string }>(
        `/geo/reverse?lat=${u.fix.lat}&lon=${u.fix.lon}`,
      )
      .then((r) => this.onLocality({ locality: r.locality, department: r.department }))
      .catch(() => {
        /* silencioso: la localidad es informativa */
      });
  }
}

/**
 * Observador que sincroniza posiciones con el backend, con tolerancia a mala señal:
 * acumula en un buffer, hace POST por lotes y reintenta con backoff.
 * El buffer se persiste en localStorage para sobrevivir cierres/recargas.
 */
export class SyncObserver implements GpsObserver {
  private buffer: { lat: number; lon: number; recorded_at: string }[] = [];
  private flushing = false;
  private timer: number | null = null;
  private readonly storageKey: string;

  constructor(
    private tripId: number,
    private opts: { batchSize?: number; intervalMs?: number; onSynced?: (km: number) => void } = {},
  ) {
    this.storageKey = `gps_buffer_${tripId}`;
    this.restore();
    this.schedule();
  }

  update(u: GpsUpdate): void {
    this.buffer.push({
      lat: u.fix.lat,
      lon: u.fix.lon,
      recorded_at: new Date(u.fix.timestamp).toISOString().replace("T", " ").slice(0, 19),
    });
    this.persist();
    if (this.buffer.length >= (this.opts.batchSize ?? 6)) void this.flush();
  }

  private schedule(): void {
    this.timer = window.setInterval(() => void this.flush(), this.opts.intervalMs ?? 10000);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.slice();
    try {
      const res = await api.post<{ distance_km: number }>(`/trips/${this.tripId}/positions`, {
        points: batch,
      });
      this.buffer = this.buffer.slice(batch.length);
      this.persist();
      this.opts.onSynced?.(res.distance_km);
    } catch {
      // se mantiene el buffer para reintentar en el próximo tick (backoff natural)
    } finally {
      this.flushing = false;
    }
  }

  dispose(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    void this.flush();
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.buffer));
    } catch {
      /* cuota llena: ignorar */
    }
  }
  private restore(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) this.buffer = JSON.parse(raw);
    } catch {
      /* ignorar */
    }
  }
}
