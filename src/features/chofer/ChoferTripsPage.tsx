import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Trip } from "@shared/domain";
import { api } from "../../lib/api";
import { Empty, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

export function ChoferTripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);

  useEffect(() => {
    api.get<Trip[]>("/trips").then(setTrips).catch(() => setTrips([]));
  }, []);

  if (!trips) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Mis viajes</h1>
        <p className="text-sm text-slate-400">Registrá salida y llegada con la cámara.</p>
      </div>

      {trips.length === 0 ? (
        <Empty>No tenés viajes asignados por ahora.</Empty>
      ) : (
        <div className="space-y-3">
          {trips.map((t) => (
            <Link
              key={t.id}
              to={`/viajes/${t.id}`}
              className="card block p-4 transition hover:border-brand-500/40 hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-white">
                    {t.origin} → {t.destination}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-400">
                    🚛 {t.truck_plate} · {fmtDateTime(t.scheduled_at)}
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
