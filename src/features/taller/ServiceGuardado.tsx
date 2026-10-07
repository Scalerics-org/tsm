import { Link, useParams, useSearchParams } from "react-router-dom";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { enLaDireccion } from "./datos";
import { Accion } from "./TabHistorial";
import { CodigoPill } from "./TabServices";
import { NOMBRE_OTRO, TIPOS_DE_SERVICE, descripcionDeTipo } from "./tipos-de-service";
import { fmtUso, type ItemHecho, type Vehiculo } from "./tipos";

/** Un service ya guardado: la cabecera con sus datos y, debajo, SÓLO lo que se marcó, por sección. */
export function ServiceGuardado({ vehiculo }: { vehiculo: Vehiculo }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const s = vehiculo.services.find((x) => x.id === id);
  const volver = `/panel/taller/${enLaDireccion(vehiculo.patente)}?tab=services`;
  if (!s) {
    return (
      <div className="panel p-5">
        <Corners />
        <p className="text-sm text-ink/65">
          No encuentro ese service. Los que se cargan en la maqueta se pierden al recargar la página.
        </p>
        <Link to={volver} className="mt-3 inline-block text-sm text-brand-700 hover:underline">
          ← Volver a los services
        </Link>
      </div>
    );
  }
  const porSeccion = new Map<string, ItemHecho[]>();
  for (const i of s.items) porSeccion.set(i.seccion, [...(porSeccion.get(i.seccion) ?? []), i]);

  return (
    <div className="space-y-5">
      {params.get("guardado") === "1" && (
        <div role="status" className="border border-st-greenBd bg-st-greenBg px-4 py-3 text-sm text-st-greenTx">
          <b>Service guardado.</b> En esta maqueta queda hasta que se recargue la página; en el sistema real queda en el historial del
          vehículo.
        </div>
      )}
      <div>
        <Link to={volver} className="font-cond text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
          ← Services de {vehiculo.patente}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <CodigoPill tipos={s.tipos} />
          <h2 className="font-cond text-3xl leading-none">{fmtDate(s.fecha)}</h2>
        </div>
        <ul className="mt-2 space-y-0.5 text-sm text-ink/60">
          {s.tipos.map((t) => {
            const def = TIPOS_DE_SERVICE.find((d) => d.codigo === t);
            return (
              <li key={t} data-tipo-del-service={t}>
                <b className="text-ink/80">{t === "otro" ? "Otro" : t}</b> · {def ? descripcionDeTipo(def) : NOMBRE_OTRO}
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="panel grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-4">
        <Cabecera titulo="Fecha" valor={fmtDate(s.fecha)} />
        <Cabecera titulo={vehiculo.unidad === "h" ? "Horas" : "Km"} valor={fmtUso(vehiculo, s.km)} />
        <Cabecera titulo="Mecánico" valor={s.mecanico} />
        <Cabecera titulo={vehiculo.unidad === "h" ? "Operador" : "Chofer"} valor={s.chofer} />
        <Corners />
      </dl>

      <section>
        <h3 className="mb-2 font-cond text-xl">
          Lo que se hizo <span className="text-base text-ink/50">({s.items.length})</span>
        </h3>
        {s.items.length === 0 ? (
          <p className="text-sm text-ink/60">Este service no tiene ítems cargados.{s.obs ? ` ${s.obs}` : ""}</p>
        ) : (
          <div className="space-y-3">
            {[...porSeccion].map(([seccion, items]) => (
              <div key={seccion} className="panel">
                <h4 className="border-b border-ink/10 px-4 py-2.5 font-cond text-base">{seccion}</h4>
                <ul className="divide-y divide-ink/10">
                  {items.map((i, k) => (
                    <li key={`${i.pieza}-${k}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-ink">
                          {i.pieza}
                          {i.sujeto && !i.pieza.startsWith(i.sujeto.replace("Posición", "Cubierta")) && (
                            <span className="font-normal text-ink/55"> · {i.sujeto}</span>
                          )}
                        </div>
                        {(i.medida || i.obs) && <div className="text-xs text-ink/60">{[i.medida, i.obs].filter(Boolean).join(" · ")}</div>}
                      </div>
                      <Accion accion={i.accion} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Cabecera({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">{titulo}</dt>
      <dd className="mt-0.5 font-cond text-xl font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
