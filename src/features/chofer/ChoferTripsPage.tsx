import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TRIP_STATUS, type Trip, type TripStatus } from "@shared/domain";
import { api } from "../../lib/api";
import { Corners, Empty, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

const ACCENT: Record<TripStatus, string> = {
  [TRIP_STATUS.PENDIENTE]: "border-l-st-amberDot",
  [TRIP_STATUS.EN_RUTA]: "border-l-st-blueDot",
  [TRIP_STATUS.COMPLETADO]: "border-l-st-greenDot",
  [TRIP_STATUS.CANCELADO]: "border-l-neutral-400",
  [TRIP_STATUS.CON_INCIDENCIA]: "border-l-st-redDot",
};

export function ChoferTripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);

  useEffect(() => {
    api.get<Trip[]>("/trips").then(setTrips).catch(() => setTrips([]));
  }, []);

  if (!trips) return <Spinner size={28} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="kicker">Mis viajes</div>
        <h1 className="text-3xl text-ink">Viajes asignados</h1>
        <p className="text-sm text-ink/60">Registrá salida y llegada con la cámara.</p>
      </div>

      {trips.length === 0 ? (
        <Empty>No tenés viajes asignados por ahora.</Empty>
      ) : (
        <div className="space-y-3">
          {trips.map((t) => (
            <Link
              key={t.id}
              to={`/viajes/${t.id}`}
              className={`panel block border-l-4 ${ACCENT[t.status]} p-4 transition hover:bg-surface`}
            >
              <Corners />
              <div className="flex items-start justify-between gap-3">
                <StatusBadge status={t.status} />
                <span className="font-cond text-sm font-semibold tracking-[0.08em] text-ink/45">
                  VJ-{String(t.id).padStart(4, "0")}
                </span>
              </div>
              <div className="mt-2 font-cond text-2xl font-semibold leading-tight text-ink">
                {t.origin} → {t.destination}
              </div>
              <div className="mt-1 text-sm text-ink/60">
                🚛 {t.truck_plate} · {fmtDateTime(t.scheduled_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
