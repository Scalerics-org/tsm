import { useEffect, useState } from "react";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Corners, Spinner, Stat } from "../../components/ui";

interface MonthRow {
  month: string;
  km: number;
  liters: number;
  l100: number | null;
  closed: boolean;
}
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
  monthlyByTruck: { truck_id: number; plate: string; months: MonthRow[] }[];
}

const MONTH_NAMES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
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

      {s.monthlyByTruck.length > 0 && (
        <Card>
          <Corners />
          <h2 className="mb-1 font-cond text-lg font-semibold text-ink">Consumo mensual por camión</h2>
          <p className="mb-3 text-xs text-ink/50">
            Cada mes se cierra con la primera surtida del mes siguiente. El mes en curso queda abierto.
          </p>
          <div className="space-y-4">
            {s.monthlyByTruck.map((t) => (
              <div key={t.truck_id}>
                <div className="mb-1 font-cond text-sm font-semibold uppercase tracking-[0.08em] text-brand-700">
                  {t.plate}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {t.months.map((m) => (
                    <div key={m.month} className="border-l-4 border-l-st-blueDot bg-surface px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                          {monthLabel(m.month)}
                        </span>
                        <span
                          className={`font-cond text-[10px] font-semibold uppercase tracking-[0.1em] ${
                            m.closed ? "text-st-greenTx" : "text-st-amberTx"
                          }`}
                        >
                          {m.closed ? "cerrado" : "en curso"}
                        </span>
                      </div>
                      <div className="mt-0.5 font-cond text-2xl font-semibold text-ink">
                        {m.l100 != null ? `${m.l100} L/100km` : "—"}
                      </div>
                      <div className="text-xs text-ink/55">
                        {m.liters.toLocaleString("es-UY")} L · {m.km.toLocaleString("es-UY")} km
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
