import { useEffect, useMemo, useState } from "react";
import { AvisosCard } from "./AvisosCard";
import { Link } from "react-router-dom";
import { fmtConsumo } from "@shared/domain";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Corners, Spinner, Stat } from "../../components/ui";

interface MonthRow {
  month: string;
  km: number;
  liters: number;
  kml: number | null;
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
    consumption_kml: number | null;
  }[];
  byProvider: { name: string; trips: number; completed: number; tons: number }[];
  monthlyByTruck: { truck_id: number; plate: string; months: MonthRow[] }[];
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
}

export function OpsSummary() {
  const [s, setS] = useState<Summary | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    const q = p.toString();
    return q ? `?${q}` : "";
  }, [range]);

  useEffect(() => {
    setS(null);
    api.get<Summary>(`/reports/summary${query}`).then(setS).catch(() => setS(null));
  }, [query]);

  return (
    <div className="space-y-6">
      <AvisosCard />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Panel</div>
          <h1 className="text-3xl text-ink">Resumen de operaciones</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink/60">
            Desde
            <input type="date" className="input mt-1" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="text-xs text-ink/60">
            Hasta
            <input type="date" className="input mt-1" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
          <Button variant="secondary" onClick={() => downloadFile(`/reports/trips.csv${query}`, "viajes.csv")}>
            ⬇ Viajes
          </Button>
          <Button variant="secondary" onClick={() => downloadFile(`/reports/fuel.csv${query}`, "surtidas.csv")}>
            ⬇ Surtidas
          </Button>
        </div>
      </div>

      {!s ? (
        <Spinner size={28} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="En curso" value={s.totals.en_curso} />
            <Stat label="Completados" value={s.totals.completados} accent="green" />
            <Stat label="Viajes (período)" value={s.totals.trips} />
            <Stat label="Surtidas" value={s.totals.surtidas} accent="amber" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Por camión */}
            <Card className="overflow-x-auto p-0">
              <Corners />
              <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Por camión</div>
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-ink/60">
                  <tr className="border-b border-ink/15">
                    <th className="px-4 py-3">Camión</th>
                    <th className="px-4 py-3 text-right">Viajes</th>
                    <th className="px-4 py-3 text-right">Ton</th>
                    <th className="px-4 py-3 text-right">Km</th>
                    <th className="px-4 py-3 text-right">km/L</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byTruck.map((t) => (
                    <tr key={t.truck_id} className="border-b border-ink/10">
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/panel/camion/${t.truck_id}`} className="text-ink hover:text-brand-700">
                          {t.plate}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-ink/70">
                        {t.completed}/{t.trips}
                      </td>
                      <td className="px-4 py-3 text-right text-ink/70">{t.tons}</td>
                      <td className="px-4 py-3 text-right text-ink/70">{t.km.toLocaleString("es-UY")}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {fmtConsumo(t.consumption_kml)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Por cliente */}
            <Card className="overflow-x-auto p-0">
              <Corners />
              <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Por cliente</div>
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-ink/60">
                  <tr className="border-b border-ink/15">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Viajes</th>
                    <th className="px-4 py-3 text-right">Ton</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {s.byProvider.map((p) => (
                    <tr key={p.name} className="border-b border-ink/10">
                      <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-4 py-3 text-right text-ink/70">
                        {p.completed}/{p.trips}
                      </td>
                      <td className="px-4 py-3 text-right text-ink/70">{p.tons}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="text-brand-700 hover:underline"
                          onClick={() =>
                            downloadFile(
                              `/reports/trips.csv?provider=${encodeURIComponent(p.name)}${range.from ? `&from=${range.from}` : ""}${range.to ? `&to=${range.to}` : ""}`,
                              `viajes-${p.name}.csv`,
                            )
                          }
                        >
                          ⬇ Excel
                        </button>
                      </td>
                    </tr>
                  ))}
                  {s.byProvider.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-ink/50" colSpan={4}>
                        Sin viajes en el período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>

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
                    <Link
                      to={`/panel/camion/${t.truck_id}`}
                      className="mb-1 inline-block font-cond text-sm font-semibold uppercase tracking-[0.08em] text-brand-700 hover:underline"
                    >
                      {t.plate} →
                    </Link>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {t.months.map((m) => (
                        <div key={m.month} className="border-l-4 border-l-st-blueDot bg-surface px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                              {monthLabel(m.month)}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase ${m.closed ? "text-st-greenTx" : "text-st-amberTx"}`}>
                              {m.closed ? "cerrado" : "en curso"}
                            </span>
                          </div>
                          <div className="font-cond text-2xl font-semibold text-ink">
                            {m.kml != null ? `${fmtConsumo(m.kml)} km/L` : "—"}
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
        </>
      )}
    </div>
  );
}
