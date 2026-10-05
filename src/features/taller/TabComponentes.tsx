import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { fmtUso, type CondicionPieza, type Vehiculo } from "./tipos";

const CONDICION: Record<CondicionPieza, { texto: string; clase: string }> = {
  original: { texto: "Original", clase: "border-ink/25 bg-white text-ink/70" },
  reparado: { texto: "Reparado", clase: "border-st-amberBd bg-st-amberBg text-st-amberTx" },
  nuevo: { texto: "Nuevo", clase: "border-st-greenBd bg-st-greenBg text-st-greenTx" },
};

/** Motor, caja, diferencial, chasis y electricidad: por pieza, si es original, reparada o nueva, y a cuántos km. */
export function TabComponentes({ vehiculo }: { vehiculo: Vehiculo }) {
  if (vehiculo.componentes.length === 0) {
    return <div className="panel p-5 text-sm text-ink/60">Este vehículo no tiene componentes cargados.</div>;
  }
  return (
    <div className="space-y-5">
      <p className="max-w-prose text-xs leading-relaxed text-ink/55">
        Lo que se le fue cambiando o reparando a cada componente, con el {vehiculo.unidad === "h" ? "horímetro" : "odómetro"} del momento.
        Una pieza "original" es la de fábrica, que nunca se tocó.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {vehiculo.componentes.map((c) => (
          <section key={c.id} className="panel">
            <Corners />
            <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">{c.nombre}</h2>
            <ul className="divide-y divide-ink/10">
              {c.piezas.map((p) => (
                <li key={p.nombre} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-semibold text-ink">{p.nombre}</span>
                    <span className={`border px-2 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-[0.1em] ${CONDICION[p.condicion].clase}`}>
                      {CONDICION[p.condicion].texto}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-ink/55">
                    {p.condicion === "original"
                      ? "De fábrica"
                      : `${fmtDate(p.fecha)} · a ${vehiculo.unidad === "h" ? "las" : "los"} ${fmtUso(vehiculo, p.alKm)}`}
                  </div>
                  {p.obs && <div className="text-xs text-ink/65">{p.obs}</div>}
                </li>
              ))}
            </ul>
            {c.obs && (
              <p className="border-t border-ink/10 px-4 py-2.5 text-xs text-ink/65">
                <b className="font-cond uppercase tracking-[0.1em] text-ink/50">Obs. </b>
                {c.obs}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
