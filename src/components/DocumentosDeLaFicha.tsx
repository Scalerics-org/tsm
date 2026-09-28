import { estadoDeVencimiento, hoyEnUruguay, type EstadoVencimiento } from "@shared/vencimientos";
import { fmtDate } from "../lib/format";

const ESTILO: Record<EstadoVencimiento, string> = {
  vencido: "border-l-st-redDot bg-st-redBg text-st-redTx",
  por_vencer: "border-l-st-amberDot bg-st-amberBg text-st-amberTx",
  vigente: "border-l-st-greenDot bg-st-greenBg text-st-greenTx",
  sin_fecha: "",
};
const ROTULO: Record<EstadoVencimiento, string> = {
  vencido: "vencido",
  por_vencer: "por vencer",
  vigente: "vigente",
  sin_fecha: "",
};

/**
 * Los vencimientos de documentos en la ficha del camión o del chofer.
 *
 * Sólo se listan los que tienen fecha. Sin ninguna cargada la ficha no se llena de rojos ni dice
 * "vencido": no se sabe no es lo mismo que vencido, y se dice en una línea tranquila. Sólo avisa.
 */
export function DocumentosDeLaFicha({
  documentos,
  dondeCargar,
}: {
  documentos: { nombre: string; fecha: string | null | undefined }[];
  /** Dónde se cargan, para la línea de "no hay ninguna". */
  dondeCargar: string;
}) {
  const hoy = hoyEnUruguay();
  const conFecha = documentos.filter((d) => d.fecha);
  if (!conFecha.length) {
    return <p className="text-sm text-ink/50">Sin vencimientos de documentos cargados. Se cargan desde {dondeCargar}.</p>;
  }
  return (
    <div>
      <div className="mb-1 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        Documentos
      </div>
      <ul className="flex flex-wrap gap-2 text-sm">
        {conFecha.map((d) => {
          const estado = estadoDeVencimiento(d.fecha, hoy);
          return (
            <li
              key={d.nombre}
              className={`border-l-4 px-3 py-1.5 ${ESTILO[estado] || "border-l-ink/20 bg-surface text-ink/70"}`}
            >
              <span className="font-medium">{d.nombre}</span> {fmtDate(d.fecha ?? null)}
              {ROTULO[estado] && <span className="ml-1 opacity-80">· {ROTULO[estado]}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
