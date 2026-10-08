import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { fmtUso, type Componente, type PiezaDeComponente, type Vehiculo } from "./tipos";

/**
 * La hoja de un componente, como la planilla: por pieza, la fecha y los km en que se repuso o reparó, y la observación del
 * componente. Electricidad es sólo la observación: su planilla no tiene piezas.
 */
export function SeccionDeComponente({ vehiculo, componente }: { vehiculo: Vehiculo; componente: Componente }) {
  const unidad = vehiculo.unidad === "h" ? "horímetro" : "odómetro";
  if (componente.id === "electricidad") {
    return (
      <section className="panel">
        <Corners />
        <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">{componente.nombre}</h2>
        <p className="px-4 py-3 text-sm text-ink/75">{componente.obs || "Sin observaciones."}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-xs leading-relaxed text-ink/55">
        Lo que se le fue cambiando o reparando, con el {unidad} del momento ({fmtUso(vehiculo, vehiculo.km)} hoy). Una pieza "original" es la de fábrica,
        que nunca se tocó.
      </p>
      <section className="panel">
        <Corners />
        <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">{componente.nombre}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
                {["Pieza", "Km", "Reparado", "Nuevo", "Obs."].map((c) => (
                  <th key={c} className="px-4 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {componente.piezas.map((p) => (
                <FilaDePieza key={p.nombre} p={p} vehiculo={vehiculo} />
              ))}
            </tbody>
          </table>
        </div>
        {componente.obs && (
          <p className="border-t border-ink/10 px-4 py-2.5 text-xs text-ink/65">
            <b className="font-cond uppercase tracking-[0.1em] text-ink/50">Obs. </b>
            {componente.obs}
          </p>
        )}
      </section>
    </div>
  );
}

function FilaDePieza({ p, vehiculo }: { p: PiezaDeComponente; vehiculo: Vehiculo }) {
  const cambiada = p.condicion !== "original";
  const cuando = `${fmtDate(p.fecha)} · a ${vehiculo.unidad === "h" ? "las" : "los"} ${fmtUso(vehiculo, p.alKm)}`;
  return (
    <tr className="border-t border-ink/10 align-top">
      <td className="px-4 py-2.5 font-semibold text-ink">{p.nombre}</td>
      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink/70">{cambiada ? fmtUso(vehiculo, p.alKm) : "—"}</td>
      <td className="px-4 py-2.5 text-xs text-ink/70">{p.condicion === "reparado" ? cuando : "—"}</td>
      <td className="px-4 py-2.5 text-xs text-ink/70">{p.condicion === "nuevo" ? cuando : "—"}</td>
      <td className="px-4 py-2.5 text-xs text-ink/65">{p.condicion === "original" ? "De fábrica" : p.obs || "—"}</td>
    </tr>
  );
}
