import { Link, useSearchParams } from "react-router-dom";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { enLaDireccion } from "./datos";
import { buscarEnHistorial, type Coincidencia } from "./servicio";
import { TipoPill } from "./TabServices";
import { fmtUso, type AccionHecha, type Vehiculo } from "./tipos";

const SUGERENCIAS = ["alternador", "zapatas", "cubierta 7", "rulemanes", "filtro de aire"];

export const TEXTO_ACCION: Record<AccionHecha, string> = { reparado: "Reparado", nuevo: "Nuevo", revisado: "Revisado" };
export const CLASE_ACCION: Record<AccionHecha, string> = {
  reparado: "border-st-amberBd bg-st-amberBg text-st-amberTx",
  nuevo: "border-st-greenBd bg-st-greenBg text-st-greenTx",
  revisado: "border-ink/25 bg-white text-ink/70",
};

export function Accion({ accion }: { accion: AccionHecha }) {
  return (
    <span className={`border px-2 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-[0.1em] ${CLASE_ACCION[accion]}`}>
      {TEXTO_ACCION[accion]}
    </span>
  );
}

/**
 * "Cuando rompe algo, buscar en qué service se le cambió." Se escribe una pieza ("alternador", "zapatas",
 * "cubierta 7") y salen los services donde aparece, con la fecha, los km y qué se le hizo.
 */
export function TabHistorial({ vehiculo }: { vehiculo: Vehiculo }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const buscar = (texto: string) => {
    const sig = new URLSearchParams(params);
    if (texto) sig.set("q", texto);
    else sig.delete("q");
    setParams(sig, { replace: true });
  };
  const resultados = buscarEnHistorial(vehiculo.services, q);
  const cantidadDeServices = new Set(resultados.map((r) => r.service.id)).size;

  return (
    <div className="space-y-5">
      <div className="panel p-4">
        <Corners />
        <label htmlFor="pieza" className="kicker block">
          Buscar una pieza en el historial
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="pieza"
            type="search"
            value={q}
            onChange={(e) => buscar(e.target.value)}
            placeholder="alternador, zapatas, cubierta 7…"
            className="input min-h-[44px] text-base"
            autoComplete="off"
          />
          {q && (
            <button type="button" onClick={() => buscar("")} className="btn btn-secondary min-h-[44px]">
              Limpiar
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => buscar(s)}
              className="min-h-[44px] border border-ink/[.22] bg-white px-3 font-cond text-sm font-semibold text-ink/75 hover:bg-ink/[.05]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {!q.trim() ? (
        <p className="max-w-prose text-sm text-ink/60">
          Escribí la pieza que se rompió y te muestra en qué services se la tocó: cuándo, a cuántos km y qué se hizo.
          Probá con una de las de arriba.
        </p>
      ) : resultados.length === 0 ? (
        <div className="panel p-5 text-sm text-ink/65">
          <Corners />
          Ningún service de {vehiculo.patente} tiene "{q}". Probá con otra palabra: "alternador", "zapatas", "filtro".
        </div>
      ) : (
        <section>
          <h2 className="mb-2 font-cond text-xl">
            {resultados.length} {resultados.length === 1 ? "vez" : "veces"} en {cantidadDeServices}{" "}
            {cantidadDeServices === 1 ? "service" : "services"}
          </h2>
          <ul className="space-y-2">
            {resultados.map((r, i) => (
              <Resultado key={`${r.service.id}-${i}`} r={r} v={vehiculo} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Resultado({ r, v }: { r: Coincidencia; v: Vehiculo }) {
  const { service: s, item } = r;
  return (
    <li className="panel p-0">
      <Link to={`/panel/taller/${enLaDireccion(v.patente)}/service/${s.id}`} className="block px-4 py-3 hover:bg-brand-100/50">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="flex items-center gap-2.5">
            <TipoPill tipo={s.tipo} />
            <span className="font-cond text-lg font-semibold">{fmtDate(s.fecha)}</span>
            <span className="font-cond text-sm font-semibold tabular-nums text-ink/60">{fmtUso(v, s.km)}</span>
          </span>
          <Accion accion={item.accion} />
        </div>
        <div className="mt-1 text-[15px] font-semibold text-ink">
          {item.pieza}
          <span className="font-normal text-ink/55">
            {" "}
            · {item.seccion}
            {item.sujeto && item.sujeto !== item.pieza ? ` · ${item.sujeto}` : ""}
          </span>
        </div>
        <div className="text-xs text-ink/60">
          {[item.medida, item.obs].filter(Boolean).join(" · ") || "Sin más datos."} · Mecánico {s.mecanico} · {v.unidad === "h" ? "Operador" : "Chofer"} {s.chofer}
        </div>
      </Link>
    </li>
  );
}
