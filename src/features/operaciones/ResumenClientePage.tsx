import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Provider } from "@shared/domain";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Corners, Empty, Field, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface Columna {
  key: string;
  label: string;
  totaliza: boolean;
}

interface Fila {
  trip_id: number;
  fecha: string;
  origen: string;
  destino: string;
  destinatario: string | null;
  chofer: string;
  camion: string;
  estado: string;
  valores: Record<string, string>;
  cargas: { remitente: string; clientes: string; cantidad: number | null; unidad: string | null }[];
}

interface Grupo {
  titulo: string;
  filas: Fila[];
  viajes: number;
  totales: Record<string, number>;
}

interface Resumen {
  provider: string;
  columnas: Columna[];
  grupos: Grupo[];
  viajes: number;
  totales: Record<string, number>;
}

/** El primer día del mes en curso, que es el corte que usa la oficina para facturar. */
function inicioDeMes(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Resumen por cliente, para facturar.
 *
 * "Resumen de Casarone: toneladas de carga y nros de remitos. Nayna ídem. Tycsur ídem.
 * Resumen mensual de Cañuelas agrupado por destinos."
 *
 * No es una pantalla por cliente: las columnas salen de los campos que cada uno pide en sus
 * plantillas. Casarone muestra remito y toneladas; TYCSUR, el MIC; Cañuelas, la hoja de ruta.
 * El día que se agregue un cliente nuevo desde Plantillas, su resumen sale solo.
 */
export function ResumenClientePage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState(inicioDeMes());
  const [to, setTo] = useState("");
  const [porDestino, setPorDestino] = useState(false);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.get<Provider[]>("/providers").then(setProviders).catch(() => setProviders([]));
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (provider) p.set("provider", provider);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (porDestino) p.set("porDestino", "1");
    return `?${p}`;
  }, [provider, from, to, porDestino]);

  useEffect(() => {
    if (!provider) return setData(null);
    setCargando(true);
    api
      .get<Resumen>(`/reports/cliente${query}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setCargando(false));
  }, [provider, query]);

  return (
    <div className="space-y-4">
      <Link to="/panel" className="text-sm text-ink/60 hover:text-ink">
        ← Resumen
      </Link>
      <div>
        <div className="kicker">Oficina</div>
        <h1 className="text-3xl text-ink">Resumen por cliente</h1>
        <p className="mt-1 text-sm text-ink/60">
          Lo que le llevaste a cada cliente en el período, con sus remitos y toneladas.
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Cliente">
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">Elegí…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Agrupar">
            <label className="flex h-[42px] items-center gap-2 text-sm text-ink/75">
              <input
                type="checkbox"
                checked={porDestino}
                onChange={(e) => setPorDestino(e.target.checked)}
              />
              Por destino
            </label>
          </Field>
        </div>
      </Card>

      {!provider && <Empty>Elegí un cliente para ver su resumen.</Empty>}
      {provider && cargando && <Spinner size={28} />}
      {provider && !cargando && data && data.viajes === 0 && (
        <Empty>No hay viajes de {provider} en ese período.</Empty>
      )}

      {data && data.viajes > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Total etiqueta="Viajes" valor={data.viajes.toLocaleString("es-UY")} />
              {data.columnas
                .filter((c) => c.totaliza)
                .map((c) => (
                  <Total
                    key={c.key}
                    etiqueta={c.label}
                    valor={(data.totales[c.key] ?? 0).toLocaleString("es-UY")}
                  />
                ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => downloadFile(`/reports/trips.csv?provider=${encodeURIComponent(provider)}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, `${provider}.csv`)}
            >
              ⬇ Exportar Excel
            </Button>
          </div>

          {data.grupos.map((g) => (
            <Card key={g.titulo || "todos"} className="overflow-x-auto p-0">
              <Corners />
              {g.titulo && (
                <div className="flex items-baseline justify-between border-b border-ink/15 px-4 py-3">
                  <span className="font-cond text-lg font-semibold text-ink">{g.titulo}</span>
                  <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/55">
                    {g.viajes} viaje{g.viajes === 1 ? "" : "s"}
                    {data.columnas
                      .filter((c) => c.totaliza && g.totales[c.key])
                      .map((c) => ` · ${g.totales[c.key].toLocaleString("es-UY")} ${c.label.toLowerCase()}`)
                      .join("")}
                  </span>
                </div>
              )}
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-ink/60">
                  <tr className="border-b border-ink/15">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2">Viaje</th>
                    {data.columnas.map((c) => (
                      <th key={c.key} className={`px-4 py-2 ${c.totaliza ? "text-right" : ""}`}>
                        {c.label}
                      </th>
                    ))}
                    <th className="px-4 py-2">Chofer</th>
                  </tr>
                </thead>
                <tbody>
                  {g.filas.map((f) => (
                    <tr key={f.trip_id} className="border-b border-ink/10">
                      <td className="whitespace-nowrap px-4 py-2 text-ink/70">{fmtDate(f.fecha)}</td>
                      <td className="px-4 py-2">
                        <Link to={`/panel/viajes/${f.trip_id}`} className="text-ink hover:underline">
                          {f.origen} → {f.destino}
                        </Link>
                        {f.destinatario && <span className="text-ink/50"> ({f.destinatario})</span>}
                        {f.cargas.length > 0 && (
                          <div className="text-xs text-ink/50">
                            {f.cargas
                              .map((c) => `${c.remitente}${c.cantidad ? ` ${c.cantidad} ${c.unidad ?? ""}` : ""}`)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      {data.columnas.map((c) => (
                        <td
                          key={c.key}
                          className={`px-4 py-2 text-ink/70 ${c.totaliza ? "text-right tabular-nums" : ""}`}
                        >
                          {f.valores[c.key] || "—"}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-2 text-ink/70">{f.chofer}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-asphalt/60 font-semibold">
                    <td className="px-4 py-2 text-ink/60" colSpan={2}>
                      {g.viajes} viaje{g.viajes === 1 ? "" : "s"}
                    </td>
                    {data.columnas.map((c) => (
                      <td key={c.key} className="px-4 py-2 text-right tabular-nums text-ink">
                        {c.totaliza ? (g.totales[c.key] ?? 0).toLocaleString("es-UY") : ""}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function Total({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        {etiqueta}
      </div>
      <div className="font-cond text-2xl font-semibold tabular-nums text-ink">{valor}</div>
    </div>
  );
}
