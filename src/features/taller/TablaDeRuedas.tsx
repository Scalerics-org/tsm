import { Link } from "react-router-dom";
import { Corners } from "../../components/ui";
import { piezasDeRueda, type PiezaDeRueda } from "./datos-extra";
import { posiciones, type Disposicion } from "./disposicion";
import { COLOR_ESTADO } from "./VistaSuperior";
import { fmtUso, type Vehiculo } from "./tipos";

/** Las columnas de la planilla por grupo: la pieza de datos-extra que cuenta para cada una. */
const COLUMNAS: Record<"frenos" | "rodaje", { id: string; titulo: string }[]> = {
  frenos: [
    { id: "zapatas", titulo: "Cintas (mm)" },
    { id: "tambor", titulo: "Campana (mm)" },
    { id: "bujes", titulo: "Bujes" },
  ],
  rodaje: [
    { id: "rulemanes", titulo: "Rulemán" },
    { id: "reten", titulo: "Retén" },
    { id: "grasa", titulo: "Grasa" },
  ],
};

const TITULO: Record<"frenos" | "rodaje", string> = { frenos: "Frenos por rueda", rodaje: "Rodaje por rueda" };

/**
 * Frenos o rodaje de cada rueda, como la planilla: una fila por rueda y una columna por pieza. El estado sale de
 * `piezasDeRueda`, el mismo cálculo que la solapa Frenos y rodaje de cada cubierta. Tocar el número de la rueda abre esa
 * solapa.
 */
export function TablaDeRuedas({ vehiculo, disposicion, grupo }: { vehiculo: Vehiculo; disposicion: Disposicion; grupo: "frenos" | "rodaje" }) {
  const columnas = COLUMNAS[grupo];
  return (
    <section className="panel">
      <Corners />
      <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">{TITULO[grupo]}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
              <th className="px-4 py-2 font-semibold">Rueda</th>
              {columnas.map((c) => (
                <th key={c.id} className="px-3 py-2 font-semibold">
                  {c.titulo}
                </th>
              ))}
              <th className="px-4 py-2 font-semibold">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {posiciones(disposicion).map((posicion) => {
              const piezas = piezasDeRueda(vehiculo, posicion.numero);
              const porId = new Map(piezas.map((p) => [p.id, p]));
              const obs = piezas
                .filter((p) => p.grupo === grupo && p.obs)
                .map((p) => `${p.nombre}: ${p.obs}`)
                .join(" · ");
              return (
                <tr key={posicion.numero} className="border-t border-ink/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      to={{ search: new URLSearchParams({ tab: "mantenimiento", sec: "ejes", cubierta: String(posicion.numero), rueda: "frenos" }).toString() }}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {posicion.numero}
                    </Link>
                    <span className="block text-xs text-ink/55">{posicion.nombre}</span>
                  </td>
                  {columnas.map((c) => {
                    const p = porId.get(c.id);
                    return <td key={c.id} className="whitespace-nowrap px-3 py-3">{p && <Celda p={p} vehiculo={vehiculo} />}</td>;
                  })}
                  <td className="px-4 py-3 text-xs text-ink/65">{obs || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink/10 px-4 py-2 text-[11px] leading-relaxed text-ink/45">
        Verde bien, ámbar a mirar, rojo para cambiar. Los límites (cintas 5 mm, campana 422 mm) son de ejemplo; los que valen los define Rodrigo.
      </p>
    </section>
  );
}

/** Una celda: la medida si la pieza la tiene (con su mínimo o máximo), y si no, hace cuánto se la cambió. */
function Celda({ p, vehiculo }: { p: PiezaDeRueda; vehiculo: Vehiculo }) {
  return (
    <span className="block font-semibold" style={{ color: COLOR_ESTADO[p.estado] }}>
      {p.medida ? (
        <>
          {p.medida.valor.toLocaleString("es-UY")} {p.medida.unidad}
          <span className="block text-[11px] font-normal text-ink/50">
            {p.medida.sentido === "min" ? "mín." : "máx."} {p.medida.limite}
          </span>
        </>
      ) : (
        <>
          hace {fmtUso(vehiculo, p.kmDesde)}
        </>
      )}
    </span>
  );
}
