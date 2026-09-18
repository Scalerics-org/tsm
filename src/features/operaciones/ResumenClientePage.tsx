import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Provider, TripTemplate } from "@shared/domain";
import { api, downloadFile, mensajeDe } from "../../lib/api";
import { Button, Card, Corners, Empty, ErrorDeCarga, ErrorText, Field, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { FechaInput } from "../../components/FechaInput";

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
  cargas: {
    remitente: string;
    clientes: string;
    cantidad: number | null;
    unidad: string | null;
    cobro_a: string | null;
  }[];
  factura_numero: string | null;
  factura_quitada: string | null;
}

interface Grupo {
  titulo: string;
  filas: Fila[];
  viajes: number;
  totales: Record<string, number>;
  cantidades: Record<string, number>;
}

interface Resumen {
  provider: string;
  columnas: Columna[];
  grupos: Grupo[];
  viajes: number;
  totales: Record<string, number>;
  /** Lo que suman las cargas, por unidad. Para los clientes que no tienen campos propios. */
  cantidades: Record<string, number>;
  facturados: number;
  /** Cargas que la regla manda cobrarle a otro. */
  cobros_ajenos: { cobro_a: string; cargas: number }[];
  /** Viajes del período todavía abiertos: no entran al resumen, pero hay que saber que están. */
  en_curso: number;
  /** Viajes sin facturar anteriores al "Desde" de arriba. */
  anteriores_sin_facturar: number;
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
  const [provider, setProviderRaw] = useState("");
  /**
   * El tipo de viaje adentro del cliente. "Los internacionales son 3 clientes diferentes, tengo
   * que facturar uno" (Rodrigo, 18/9): para el chofer siguen siendo "Internacional"; acá se
   * factura TYCSUR, Minabel o Valvis por separado.
   */
  const [plantilla, setPlantilla] = useState("");
  const setProvider = (p: string) => {
    setProviderRaw(p);
    setPlantilla("");
  };
  const [plantillas, setPlantillas] = useState<TripTemplate[]>([]);
  useEffect(() => {
    api.get<TripTemplate[]>("/templates").then(setPlantillas).catch(() => setPlantillas([]));
  }, []);
  const delCliente = plantillas.filter((t) => t.provider_name === provider);
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

  const [clientesFalló, setClientesFalló] = useState<string | null>(null);
  const cargarClientes = () => {
    setClientesFalló(null);
    api
      .get<Provider[]>("/providers")
      .then(setProviders)
      .catch((e) => setClientesFalló(mensajeDe(e)));
  };
  useEffect(cargarClientes, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (provider) p.set("provider", provider);
    if (plantilla) p.set("plantilla", plantilla);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (porDestino) p.set("porDestino", "1");
    if (verFacturados) p.set("incluirFacturados", "1");
    return `?${p}`;
  }, [provider, plantilla, from, to, porDestino, verFacturados]);

  const [falló, setFalló] = useState<string | null>(null);
  useEffect(() => {
    // Cambiar de cliente o de fechas borra lo punteado: marcar viajes que ya no están a la
    // vista sería facturar a ciegas.
    setSeleccion([]);
    setFalló(null);
    if (!provider) {
      // Si había un pedido en camino, ya no es el vigente y no va a apagar `cargando`.
      setData(null);
      setCargando(false);
      return;
    }
    // `vigente`: al pasar rápido de un cliente a otro, la respuesta del primero puede llegar
    // última y quedar en pantalla con el segundo elegido. Lo que se puntee ahí se marca con
    // el número de factura del cliente equivocado.
    let vigente = true;
    setCargando(true);
    api
      .get<Resumen>(`/facturacion/resumen${query}`)
      .then((r) => vigente && setData(r))
      .catch((e) => {
        if (!vigente) return;
        setData(null);
        setFalló(mensajeDe(e));
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
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

  /**
   * Sacar la factura vuelve el viaje al resumen para volver a facturarlo. Se pregunta antes y
   * se nombran las facturas: si después se factura con otro número, en DGI quedan las dos y el
   * cliente queda cobrado dos veces. El número viejo queda guardado y se ve en la fila.
   */
  const desmarcar = () => {
    // Los que de verdad tienen factura: el resto de la selección no se toca, así que contarlos
    // en la pregunta era prometer algo que no iba a pasar.
    const conFactura = (data?.grupos ?? [])
      .flatMap((g) => g.filas)
      .filter((f) => seleccion.includes(f.trip_id) && f.factura_numero);
    if (conFactura.length === 0) {
      setError("Ninguno de los viajes que marcaste tiene factura puesta.");
      return;
    }
    const numeros = [...new Set(conFactura.map((f) => f.factura_numero as string))];
    if (
      !confirm(
        `Les vas a sacar la factura (${numeros.join(", ")}) a ${conFactura.length} viaje(s). Vuelven al resumen y se pueden volver a facturar: si les ponés otro número, en DGI van a quedar las dos. ¿Seguir?`,
      )
    ) {
      return;
    }
    return accion(async () => {
      const r = await api.post<{ desmarcados: number }>("/facturacion/desmarcar", { trip_ids: seleccion });
      return `Le sacamos la factura a ${r.desmarcados} viaje${r.desmarcados === 1 ? "" : "s"}. Vuelven al resumen.`;
    });
  };

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
          {/* Sólo si el cliente tiene más de un tipo de viaje: con uno solo no hay qué elegir. */}
          {delCliente.length > 1 && (
            <Field label="Tipo de viaje">
              <select className="input" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
                <option value="">Todos</option>
                {delCliente.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.active ? "" : " (desactivado)"}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Desde">
            <FechaInput value={from} onChange={setFrom} />
          </Field>
          <Field label="Hasta">
            <FechaInput value={to} onChange={setTo} />
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

      {clientesFalló && (
        <ErrorDeCarga
          titulo="No se pudo cargar la lista de clientes."
          mensaje={clientesFalló}
          onReintentar={cargarClientes}
        />
      )}
      {!provider && !clientesFalló && <Empty>Elegí un cliente para ver su resumen.</Empty>}
      {provider && cargando && <Spinner size={28} />}
      {provider && !cargando && falló && (
        <ErrorDeCarga
          titulo={`No se pudo cargar el resumen de ${provider}.`}
          mensaje={falló}
          onReintentar={() => setRecarga((n) => n + 1)}
        />
      )}
      {/* Los avisos van ACÁ AFUERA, no adentro del bloque de la tabla: cuando el período no
          tiene nada para facturar es justamente cuando hay que leerlos —el "no hay viajes"
          los tapaba, y era lo único que explicaba por qué la lista está vacía. */}
      {provider && !cargando && data && (
        <>
          {/* La regla de cobro dice otra cosa que el cliente del viaje. Cambiar el resumen para
              que se arme por quién paga es una decisión del cliente; mientras tanto, que esté a
              la vista antes de emitir la factura. */}
          {data.cobros_ajenos.length > 0 && (
            <p className="border-l-4 border-st-amberDot bg-st-amberBg px-3 py-2 text-sm text-st-amberTx">
              Ojo: hay cargas acá adentro que la regla manda cobrarle a otro —{" "}
              {data.cobros_ajenos.map((c) => `${c.cobro_a} (${c.cargas})`).join(", ")}. Si facturás
              todo a {provider}, eso se le cobra al que no es.
            </p>
          )}

          {data.en_curso > 0 && (
            <p className="border-l-4 border-st-amberDot bg-st-amberBg px-3 py-2 text-sm text-st-amberTx">
              {data.en_curso} viaje{data.en_curso === 1 ? "" : "s"} de {provider} en este período
              {data.en_curso === 1 ? " sigue abierto" : " siguen abiertos"} y no
              {data.en_curso === 1 ? " entra" : " entran"} al resumen. Si ya
              {data.en_curso === 1 ? " se entregó" : " se entregaron"}, cerralos antes de facturar.
            </p>
          )}

          {data.anteriores_sin_facturar > 0 && (
            <p className="text-sm text-ink/55">
              Hay {data.anteriores_sin_facturar} viaje{data.anteriores_sin_facturar === 1 ? "" : "s"} de{" "}
              {provider} sin facturar anteriores al {fmtDate(from)}. Corré la fecha "Desde" para verlos.
            </p>
          )}
        </>
      )}

      {provider && !cargando && data && data.viajes === 0 && (
        <Empty>
          {data.facturados > 0
            ? `No queda nada por facturar de ${provider} en ese período. Hay ${data.facturados} viaje${data.facturados === 1 ? " ya facturado" : "s ya facturados"}: marcá "Mostrarlos" para verlos.`
            : `No hay viajes para facturar de ${provider} en ese período.`}
        </Empty>
      )}

      {/* `!cargando`: mientras llega el resumen de otro cliente, la tabla del anterior quedaba
          a la vista y se podía puntear. */}
      {!cargando && data && data.viajes > 0 && (
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
              {/* Los clientes sin campos propios ponen la cantidad en cada carga: sin esto la
                  pantalla mostraba sólo "Viajes: 13" y había que sumar a mano para facturar. */}
              {Object.entries(data.cantidades).map(([unidad, total]) => (
                <Total key={unidad} etiqueta={unidad} valor={total.toLocaleString("es-UY")} />
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => downloadFile(`/reports/trips.csv?facturables=1${verFacturados ? "&incluirFacturados=1" : ""}&provider=${encodeURIComponent(provider)}${plantilla ? `&plantilla=${plantilla}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, `${provider}.csv`)}
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
            {/* Y lo que suman las cargas del grupo: en Cañuelas agrupado por destino, es la
                cuenta que se le factura a cada lado. */}
            {Object.entries(grupo.cantidades)
              .map(([unidad, total]) => ` · ${total.toLocaleString("es-UY")} ${unidad}`)
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
                ) : f.factura_quitada ? (
                  /* Ya salió una vez en una factura y se la sacaron. Si se factura de nuevo con
                     otro número, en DGI quedan las dos: por eso se avisa acá, que es donde se
                     decide. */
                  <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-st-amberTx">
                    tuvo la {f.factura_quitada}
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
