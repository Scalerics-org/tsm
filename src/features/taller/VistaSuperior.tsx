import { useId, type KeyboardEvent } from "react";
import {
  ANCHO,
  CUBIERTA_H,
  CUBIERTA_W,
  altoDelDibujo,
  lugarEnElDibujo,
  type Disposicion,
} from "./disposicion";
import { MODELOS } from "./datos";
import { fmtKm, kmEnMiles, pctDeUso, type Estado, type PosicionConCubierta } from "./tipos";
import "./taller.css";

export const COLOR_ESTADO: Record<Estado, string> = {
  verde: "#3f7d4e",
  ambar: "#b0731f",
  rojo: "#a63d33",
};
const SIN_DATO = "#8d9296";
const TINTA = "#1d1f20";
const NAVY = "#1d2d3d";
const CHAPA = "#d9dcde";

interface Props {
  disposicion: Disposicion;
  posiciones: PosicionConCubierta[];
  seleccionada: number | null;
  onSeleccionar: (numero: number) => void;
  /** Si hay un modelo resaltado, el resto de las cubiertas se apaga. */
  modeloResaltado: string | null;
}

/**
 * El vehículo visto desde arriba, con cada cubierta como un botón numerado. El dibujo sale de la disposición
 * (ejes simples o duales): el cuerpo es sólo el fondo, las cubiertas se ubican solas.
 */
export function VistaSuperior({ disposicion, posiciones, seleccionada, onSeleccionar, modeloResaltado }: Props) {
  const alto = altoDelDibujo(disposicion);
  const surcos = useId();
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      className="mx-auto block h-auto w-full max-w-[520px] select-none"
      role="group"
      aria-label={`${disposicion.nombre} visto desde arriba. Tocá una cubierta para ver su ficha.`}
    >
      <defs>
        <pattern id={surcos} width="44" height="7" patternUnits="userSpaceOnUse">
          <rect width="44" height="2.4" fill="#000" opacity="0.2" />
        </pattern>
      </defs>

      <Orientacion alto={alto} />
      {disposicion.carroceria === "tractor" ? (
        <CuerpoTractor d={disposicion} />
      ) : disposicion.carroceria === "rigido" ? (
        <CuerpoRigido d={disposicion} />
      ) : disposicion.carroceria === "acoplado" ? (
        <CuerpoAcoplado d={disposicion} />
      ) : (
        <CuerpoSemirremolque d={disposicion} />
      )}

      {posiciones.map(({ posicion, cubierta, km, estado }) => {
        const { x, y } = lugarEnElDibujo(posicion);
        const modelo = cubierta ? MODELOS[cubierta.modeloId] : undefined;
        const apagada = modeloResaltado != null && cubierta?.modeloId !== modeloResaltado;
        const elegida = seleccionada === posicion.numero;
        const color = estado ? COLOR_ESTADO[estado] : SIN_DATO;
        const pct = pctDeUso(km);
        const alActivar = (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSeleccionar(posicion.numero);
          }
        };
        return (
          <g
            key={posicion.numero}
            className="cubierta"
            data-cubierta={posicion.numero}
            role="button"
            tabIndex={0}
            aria-pressed={elegida}
            aria-label={`Cubierta ${posicion.numero}, ${posicion.nombre}${
              cubierta ? `, ${modelo?.nombre}, ${fmtKm(km)}, ${pct}% de la vida útil` : ", sin cubierta"
            }`}
            onClick={() => onSeleccionar(posicion.numero)}
            onKeyDown={alActivar}
            opacity={apagada ? 0.22 : 1}
          >
            <rect
              className="anillo-foco"
              x={x - 5}
              y={y - 5}
              width={CUBIERTA_W + 10}
              height={CUBIERTA_H + 10}
              rx={9}
              fill="none"
              stroke={elegida ? NAVY : "#5980a6"}
              strokeWidth={elegida ? 3.5 : 3}
              opacity={elegida ? 1 : 0}
            />
            <rect className="cuerpo" x={x} y={y} width={CUBIERTA_W} height={CUBIERTA_H} rx={7} fill={color} stroke={TINTA} strokeOpacity={0.55} strokeWidth={1.5} />
            <rect x={x} y={y} width={CUBIERTA_W} height={CUBIERTA_H} rx={7} fill={`url(#${surcos})`} pointerEvents="none" />
            <line x1={x + 15} x2={x + 15} y1={y + 5} y2={y + CUBIERTA_H - 5} stroke="#000" strokeOpacity={0.22} strokeWidth={1.4} pointerEvents="none" />
            <line x1={x + CUBIERTA_W - 15} x2={x + CUBIERTA_W - 15} y1={y + 5} y2={y + CUBIERTA_H - 5} stroke="#000" strokeOpacity={0.22} strokeWidth={1.4} pointerEvents="none" />
            <circle cx={x + CUBIERTA_W / 2} cy={y + 17} r={12} fill="#fff" stroke={TINTA} strokeOpacity={0.35} pointerEvents="none" />
            <text x={x + CUBIERTA_W / 2} y={y + 17} textAnchor="middle" dominantBaseline="central" className="num-cubierta" pointerEvents="none">
              {posicion.numero}
            </text>
            {/* Las dos cosas, una abajo de la otra: los km que lleva y el % de uso sobre la vida útil. */}
            <text x={x + CUBIERTA_W / 2} y={y + 48} textAnchor="middle" className="pct-cubierta" pointerEvents="none">
              {cubierta ? kmEnMiles(km) : "—"}
            </text>
            <text x={x + CUBIERTA_W / 2} y={y + 63} textAnchor="middle" className="pct-cubierta" pointerEvents="none">
              {cubierta ? `${pct}%` : "—"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Orientacion({ alto }: { alto: number }) {
  return (
    <g className="rotulo-svg">
      <text x={ANCHO / 2} y={14} textAnchor="middle">
        ▲ FRENTE
      </text>
      <text x={12} y={alto - 12}>
        IZQ.
      </text>
      <text x={ANCHO - 12} y={alto - 12} textAnchor="end">
        DER.
      </text>
    </g>
  );
}

/** Un cartelito con el nombre del eje, como una cota de plano. */
function Cota({ x, y, texto, ancho = 100 }: { x: number; y: number; texto: string; ancho?: number }) {
  return (
    <g>
      <rect x={x - ancho / 2} y={y - 9} width={ancho} height={18} fill="#fff" stroke={TINTA} strokeOpacity={0.4} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="cota-svg">
        {texto.toUpperCase()}
      </text>
    </g>
  );
}

function Eje({ y, desde, hasta }: { y: number; desde: number; hasta: number }) {
  return (
    <g>
      <line x1={desde} x2={hasta} y1={y} y2={y} stroke="#8d9296" strokeWidth={9} strokeLinecap="butt" />
      <line x1={desde} x2={hasta} y1={y} y2={y} stroke="#fff" strokeOpacity={0.35} strokeWidth={2} />
    </g>
  );
}

function CuerpoTractor({ d }: { d: Disposicion }) {
  const centro = ANCHO / 2;
  const alto = altoDelDibujo(d);
  const fin = alto - 56;
  return (
    <g stroke={TINTA} strokeOpacity={0.55} fill="none">
      {/* Los ejes, debajo de todo. */}
      {d.ejes.map((e) => (
        <Eje key={e.id} y={e.y} desde={e.tipo === "simple" ? 90 : 118} hasta={e.tipo === "simple" ? ANCHO - 90 : ANCHO - 118} />
      ))}
      {/* Chasis: dos largueros con travesaños. */}
      <rect x={150} y={130} width={7} height={fin - 130} fill={CHAPA} />
      <rect x={203} y={130} width={7} height={fin - 130} fill={CHAPA} />
      {[160, 246, 376, fin - 4].map((y) => (
        <rect key={y} x={150} y={y} width={60} height={6} fill={CHAPA} />
      ))}
      {/* Tanques de combustible y caja de cambios. */}
      <rect x={116} y={170} width={30} height={84} rx={8} fill="#eceeef" />
      <rect x={214} y={170} width={30} height={84} rx={8} fill="#eceeef" />
      <rect x={165} y={172} width={30} height={58} rx={4} fill="#eceeef" />
      {/* La quinta rueda, donde se engancha el semirremolque. */}
      <path d="M 152 240 L 208 240 L 208 278 L 186 278 L 180 264 L 174 278 L 152 278 Z" fill="#d6ebff" strokeOpacity={0.7} />
      <text x={centro} y={254} textAnchor="middle" className="cota-svg" stroke="none" fill={TINTA} fillOpacity={0.55} style={{ fontSize: 8 }}>
        QUINTA
      </text>
      {/* Cardán y diferenciales. */}
      <line x1={centro} x2={centro} y1={230} y2={d.ejes[d.ejes.length - 1].y} strokeWidth={5} strokeOpacity={0.45} />
      {d.ejes
        .filter((e) => e.tipo === "dual")
        .map((e) => (
          <ellipse key={e.id} cx={centro} cy={e.y} rx={25} ry={19} fill="#eceeef" />
        ))}
      <Cabina />
      {/* Los nombres de los ejes. */}
      {d.ejes.map((e, i) => (
        <Cota key={e.id} x={centro} y={i === 0 ? e.y + 46 : e.y - 38} texto={e.nombre} />
      ))}
    </g>
  );
}

function CuerpoSemirremolque({ d }: { d: Disposicion }) {
  const centro = ANCHO / 2;
  const alto = altoDelDibujo(d);
  const fin = alto - 46;
  return (
    <g stroke={TINTA} strokeOpacity={0.55} fill="none">
      {/* La caja del semirremolque. */}
      <rect x={124} y={28} width={112} height={fin - 28} rx={7} fill="#fff" strokeOpacity={0.7} strokeWidth={1.6} />
      <rect x={134} y={38} width={92} height={fin - 48} rx={4} strokeOpacity={0.25} />
      {[150, 210, 270, 330].map((y) => (
        <line key={y} x1={134} x2={226} y1={y} y2={y} strokeOpacity={0.14} />
      ))}
      {/* Perno rey y patas de apoyo. */}
      <circle cx={centro} cy={76} r={16} fill="#eceeef" strokeOpacity={0.7} />
      <circle cx={centro} cy={76} r={5} fill={TINTA} fillOpacity={0.55} />
      <text x={centro} y={106} textAnchor="middle" className="cota-svg" stroke="none" fill={TINTA} fillOpacity={0.7}>
        PERNO REY
      </text>
      <rect x={138} y={214} width={14} height={34} fill={CHAPA} strokeDasharray="3 2" />
      <rect x={208} y={214} width={14} height={34} fill={CHAPA} strokeDasharray="3 2" />
      {d.ejes.map((e) => (
        <Eje key={e.id} y={e.y} desde={118} hasta={ANCHO - 118} />
      ))}
      {/* Los nombres de los ejes. */}
      {d.ejes.map((e) => (
        <Cota key={e.id} x={centro} y={e.y} texto={e.nombre} ancho={70} />
      ))}
    </g>
  );
}

function CuerpoAcoplado({ d }: { d: Disposicion }) {
  const centro = ANCHO / 2;
  const fin = altoDelDibujo(d) - 46;
  return (
    <g stroke={TINTA} strokeOpacity={0.55} fill="none">
      {/* La lanza en A, con el ojal de enganche. */}
      <path d="M 176 36 L 124 130 M 184 36 L 236 130" strokeWidth={5} strokeLinecap="round" />
      <line x1={centro} x2={centro} y1={70} y2={130} strokeWidth={3} strokeOpacity={0.4} />
      <circle cx={centro} cy={28} r={8} fill="#fff" strokeWidth={2.5} />
      <text x={centro + 40} y={40} className="cota-svg" stroke="none" fill={TINTA} fillOpacity={0.7}>
        LANZA
      </text>
      {/* La caja. */}
      <rect x={112} y={124} width={136} height={fin - 124} rx={6} fill="#fff" strokeOpacity={0.7} strokeWidth={1.6} />
      <rect x={122} y={134} width={116} height={fin - 144} rx={4} strokeOpacity={0.25} />
      {[190, 250, 310, 370].map((y) => (
        <line key={y} x1={122} x2={238} y1={y} y2={y} strokeOpacity={0.14} />
      ))}
      {d.ejes.map((e) => (
        <Eje key={e.id} y={e.y} desde={94} hasta={ANCHO - 94} />
      ))}
      {d.ejes.map((e) => (
        <Cota key={e.id} x={centro} y={e.y} texto={e.nombre} ancho={70} />
      ))}
    </g>
  );
}

/** La cabina, vista desde arriba: la comparten el tractor y el rígido. */
function Cabina() {
  return (
    <g>
      <rect x={98} y={56} width={14} height={24} rx={3} fill="#fff" />
      <rect x={248} y={56} width={14} height={24} rx={3} fill="#fff" />
      <rect x={112} y={26} width={136} height={110} rx={16} fill="#fff" strokeOpacity={0.7} strokeWidth={1.6} />
      <rect x={122} y={35} width={116} height={26} rx={5} fill="#d6ebff" />
      <rect x={126} y={70} width={108} height={54} rx={6} />
      <line x1={126} x2={234} y1={86} y2={86} strokeOpacity={0.3} />
    </g>
  );
}

/** Camión rígido: la cabina y, detrás, su caja de carga (no es un tractor: no lleva quinta rueda). */
function CuerpoRigido({ d }: { d: Disposicion }) {
  const centro = ANCHO / 2;
  const fin = altoDelDibujo(d) - 46;
  return (
    <g stroke={TINTA} strokeOpacity={0.55} fill="none">
      {/* El eje de dirección, debajo de la cabina. */}
      <Eje y={d.ejes[0].y} desde={90} hasta={ANCHO - 90} />
      <Cabina />
      <rect x={150} y={136} width={7} height={22} fill={CHAPA} />
      <rect x={203} y={136} width={7} height={22} fill={CHAPA} />
      {/* La caja de carga. */}
      <rect x={118} y={160} width={124} height={fin - 160} rx={6} fill="#fff" strokeOpacity={0.7} strokeWidth={1.6} />
      <rect x={128} y={170} width={104} height={fin - 180} rx={4} strokeOpacity={0.25} />
      {[230, 290, 350, 410].filter((y) => y < fin - 20).map((y) => (
        <line key={y} x1={128} x2={232} y1={y} y2={y} strokeOpacity={0.14} />
      ))}
      {d.ejes.slice(1).map((e) => (
        <Eje key={e.id} y={e.y} desde={118} hasta={ANCHO - 118} />
      ))}
      <Cota x={centro} y={d.ejes[0].y + 46} texto={d.ejes[0].nombre} />
      {d.ejes.slice(1).map((e) => (
        <Cota key={e.id} x={centro} y={e.y} texto={e.nombre} ancho={104} />
      ))}
      <text x={centro} y={200} textAnchor="middle" className="cota-svg" stroke="none" fill={TINTA} fillOpacity={0.5}>
        CAJA DE CARGA
      </text>
    </g>
  );
}
