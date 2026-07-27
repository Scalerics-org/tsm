import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Spinner, Stat } from "../../components/ui";
import { fmtDateTime, fmtKm, fmtLiters } from "../../lib/format";

interface Summary {
  byStatus: {
    pendiente: number;
    en_ruta: number;
    completado: number;
    cancelado: number;
    con_incidencia: number;
  };
  byTruck: { truck_id: number; plate: string; km: number; estimated_liters: number }[];
  byDriver: { driver_id: number; name: string; km: number; trips: number }[];
  delayed: {
    id: number;
    origin: string;
    destination: string;
    scheduled_at: string;
    status: string;
    driver_name: string;
  }[];
}

export function OpsDashboard() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    api.get<Summary>("/reports/summary").then(setS).catch(() => setS(null));
  }, []);

  if (!s) return <Spinner size={28} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Panel de operaciones</h1>
        <p className="text-sm text-ink/60">Estado de la flota en tiempo real.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="En ruta" value={s.byStatus.en_ruta} />
        <Stat label="Pendientes" value={s.byStatus.pendiente} />
        <Stat label="Completados" value={s.byStatus.completado} />
        <Stat label="Con incidencia" value={s.byStatus.con_incidencia} />
        <Stat label="Cancelados" value={s.byStatus.cancelado} />
      </div>

      {s.delayed.length > 0 && (
        <Card className="border-st-amberBd">
          <h2 className="mb-2 font-semibold text-st-amberTx">⚠ Viajes atrasados o sin registro</h2>
          <div className="space-y-2">
            {s.delayed.map((d) => (
              <Link
                key={d.id}
                to={`/panel/viajes/${d.id}`}
                className="flex items-center justify-between bg-surface px-3 py-2 text-sm hover:bg-surface"
              >
                <span className="text-ink">
                  {d.origin} → {d.destination}
                </span>
                <span className="text-ink/60">
                  {d.driver_name} · programado {fmtDateTime(d.scheduled_at)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-ink">Km y combustible estimado por camión</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-ink/60">
              <tr>
                <th className="pb-2">Camión</th>
                <th className="pb-2 text-right">Km</th>
                <th className="pb-2 text-right">Gasolina estim.</th>
              </tr>
            </thead>
            <tbody>
              {s.byTruck.map((t) => (
                <tr key={t.truck_id} className="border-t border-ink/10">
                  <td className="py-2 font-medium text-ink">{t.plate}</td>
                  <td className="py-2 text-right text-ink/70">{fmtKm(t.km)}</td>
                  <td className="py-2 text-right text-ink/70">{fmtLiters(t.estimated_liters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-ink">Ranking de choferes</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-ink/60">
              <tr>
                <th className="pb-2">Chofer</th>
                <th className="pb-2 text-right">Viajes</th>
                <th className="pb-2 text-right">Km</th>
              </tr>
            </thead>
            <tbody>
              {s.byDriver.map((d) => (
                <tr key={d.driver_id} className="border-t border-ink/10">
                  <td className="py-2 font-medium text-ink">{d.name}</td>
                  <td className="py-2 text-right text-ink/70">{d.trips}</td>
                  <td className="py-2 text-right text-ink/70">{fmtKm(d.km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
