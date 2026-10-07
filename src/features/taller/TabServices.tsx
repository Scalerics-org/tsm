import { Link } from "react-router-dom";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { HOY, enLaDireccion } from "./datos";
import { NOMBRE_OTRO, EXPLICACION_OTRO, TIPOS_DE_SERVICE, codigoCombinado, contenidoDeTipo, type GrupoDeService } from "./tipos-de-service";
import { COLOR_ESTADO } from "./VistaSuperior";
import {
  fmtUso,
  proximoService,
  textoDelIntervalo,
  ultimoService,
  type Service,
  type TipoService,
  type Vehiculo,
} from "./tipos";

/**
 * Los códigos de un service, combinados ("A + D + R"), en una sola etiqueta. El color dice de qué es: de motor, de
 * cubiertas, de las dos cosas o una reparación suelta.
 */
export function CodigoPill({ tipos }: { tipos: TipoService[] }) {
  const grupos = new Set<GrupoDeService | "otro">(tipos.map((t) => (t === "otro" ? "otro" : TIPOS_DE_SERVICE.find((x) => x.codigo === t)?.grupo ?? "motor")));
  const clase =
    grupos.has("otro") && grupos.size === 1
      ? "border-st-amberBd bg-st-amberBg text-st-amberTx"
      : grupos.has("motor") && grupos.has("cubiertas")
        ? "border-navy bg-navy text-bg"
        : grupos.has("cubiertas")
          ? "border-st-greenBd bg-st-greenBg text-st-greenTx"
          : tipos.some((t) => t === "C" || t === "BC")
            ? "border-brand bg-brand-200 text-brand-800"
            : "border-ink/25 bg-white text-ink";
  return (
    <span data-codigo className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 font-cond text-[13px] font-bold tracking-[0.06em] ${clase}`}>
      {codigoCombinado(tipos)}
    </span>
  );
}

/** El botón que abre el flujo de cargar un service: lo que se hizo, marcado por secciones. */
export function BotonNuevoService({ vehiculo }: { vehiculo: Vehiculo }) {
  return (
    <Link to={`/panel/taller/${enLaDireccion(vehiculo.patente)}/nuevo-service`} className="btn btn-navy min-h-[44px]">
      + Nuevo service
    </Link>
  );
}

export function TabServices({ vehiculo }: { vehiculo: Vehiculo }) {
  const ultimo = ultimoService(vehiculo);
  const orden = [...vehiculo.services].sort((a, b) => b.km - a.km);
  const prox = ultimo ? proximoService(vehiculo, HOY) : null;
  const desdeUltimo = ultimo ? vehiculo.km - ultimo.km : 0;
  const avance = ultimo && vehiculo.cadaService ? Math.min(1, desdeUltimo / vehiculo.cadaService) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-ink/60">
          Cada service guarda sólo lo que se marcó: lo que Raúl hizo, pieza por pieza. Se carga con el botón.
        </p>
        <BotonNuevoService vehiculo={vehiculo} />
      </div>

      {ultimo && prox ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel border-l-4 border-l-st-blueDot px-4 py-3">
            <Corners />
            <div className="kicker">{vehiculo.unidad === "h" ? "Horas actuales" : "Km del tacógrafo"}</div>
            <div className="mt-1 font-cond text-4xl font-semibold leading-none tabular-nums">{vehiculo.km.toLocaleString("es-UY")}</div>
            <div className="mt-1 text-xs text-ink/50">
              {desdeUltimo.toLocaleString("es-UY")} {vehiculo.unidad} desde el último service
            </div>
          </div>

          <div className="panel border-l-4 border-l-st-greenDot px-4 py-3">
            <Corners />
            <div className="flex items-center justify-between">
              <span className="kicker">Último service</span>
              <CodigoPill tipos={ultimo.tipos} />
            </div>
            <div className="mt-1 font-cond text-2xl font-semibold leading-tight">{fmtDate(ultimo.fecha)}</div>
            <div className="text-sm tabular-nums text-ink/60">
              a {vehiculo.unidad === "h" ? "las" : "los"} {fmtUso(vehiculo, ultimo.km)}
            </div>
            <p className="mt-2 border-t border-ink/10 pt-2 text-xs leading-relaxed text-ink/60">
              {vehiculo.unidad === "h" ? "Operador" : "Chofer"} {ultimo.chofer} · Mecánico {ultimo.mecanico}
              <span className="mt-0.5 block text-ink/50">{ultimo.obs}</span>
            </p>
          </div>

          <div className="panel border-l-4 px-4 py-3" style={{ borderLeftColor: COLOR_ESTADO[prox.estado] }}>
            <Corners />
            <div className="kicker">Próximo service</div>
            <div className="mt-1 font-cond text-2xl font-semibold leading-tight">{fmtUso(vehiculo, prox.km)}</div>
            <div className="text-sm text-ink/60">
              {prox.faltan > 0 ? (
                <>
                  faltan{" "}
                  <b className="tabular-nums" style={{ color: COLOR_ESTADO[prox.estado] }}>
                    {prox.faltan.toLocaleString("es-UY")} {vehiculo.unidad}
                  </b>{" "}
                  · alrededor del {fmtDate(prox.fechaEstimada)}. Qué letra toca, a confirmar.
                </>
              ) : (
                <b className="tabular-nums" style={{ color: COLOR_ESTADO.rojo }}>
                  pasado por {Math.abs(prox.faltan).toLocaleString("es-UY")} {vehiculo.unidad}
                </b>
              )}
            </div>
            <div className="mt-3 h-2.5 bg-surface" role="img" aria-label={`${Math.round(avance * 100)}% del camino al próximo service`}>
              <div className="h-full" style={{ width: `${avance * 100}%`, background: COLOR_ESTADO[prox.estado] }} />
            </div>
            <p className="mt-2 text-xs text-ink/50">A {Math.round(vehiculo.kmPorDia)} {vehiculo.unidad} por día, que es lo que viene haciendo.</p>
          </div>
        </div>
      ) : (
        <div className="panel p-5">
          <Corners />
          <div className="kicker">Sin services</div>
          <p className="mt-2 max-w-prose text-sm text-ink/65">
            {vehiculo.cadaService == null
              ? 'Los semirremolques y acoplados no tienen service por km, así que no hay próximo estimado. Lo que se les hace (frenos, rodaje, cubiertas, chasis) se carga como "Otro / reparación suelta".'
              : "Este vehículo no tiene services cargados."}
          </p>
        </div>
      )}

      <section className="panel">
        <Corners />
        <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">Tipos de service</h2>
        {(["motor", "cubiertas"] as const).map((grupo) => (
          <div key={grupo}>
            <div className="border-b border-ink/10 bg-surface/60 px-4 py-1.5 font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              {grupo === "motor" ? "Motor" : "Cubiertas"}
            </div>
            <dl className="grid gap-px bg-ink/10 sm:grid-cols-2">
              {TIPOS_DE_SERVICE.filter((x) => x.grupo === grupo).map((x) => (
                <div key={x.codigo} data-tipo-de-service={x.codigo} className="flex items-start gap-3 bg-white px-4 py-3">
                  <CodigoPill tipos={[x.codigo]} />
                  <div className="min-w-0">
                    <dt className="text-sm font-semibold text-ink">{x.nombre}</dt>
                    <dd className="text-xs text-ink/60">{contenidoDeTipo(x)}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <div className="flex items-start gap-3 border-t border-ink/10 bg-white px-4 py-3">
          <CodigoPill tipos={["otro"]} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{NOMBRE_OTRO}</div>
            <div className="text-xs text-ink/60">{EXPLICACION_OTRO}</div>
          </div>
        </div>
        <p className="border-t border-ink/10 px-4 py-2 text-xs leading-relaxed text-ink/55">
          Un service puede ser de varios tipos a la vez (por ejemplo A + D + R): sus ítems se suman y, si dos tipos comparten uno, va una sola vez.
          <span className="mt-1 block">
            Próximo service: <b className="text-ink/75">{textoDelIntervalo(vehiculo)}</b>
            {vehiculo.tipo === "camion" && " (por ahora: grande = camión tractor, tractor sencillo y doble eje; chico = camión chico)"}. El color: verde si
            falta más de un tercio del intervalo, ámbar si falta un tercio o menos, rojo si faltan menos de{" "}
            {vehiculo.unidad === "h" ? "25 horas" : "1.000 km"} o ya se pasó.
          </span>
          <span data-a-confirmar className="mt-1 block text-st-amberTx">
            A confirmar: falta saber en qué orden van los tipos y cada cuánto toca cada uno (C, BC, D, V…). Por eso sólo se estima el próximo service por km, sin
            decir qué letra toca.
          </span>
          {vehiculo.disposicion?.aConfirmar && <span className="mt-1 block text-st-amberTx">A confirmar: {vehiculo.disposicion.aConfirmar}</span>}
        </p>
      </section>

      {orden.length > 0 && (
        <section className="panel">
          <Corners />
          <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">Services cargados</h2>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
                  {["Fecha", "Tipos", vehiculo.unidad === "h" ? "Horas" : "Km", vehiculo.unidad === "h" ? "Operador" : "Chofer", "Mecánico", "Qué se hizo"].map((c) => (
                    <th key={c} className="px-4 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orden.map((s) => (
                  <tr key={s.id} className="border-t border-ink/10 align-top hover:bg-brand-100/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link to={`/panel/taller/${enLaDireccion(vehiculo.patente)}/service/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                        {fmtDate(s.fecha)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <CodigoPill tipos={s.tipos} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{s.km.toLocaleString("es-UY")}</td>
                    <td className="px-4 py-3">{s.chofer}</td>
                    <td className="px-4 py-3">{s.mecanico}</td>
                    <td className="px-4 py-3 text-ink/65">{resumenDeItems(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-ink/10 md:hidden">
            {orden.map((s) => (
              <FilaDeService key={s.id} s={s} v={vehiculo} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "9 cosas: Aceite de motor, Filtro de aceite, Alternador…" */
export function resumenDeItems(s: Service): string {
  if (s.items.length === 0) return s.obs;
  const nombres = s.items.slice(0, 3).map((i) => i.pieza.split(" · ")[0]);
  return `${s.items.length} ${s.items.length === 1 ? "cosa" : "cosas"}: ${nombres.join(", ")}${s.items.length > 3 ? "…" : ""}`;
}

function FilaDeService({ s, v }: { s: Service; v: Vehiculo }) {
  return (
    <li>
      <Link to={`/panel/taller/${enLaDireccion(v.patente)}/service/${s.id}`} className="block min-h-[44px] px-4 py-3 active:bg-brand-100">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <CodigoPill tipos={s.tipos} />
            <span className="font-cond text-base font-semibold">{fmtDate(s.fecha)}</span>
          </span>
          <span className="font-cond text-sm font-semibold tabular-nums text-ink/70">{fmtUso(v, s.km)}</span>
        </div>
        <div className="mt-1 text-xs text-ink/55">
          {v.unidad === "h" ? "Operador" : "Chofer"} {s.chofer} · Mecánico {s.mecanico}
        </div>
        <div className="mt-0.5 text-sm text-ink/65">{resumenDeItems(s)}</div>
      </Link>
    </li>
  );
}
