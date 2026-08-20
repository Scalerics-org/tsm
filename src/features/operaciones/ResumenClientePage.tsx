import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Provider } from "@shared/domain";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Corners, Empty, ErrorText, Field, Spinner } from "../../components/ui";
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
  factura_numero: string | null;
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
  facturados: number;
}

/** El primer día del mes en curso. Es sólo un punto de partida: el corte de verdad lo define
 *  él al facturar — "Casarone hoy 19 cierra el mes, el mes que viene puede cerrar el 26". */
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
 *
 * Acá también se puntea para facturar: se eligen los viajes, se escribe el número que salió del
 * sistema de DGI y quedan marcados. Los facturados no se muestran, así el próximo corte arranca
 * limpio: "al mes que viene, todo lo que está con el número de factura queda afuera".
 */
export function ResumenClientePage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [from, setFrom] = useState(inicioDeMes());
  const [to, setTo] = useState("");
  const [porDestino, setPorDestino] = useState(false);
  const [verFacturados, setVerFacturados] = useState(false);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [recarga, setRecarga] = useState(0);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Provider[]>("/providers").then(setProviders).catch(() => setProviders([]));
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (provider) p.set("provider", provider);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (porDestino) p.set("porDestino", "1");
    if (verFacturados) p.set("incluirFacturados", "1");
    return `?${p}`;
  }, [provider, from, to, porDestino, verFacturados]);

  useEffect(() => {
    // Cambiar de cliente o de fechas borra lo punteado: marcar viajes que ya no están a la
    // vista sería facturar a ciegas.
    setSeleccion([]);
    if (!provider) return setData(null);
    setCargando(true);
    api
      .get<Resumen>(`/facturacion/resumen${query}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setCargando(false));
  }, [provider, query, recarga]);

  const alternar = (id: number) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const alternarGrupo = (ids: number[], marcar: boolean) =>
    setSeleccion((s) => (marcar ? [...new Set([...s, ...ids])] : s.filter((x) => !ids.includes(x))));

  const accion = async (hacer: () => Promise<string>) => {
    setAviso("");
    setError("");
    try {
      setAviso(await hacer());
      setSeleccion([]);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const marcar = (numero: string) =>
    accion(async () => {
      const r = await api.post<{ marcados: number; sin_tocar: number; factura_numero: string }>(
        "/facturacion/marcar",
        { trip_ids: seleccion, factura_numero: numero },
      );
      const yaEstaban = r.sin_tocar > 0 ? ` ${r.sin_tocar} ya tenían factura y quedaron como estaban.` : "";
      return `${r.marcados} viaje${r.marcados === 1 ? "" : "s"} con la factura ${r.factura_numero}.${yaEstaban}`;
    });

  const desmarcar = () =>
    accion(async () => {
      const r = await api.post<{ desmarcados: number }>("/facturacion/desmarcar", { trip_ids: seleccion });
      return `Le sacamos la factura a ${r.desmarcados} viaje${r.desmarcados === 1 ? "" : "s"}. Vuelven al resumen.`;
    });

  return (
    <div className="space-y-4">
      <Link to="/panel" className="text-sm text-ink/60 hover:text-ink">
        ← Resumen
      </Link>
      <div>
        <div className="kicker">Oficina</div>
        <h1 className="text-3xl text-ink">Resumen por cliente</h1>
        <p className="mt-1 text-sm text-ink/60">
          Lo que le llevaste a cada cliente y todavía no le facturaste, con sus remitos y toneladas.
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-5">
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
          <Field label="Facturados">
            <label className="flex h-[42px] items-center gap-2 text-sm text-ink/75">
              <input
                type="checkbox"
                checked={verFacturados}
                onChange={(e) => setVerFacturados(e.target.checked)}
              />
              Mostrarlos
            </label>
          </Field>
        </div>
      </Card>

      {aviso && <Card className="text-sm text-ink/80">✓ {aviso}</Card>}
      {error && <ErrorText>{error}</ErrorText>}

      {!provider && <Empty>Elegí un cliente para ver su resumen.</Empty>}
      {provider && cargando && <Spinner size={28} />}
      {provider && !cargando && data && data.viajes === 0 && (
        <Empty>
          {data.facturados > 0
            ? `No queda nada por facturar de ${provider} en ese período. Hay ${data.facturados} viaje${data.facturados === 1 ? " ya facturado" : "s ya facturados"}: marcá "Mostrarlos" para verlos.`
            : `No hay viajes de ${provider} en ese período.`}
        </Empty>
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

          {data.facturados > 0 && !verFacturados && (
            <p className="text-sm text-ink/55">
              {data.facturados} viaje{data.facturados === 1 ? "" : "s"} de este período ya
              {data.facturados === 1 ? " está facturado" : " están facturados"} y no se
              {data.facturados === 1 ? " muestra" : " muestran"}.
            </p>
          )}

          <BarraFacturar seleccionados={seleccion.length} onMarcar={marcar} onDesmarcar={desmarcar} />

          {data.grupos.map((g) => (
            <GrupoTabla
              key={g.titulo || "todos"}
              grupo={g}
              columnas={data.columnas}
              seleccion={seleccion}
              onAlternar={alternar}
              onAlternarGrupo={alternarGrupo}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * La barra de facturar. El número no se genera: lo copia de su sistema de facturación
 * electrónica de DGI y lo escribe acá.
 */
function BarraFacturar({
  seleccionados,
  onMarcar,
  onDesmarcar,
}: {
  seleccionados: number;
  onMarcar: (numero: string) => void;
  onDesmarcar: () => void;
}) {
  const [numero, setNumero] = useState("");

  if (seleccionados === 0) {
    return (
      <p className="text-sm text-ink/55">
        Punteá los viajes que entran en la factura para ponerles el número.
      </p>
    );
  }

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="font-cond text-sm font-semibold uppercase tracking-[0.1em] text-ink/70">
        {seleccionados} viaje{seleccionados === 1 ? "" : "s"} punteado{seleccionados === 1 ? "" : "s"}
      </div>
      <Field label="Nº de factura">
        <input
          className="input"
          value={numero}
          placeholder="El que te dio DGI"
          onChange={(e) => setNumero(e.target.value)}
        />
      </Field>
      <Button
        disabled={!numero.trim()}
        onClick={() => {
          onMarcar(numero.trim());
          setNumero("");
        }}
      >
        Marcar facturados
      </Button>
      <Button variant="secondary" onClick={onDesmarcar}>
        Sacarles la factura
      </Button>
    </Card>
  );
}

function GrupoTabla({
  grupo,
  columnas,
  seleccion,
  onAlternar,
  onAlternarGrupo,
}: {
  grupo: Grupo;
  columnas: Columna[];
  seleccion: number[];
  onAlternar: (id: number) => void;
  onAlternarGrupo: (ids: number[], marcar: boolean) => void;
}) {
  const ids = grupo.filas.map((f) => f.trip_id);
  const todos = ids.length > 0 && ids.every((id) => seleccion.includes(id));

  return (
    <Card className="overflow-x-auto p-0">
      <Corners />
      {grupo.titulo && (
        <div className="flex items-baseline justify-between border-b border-ink/15 px-4 py-3">
          <span className="font-cond text-lg font-semibold text-ink">{grupo.titulo}</span>
          <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/55">
            {grupo.viajes} viaje{grupo.viajes === 1 ? "" : "s"}
            {columnas
              .filter((c) => c.totaliza && grupo.totales[c.key])
              .map((c) => ` · ${grupo.totales[c.key].toLocaleString("es-UY")} ${c.label.toLowerCase()}`)
              .join("")}
          </span>
        </div>
      )}
      <table className="w-full min-w-[780px] text-sm">
        <thead className="text-left text-ink/60">
          <tr className="border-b border-ink/15">
            <th className="w-10 px-4 py-2">
              <input
                type="checkbox"
                aria-label="Puntear todos"
                checked={todos}
                onChange={(e) => onAlternarGrupo(ids, e.target.checked)}
              />
            </th>
            <th className="px-4 py-2">Fecha</th>
            <th className="px-4 py-2">Viaje</th>
            {columnas.map((c) => (
              <th key={c.key} className={`px-4 py-2 ${c.totaliza ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
            <th className="px-4 py-2">Chofer</th>
            <th className="px-4 py-2">Factura</th>
          </tr>
        </thead>
        <tbody>
          {grupo.filas.map((f) => (
            <tr
              key={f.trip_id}
              className={`border-b border-ink/10 ${f.factura_numero ? "bg-ink/[0.04]" : ""}`}
            >
              <td className="px-4 py-2">
                <input
                  type="checkbox"
                  aria-label={`Puntear viaje ${f.trip_id}`}
                  checked={seleccion.includes(f.trip_id)}
                  onChange={() => onAlternar(f.trip_id)}
                />
              </td>
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
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2 text-ink/70 ${c.totaliza ? "text-right tabular-nums" : ""}`}
                >
                  {f.valores[c.key] || "—"}
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-2 text-ink/70">{f.chofer}</td>
              <td className="whitespace-nowrap px-4 py-2">
                {f.factura_numero ? (
                  <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">
                    ✓ {f.factura_numero}
                  </span>
                ) : (
                  <span className="text-ink/35">Sin facturar</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-asphalt/60 font-semibold">
            <td className="px-4 py-2 text-ink/60" colSpan={3}>
              {grupo.viajes} viaje{grupo.viajes === 1 ? "" : "s"}
            </td>
            {columnas.map((c) => (
              <td key={c.key} className="px-4 py-2 text-right tabular-nums text-ink">
                {c.totaliza ? (grupo.totales[c.key] ?? 0).toLocaleString("es-UY") : ""}
              </td>
            ))}
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </Card>
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
