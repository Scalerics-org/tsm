import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Driver, Trip } from "@shared/domain";
import { api } from "../../lib/api";
import { Card, Corners, Spinner, Stat, StatusBadge } from "../../components/ui";
import { fmtDate, fmtDateTime } from "../../lib/format";

interface Ficha {
  driver: Driver;
  trips: Trip[];
  stats: { total: number; completed: number; tons: number; withPhoto: number; withoutPhoto: number };
}

export function DriverDetailPage() {
  const { id } = useParams();
  const [d, setD] = useState<Ficha | null>(null);

  useEffect(() => {
    api.get<Ficha>(`/reports/driver/${id}`).then(setD).catch(() => setD(null));
  }, [id]);

  if (!d) return <Spinner size={28} />;
  const { driver, stats } = d;

  return (
    <div className="space-y-5">
      <Link to="/panel" className="text-sm text-ink/60 hover:text-ink">
        ← Resumen
      </Link>
      <div>
        <div className="kicker">Chofer</div>
        <h1 className="text-3xl text-ink">{driver.name}</h1>
        <p className="text-sm text-ink/60">
          {driver.document} · 🚛 {driver.default_truck_plate ?? "sin camión"} · licencia vence {fmtDate(driver.license_expiry)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Viajes" value={stats.total} accent="blue" />
        <Stat label="Completados" value={stats.completed} accent="green" />
        <Stat label="Toneladas" value={`${stats.tons} t`} />
        <Stat
          label="Sin foto"
          value={stats.withoutPhoto}
          accent={stats.withoutPhoto > 0 ? "amber" : "green"}
          hint={`${stats.withPhoto} con foto`}
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <Corners />
        <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Viajes</div>
        <table className="w-full min-w-[560px] text-sm">
          <tbody>
            {d.trips.map((t) => (
              <tr key={t.id} className="border-b border-ink/10">
                <td className="px-4 py-2">
                  <Link to={`/panel/viajes/${t.id}`} className="text-ink hover:text-brand-700">
                    {t.origin} → {t.destination}
                  </Link>
                  <div className="text-xs text-ink/50">{t.provider_name} · 🚛 {t.truck_plate}</div>
                </td>
                <td className="px-4 py-2 text-ink/60">{fmtDateTime(t.started_at)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
            {d.trips.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink/50">Sin viajes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
