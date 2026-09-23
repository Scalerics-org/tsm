import { useEffect, useMemo, useState } from "react";
import { AvisosCard } from "./AvisosCard";
import { Link } from "react-router-dom";
import { fmtConsumo, fmtKilos } from "@shared/domain";
import { api, downloadFile, mensajeDe } from "../../lib/api";
import { Button, Card, Corners, ErrorDeCarga, Spinner, Stat } from "../../components/ui";
import { FechaInput } from "../../components/FechaInput";

interface MonthRow {
  month: string;
  km: number;
  liters: number;
  kml: number | null;
  closed: boolean;
  /** La verificación del gasoil: si los litros alcanzan para los km de ESE mes. */
  verificacion?: {
    estado: "ok" | "faltan" | "sobran" | "en_curso" | "sin_datos";
    titulo: string | null;
    mensaje: string;
  } | null;
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
    /** Vacíos deducidos: volver de donde salió, o ir a buscar carga a otro lado. */
    km_retorno: number;
    km_reposicion: number;
    tramos_vacios: number;
    /** Tramos que la app no pudo medir: aparecen pero no suman. */
    vacios_sin_km: number;
  }[];
  byProvider: { name: string; trips: number; completed: number; tons: number }[];
  monthlyByTruck: {
    truck_id: number;
    plate: string;
    /** El km/L habitual de este camión, contra el que se compara cada mes. */
    rango?: { mediana: number | null; tramos: number };
    months: MonthRow[];
  }[];
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
}

const BORDE_DEL_MES = {
  ok: "border-l-st-blueDot",
  en_curso: "border-l-st-blueDot",
  sin_datos: "border-l-st-blueDot",
  faltan: "border-l-st-redDot",
  sobran: "border-l-st-amberDot",
} as const;

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

  const [falló, setFalló] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vigente = true;
    setS(null);
    setFalló(null);
    api
      .get<Summary>(`/reports/summary${query}`)
      .then((r) => vigente && setS(r))
      .catch((e) => vigente && setFalló(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, [query, vuelta]);

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
            <FechaInput className="input mt-1" value={range.from} onChange={(iso) => setRange({ ...range, from: iso })} />
          </label>
          <label className="text-xs text-ink/60">
            Hasta
            <FechaInput className="input mt-1" value={range.to} onChange={(iso) => setRange({ ...range, to: iso })} />
          </label>
          <Button variant="secondary" onClick={() => downloadFile(`/reports/trips.csv${query}`, "viajes.csv")}>
            ⬇ Viajes
          </Button>
          <Button variant="secondary" onClick={() => downloadFile(`/reports/fuel.csv${query}`, "surtidas.csv")}>
            ⬇ Surtidas
          </Button>
        </div>
      </div>

      {falló ? (
        <ErrorDeCarga
          titulo="No se pudo cargar el resumen."
          mensaje={falló}
          onReintentar={() => setVuelta((v) => v + 1)}
        />
      ) : !s ? (
        <Spinner size={28} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="En curso" value={s.totals.en_curso} />
            <Stat label="Completados" value={s.totals.completados} accent="green" />
            <Stat label="Viajes (período)" value={s.totals.trips} />
            <Stat label="Surtidas" value={s.totals.surtidas} accent="amber" />
          </div>

          {/* Uno debajo del otro y a todo el ancho, no lado a lado. "Por camión arriba, por
              cliente abajo, y ver todos los datos en una pantalla" — el cliente. En dos
              columnas cada tabla tenía la mitad del ancho y "A buscar carga" y km/L quedaban
              escondidos detrás de un scroll horizontal que nadie usaba. */}
          <div className="space-y-4">
            {/* Por camión */}
            <Card className="overflow-x-auto overflow-y-hidden p-0">
              <Corners />
              <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Por camión</div>
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-ink/60">
                  <tr className="border-b border-ink/15">
                    <th className="px-4 py-3">Camión</th>
                    <th className="px-4 py-3 text-right">Viajes</th>
                    <th className="px-4 py-3 text-right">Kilos</th>
                    <th className="px-4 py-3 text-right">Km</th>
                    {/* Los vacíos van pegados a Km: se leen como "de esos kilómetros, tantos
                        fueron sin carga". Dos columnas y no una porque el cliente los separa
                        así — "1 cargados, 2 retornos, 3 vacíos para llegar a cargas". */}
                    <th className="px-4 py-3 text-right">Retornos</th>
                    <th className="px-4 py-3 text-right">A buscar carga</th>
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
                      <td className="px-4 py-3 text-right tabular-nums text-ink/70">{fmtKilos(t.tons)}</td>
                      <td className="px-4 py-3 text-right text-ink/70">{t.km.toLocaleString("es-UY")}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                        {t.km_retorno ? t.km_retorno.toLocaleString("es-UY") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                        {t.km_reposicion ? t.km_reposicion.toLocaleString("es-UY") : "—"}
                        {/* Se dice cuando el total es un piso: hay tramos que la app no pudo
                            medir porque no conoce el lugar ("Salto y Artigas", Buenos Aires). */}
                        {t.vacios_sin_km > 0 && (
                          <div
                            className="text-[11px] text-st-amberTx"
                            title="Tramos entre lugares que la app no conoce: aparecen en la ficha del camión pero no suman."
                          >
                            + {t.vacios_sin_km} sin medir
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {fmtConsumo(t.consumption_kml)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Por cliente */}
            <Card className="overflow-x-auto overflow-y-hidden p-0">
              <Corners />
              <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Por cliente</div>
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-ink/60">
                  <tr className="border-b border-ink/15">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Viajes</th>
                    <th className="px-4 py-3 text-right">Kilos</th>
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
                      <td className="px-4 py-3 text-right tabular-nums text-ink/70">{fmtKilos(p.tons)}</td>
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
                        {/* El resumen para mandarle al cliente: fecha, destino, cliente de la
                            carga y los datos propios de su viaje. Nada de cobro ni de cómo
                            trabaja la empresa por dentro. */}
                        <button
                          className="ml-4 text-brand-700 hover:underline"
                          title="Fecha, destino, cliente de la carga y los datos propios de su viaje. Sin cobro, chofer ni camión."
                          onClick={() =>
                            downloadFile(
                              `/reports/cliente.csv?provider=${encodeURIComponent(p.name)}${range.from ? `&from=${range.from}` : ""}${range.to ? `&to=${range.to}` : ""}`,
                              `resumen-${p.name}.csv`,
                            )
                          }
                        >
                          ⬇ Para el cliente
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
              {/* La regla va escrita porque el número no se puede reconstruir mirando la
                  pantalla, y cuando no cierra contra las facturas hay que saber dónde buscar. */}
              <p className="mb-3 text-xs text-ink/50">
                Cada mes arranca en la última surtida del mes anterior y cuenta todos los litros
                cargados dentro del mes. El mes en curso queda abierto.
              </p>
              {/* La verificación (Rodrigo, 22/9): el aviso sale sólo cuando el mes se va del
                  rango habitual de ESE camión, y dice cuántos litros son, para ir a buscar la
                  boleta. Si no alcanzan los datos para comparar, lo dice en vez de opinar. */}
              <p className="mb-3 text-xs text-ink/50">
                Cada mes se compara con el rendimiento habitual del propio camión: si los litros no
                alcanzan para los kilómetros, falta una surtida por registrar.
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
                    <span className="ml-3 text-xs text-ink/50">
                      {t.rango?.mediana != null
                        ? `Habitual: ${fmtConsumo(t.rango.mediana)} km/L`
                        : "Todavía no alcanza para comparar: faltan surtidas de este camión"}
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {t.months.map((m) => (
                        <div key={m.month} className={`border-l-4 bg-surface px-3 py-2 ${BORDE_DEL_MES[m.verificacion?.estado ?? "sin_datos"]}`}>
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
                          {/* Sólo habla cuando hay algo que decir: "dentro de lo habitual" es una línea
                              chica, y el mes en curso o sin datos no dice nada para no dar una alarma
                              falsa. */}
                          {m.verificacion && m.verificacion.estado === "faltan" && (
                            <p className="mt-1 text-xs font-semibold text-st-redTx">
                              {m.verificacion.titulo}
                              <span className="block font-normal">{m.verificacion.mensaje}</span>
                            </p>
                          )}
                          {m.verificacion && m.verificacion.estado === "sobran" && (
                            <p className="mt-1 text-xs font-semibold text-st-amberTx">
                              {m.verificacion.titulo}
                              <span className="block font-normal">{m.verificacion.mensaje}</span>
                            </p>
                          )}
                          {m.verificacion && m.verificacion.estado === "ok" && (
                            <p className="mt-1 text-xs text-st-greenTx">Dentro de lo habitual</p>
                          )}
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
