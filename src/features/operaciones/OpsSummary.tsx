import { useEffect, useState } from "react";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Corners, Spinner, Stat } from "../../components/ui";

interface Summary {
  totals: { trips: number; en_curso: number; completados: number; surtidas: number };
  byTruck: {
    truck_id: number;
    plate: string;
    trips: number;
    completed: number;
    tons: number;
    km: number;
    liters: number;
    consumption_l100: number | null;
  }[];
}

export function OpsSummary() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    api.get<Summary>("/reports/summary").then(setS).catch(() => setS(null));
  }, []);

  if (!s) return <Spinner size={28} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Panel</div>
          <h1 className="text-3xl text-ink">Resumen de operaciones</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadFile("/reports/trips.csv", "viajes.csv")}>
            ⬇ Viajes (Excel)
          </Button>
          <Button variant="secondary" onClick={() => downloadFile("/reports/fuel.csv", "surtidas.csv")}>
            ⬇ Surtidas (Excel)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="En curso" value={s.totals.en_curso} />
        <Stat label="Completados" value={s.totals.completados} accent="green" />
        <Stat label="Viajes (período)" value={s.totals.trips} />
        <Stat label="Surtidas" value={s.totals.surtidas} accent="amber" />
      </div>

      <Card className="overflow-x-auto p-0">
        <Corners />
        <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">
          Por camión
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-3">Camión</th>
              <th className="px-4 py-3 text-right">Viajes</th>
              <th className="px-4 py-3 text-right">Toneladas</th>
              <th className="px-4 py-3 text-right">Km</th>
              <th className="px-4 py-3 text-right">Litros</th>
              <th className="px-4 py-3 text-right">L/100km</th>
            </tr>
          </thead>
          <tbody>
            {s.byTruck.map((t) => (
              <tr key={t.truck_id} className="border-b border-ink/10">
                <td className="px-4 py-3 font-medium text-ink">{t.plate}</td>
                <td className="px-4 py-3 text-right text-ink/70">
                  {t.completed}/{t.trips}
                </td>
                <td className="px-4 py-3 text-right text-ink/70">{t.tons} t</td>
                <td className="px-4 py-3 text-right text-ink/70">{t.km.toLocaleString("es-UY")}</td>
                <td className="px-4 py-3 text-right text-ink/70">{t.liters.toLocaleString("es-UY")}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">
                  {t.consumption_l100 != null ? t.consumption_l100 : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
