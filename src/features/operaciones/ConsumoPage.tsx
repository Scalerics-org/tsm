import { useEffect, useMemo, useState } from "react";
import { fmtConsumo } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Card, Corners, ErrorDeCarga, Spinner } from "../../components/ui";
import { FechaInput } from "../../components/FechaInput";

interface MesDeConsumo {
  month: string;
  km: number;
  liters: number;
  kml: number | null;
  closed: boolean;
}
interface CamionConsumo {
  plate: string;
  expected_kml: number;
  km: number;
  liters: number;
  consumption_kml: number | null;
  months: MesDeConsumo[];
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
}

/**
 * El consumo por camión, para quien sólo mira (y para la oficina).
 *
 * No escribe nada ni lleva a ninguna otra pantalla: el "solo mirar" no puede abrir la ficha de
 * un camión, así que las patentes son texto y no un enlace. Los números salen de
 * `/reports/consumo`, que es la misma cuenta del Resumen.
 */
export function ConsumoPage() {
  const [camiones, setCamiones] = useState<CamionConsumo[] | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });
  const [falló, setFalló] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    const q = p.toString();
    return q ? `?${q}` : "";
  }, [range]);

  useEffect(() => {
    let vigente = true;
    setCamiones(null);
    setFalló(null);
    api
      .get<{ camiones: CamionConsumo[] }>(`/reports/consumo${query}`)
      .then((r) => vigente && setCamiones(r.camiones))
      .catch((e) => vigente && setFalló(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, [query, vuelta]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">Panel</div>
          <h1 className="text-3xl text-ink">Consumo por camión</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink/60">
            Desde
            <FechaInput className="input mt-1" value={range.from} onChange={(iso) => setRange({ ...range, from: iso })} />
          </label>
          <label className="text-xs text-ink/60">
            Hasta
            <FechaInput className="input mt-1" value={range.to} onChange={(iso) => setRange({ ...range, to: iso })} />
          </label>
        </div>
      </div>

      {falló ? (
        <ErrorDeCarga
          titulo="No se pudo cargar el consumo."
          mensaje={falló}
          onReintentar={() => setVuelta((v) => v + 1)}
        />
      ) : !camiones ? (
        <Spinner size={28} />
      ) : camiones.length === 0 ? (
        <Card>
          <Corners />
          <p className="text-sm text-ink/60">Todavía no hay surtidas para calcular el consumo.</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto overflow-y-hidden p-0">
            <Corners />
            <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">
              Rendimiento del período
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-ink/60">
                <tr className="border-b border-ink/15">
                  <th className="px-4 py-3">Camión</th>
                  <th className="px-4 py-3 text-right">Km</th>
                  <th className="px-4 py-3 text-right">Litros</th>
                  <th className="px-4 py-3 text-right">km/L</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                </tr>
              </thead>
              <tbody>
                {camiones.map((t) => (
                  <tr key={t.plate} className="border-b border-ink/10 last:border-0">
                    <td className="px-4 py-3 font-cond font-semibold uppercase tracking-[0.08em] text-ink">{t.plate}</td>
                    <td className="px-4 py-3 text-right">{t.km.toLocaleString("es-UY")}</td>
                    <td className="px-4 py-3 text-right">{t.liters.toLocaleString("es-UY")}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtConsumo(t.consumption_kml)}</td>
                    <td className="px-4 py-3 text-right text-ink/55">{fmtConsumo(t.expected_kml)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <Corners />
            <h2 className="mb-1 font-cond text-lg font-semibold text-ink">Consumo mensual por camión</h2>
            <p className="mb-3 text-xs text-ink/50">
              Cada mes arranca en la última surtida del mes anterior y cuenta todos los litros
              cargados dentro del mes. El mes en curso queda abierto.
            </p>
            <div className="space-y-4">
              {camiones
                .filter((t) => t.months.length > 0)
                .map((t) => (
                  <div key={t.plate}>
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
        </>
      )}
    </div>
  );
}
