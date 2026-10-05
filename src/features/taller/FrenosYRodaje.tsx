import { useState } from "react";
import { fmtDate } from "../../lib/format";
import type { GrupoDePieza, PiezaDeRueda } from "./datos-extra";
import { COLOR_ESTADO } from "./VistaSuperior";
import { type Estado, type Vehiculo, fmtUso } from "./tipos";

const FONDO: Record<Estado, string> = { verde: "#e0eee3", ambar: "#f6ecd9", rojo: "#f6e2df" };
const TEXTO_ESTADO: Record<Estado, string> = { verde: "Bien", ambar: "A mirar", rojo: "Para cambiar" };
const GRUPOS: { id: GrupoDePieza; titulo: string }[] = [
  { id: "rueda", titulo: "Rueda" },
  { id: "freno", titulo: "Frenos" },
  { id: "rodaje", titulo: "Rodaje" },
];

/**
 * Lo de adentro de una rueda: el despiece de 21.jpg dibujado, con cada pieza pintada según cómo está, y debajo la
 * lista (frenos y rodaje, como en el Excel) con la medida, cuándo se cambió y cuántos km lleva.
 */
export function FrenosYRodaje({ vehiculo, piezas }: { vehiculo: Vehiculo; piezas: PiezaDeRueda[] }) {
  const [elegida, setElegida] = useState<string | null>(null);
  const por = new Map(piezas.map((p) => [p.id, p]));
  const aMirar = piezas.filter((p) => p.estado !== "verde").length;

  return (
    <div className="space-y-5 px-4 py-4">
      <p className="text-xs leading-relaxed text-ink/60">
        La rueda por dentro. Cada pieza va pintada como las cubiertas: verde bien, ámbar a mirar, rojo para cambiar.
        {aMirar > 0 ? ` Hoy hay ${aMirar} para mirar o cambiar.` : ""}
      </p>
      <Despiece por={por} elegida={elegida} onElegir={(id) => setElegida(elegida === id ? null : id)} />

      {GRUPOS.map((g) => (
        <section key={g.id}>
          <h3 className="kicker mb-1">{g.titulo}</h3>
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {piezas
              .filter((p) => p.grupo === g.id)
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setElegida(elegida === p.id ? null : p.id)}
                    aria-pressed={elegida === p.id}
                    className={`flex min-h-[44px] w-full items-start gap-3 py-2 pl-3 pr-2 text-left ${elegida === p.id ? "bg-brand-100" : "hover:bg-ink/[.04]"}`}
                    style={{ boxShadow: `inset 4px 0 0 ${COLOR_ESTADO[p.estado]}` }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{p.nombre}</span>
                      <span className="block text-xs text-ink/55">
                        {p.medida && (
                          <b className="font-semibold tabular-nums text-ink/80">
                            {p.medida.valor.toLocaleString("es-UY")} {p.medida.unidad}
                            <span className="font-normal text-ink/50">
                              {" "}
                              ({p.medida.sentido === "min" ? "mín." : "máx."} {p.medida.limite} {p.medida.unidad}) ·{" "}
                            </span>
                          </b>
                        )}
                        {fmtDate(p.fecha)} · hace {fmtUso(vehiculo, p.kmDesde)}
                      </span>
                      {p.obs && <span className="block text-xs text-ink/60">{p.obs}</span>}
                    </span>
                    <span className="flex-none pt-0.5 font-cond text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: COLOR_ESTADO[p.estado] }}>
                      {TEXTO_ESTADO[p.estado]}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="text-[11px] leading-relaxed text-ink/45">
        Los límites (zapatas 5 mm, tambor 422 mm) son de ejemplo. Los que valen los define Rodrigo.
      </p>
    </div>
  );
}

interface Forma {
  id: string;
  rotulo: string;
  ancla: [number, number];
  dibujo: (p: { fill: string; stroke: string; strokeWidth: number }) => JSX.Element;
}

/** El despiece de la foto 21.jpg en un dibujo chico: de arriba las cubiertas duales, hacia abajo el freno y el eje. */
const FORMAS: Forma[] = [
  { id: "llanta", ancla: [180, 78], rotulo: "Llanta", dibujo: (s) => <rect x={70} y={74} width={110} height={8} rx={1.5} {...s} /> },
  { id: "disco", ancla: [130, 115], rotulo: "Disco de rueda", dibujo: (s) => <rect x={123} y={82} width={7} height={67} {...s} /> },
  { id: "tambor", ancla: [118, 92], rotulo: "Tambor (campana)", dibujo: (s) => <rect x={62} y={88} width={56} height={9} rx={1.5} {...s} /> },
  { id: "zapatas", ancla: [113, 105], rotulo: "Zapatas / cintas", dibujo: (s) => <rect x={68} y={101} width={45} height={9} rx={1.5} {...s} /> },
  { id: "bulones", ancla: [135, 127], rotulo: "Bulones y tuercas", dibujo: (s) => <rect x={118} y={124} width={17} height={7} {...s} /> },
  { id: "maza", ancla: [180, 162], rotulo: "Maza", dibujo: (s) => <rect x={130} y={149} width={50} height={27} rx={2} {...s} /> },
  {
    id: "rulemanes",
    ancla: [176, 169],
    rotulo: "Rulemanes",
    dibujo: (s) => (
      <>
        <circle cx={140} cy={169} r={6} {...s} />
        <circle cx={170} cy={169} r={6} {...s} />
      </>
    ),
  },
  { id: "tapa", ancla: [194, 166], rotulo: "Tapa de maza", dibujo: (s) => <rect x={181} y={155} width={13} height={21} rx={2} {...s} /> },
  { id: "punta", ancla: [196, 184], rotulo: "Punta de eje", dibujo: (s) => <rect x={116} y={178} width={80} height={13} rx={2} {...s} /> },
  { id: "leva", ancla: [98, 117], rotulo: "Leva S", dibujo: (s) => <circle cx={92} cy={117} r={6} {...s} /> },
  { id: "matraca", ancla: [94, 207], rotulo: "Matraca", dibujo: (s) => <rect x={52} y={198} width={42} height={19} rx={2} {...s} /> },
  { id: "pulmon", ancla: [75, 258], rotulo: "Pulmón de freno", dibujo: (s) => <circle cx={60} cy={258} r={15} {...s} /> },
  { id: "eje", ancla: [48, 178], rotulo: "Eje", dibujo: (s) => <rect x={30} y={178} width={86} height={13} rx={2} {...s} /> },
];

function Despiece({
  por,
  elegida,
  onElegir,
}: {
  por: Map<string, PiezaDeRueda>;
  elegida: string | null;
  onElegir: (id: string) => void;
}) {
  // Las etiquetas van a la derecha, en columna, como en el dibujo de referencia.
  const x0 = 214;
  return (
    <svg viewBox="0 0 330 280" className="block h-auto w-full" role="group" aria-label="Despiece de la rueda">
      {/* Las cubiertas duales: sólo de referencia, su ficha es la otra solapa. */}
      <g fill="#eceeef" stroke="#1d1f20" strokeOpacity={0.35}>
        <rect x={70} y={12} width={49} height={62} rx={7} />
        <rect x={131} y={12} width={49} height={62} rx={7} />
      </g>
      <line x1={92} y1={123} x2={92} y2={198} stroke="#1d1f20" strokeOpacity={0.4} strokeWidth={2.2} />
      <line x1={76} y1={216} x2={60} y2={244} stroke="#1d1f20" strokeOpacity={0.4} strokeWidth={3} />

      {FORMAS.map((f, i) => {
        const p = por.get(f.id);
        if (!p) return null;
        const activa = elegida === f.id;
        const y = 16 + i * 20.2;
        return (
          <g
            key={f.id}
            role="button"
            tabIndex={0}
            aria-pressed={activa}
            aria-label={`${f.rotulo}: ${TEXTO_ESTADO[p.estado]}`}
            className="pieza"
            onClick={() => onElegir(f.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onElegir(f.id);
              }
            }}
          >
            {f.dibujo({ fill: FONDO[p.estado], stroke: COLOR_ESTADO[p.estado], strokeWidth: activa ? 3 : 1.6 })}
            <line x1={x0 - 16} y1={y} x2={f.ancla[0]} y2={f.ancla[1]} stroke="#1d1f20" strokeOpacity={0.3} strokeDasharray="2 2.5" />
            <text x={x0} y={y} dominantBaseline="central" className="rotulo-pieza" fontWeight={activa ? 700 : 500}>
              {f.rotulo}
            </text>
            <circle cx={x0 - 12} cy={y} r={3.5} fill={COLOR_ESTADO[p.estado]} />
          </g>
        );
      })}
    </svg>
  );
}
