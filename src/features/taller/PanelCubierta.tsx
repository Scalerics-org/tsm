import type { ReactNode } from "react";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { MODELOS } from "./datos";
import { COLOR_ESTADO } from "./VistaSuperior";
import {
  ESTADO_TEXTO,
  UMBRAL_AMBAR,
  UMBRAL_ROJO,
  VIDA_UTIL_KM,
  fmtKm,
  porcentajeDeVida,
  type PosicionConCubierta,
  type Vehiculo,
} from "./tipos";

/** La ficha de una cubierta: en el escritorio queda al lado del dibujo; en el celular sube desde abajo. */
export function PanelCubierta({
  vehiculo,
  item,
  onCerrar,
}: {
  vehiculo: Vehiculo;
  item: PosicionConCubierta;
  onCerrar: () => void;
}) {
  const { posicion, cubierta, km, estado } = item;
  const modelo = cubierta ? MODELOS[cubierta.modeloId] : undefined;
  const pct = porcentajeDeVida(km);
  return (
    <section
      aria-label={`Ficha de la cubierta ${posicion.numero}`}
      className="fixed inset-x-0 bottom-0 z-[600] max-h-[46vh] overflow-y-auto border-t-[3px] border-navy bg-white shadow-elev-lg md:static md:max-h-none md:overflow-visible md:border md:border-t md:border-ink/[.16] md:shadow-none"
    >
      <div className="md:relative">
        <span className="hidden md:block">
          <Corners />
        </span>
        <header className="flex items-start gap-3 border-b border-ink/10 px-4 py-3">
          <span
            className="grid h-11 w-11 flex-none place-items-center font-cond text-xl font-bold text-white"
            style={{ background: estado ? COLOR_ESTADO[estado] : "#8d9296" }}
            aria-hidden
          >
            {posicion.numero}
          </span>
          <div className="min-w-0 flex-1">
            <div className="kicker">Cubierta {posicion.numero}</div>
            <h2 className="font-cond text-[19px] leading-tight text-ink">{posicion.nombre}</h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="-mr-2 -mt-1 grid h-11 w-11 flex-none place-items-center font-cond text-2xl leading-none text-ink/55 hover:text-ink md:hidden"
            aria-label="Cerrar la ficha"
          >
            ×
          </button>
        </header>

        {!cubierta || !modelo ? (
          <p className="px-4 py-5 text-sm text-ink/60">Esta posición no tiene cubierta cargada.</p>
        ) : (
          <div className="space-y-5 px-4 py-4">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="pill"
                  style={{
                    borderColor: estado ? COLOR_ESTADO[estado] : undefined,
                    color: estado ? COLOR_ESTADO[estado] : undefined,
                  }}
                >
                  <i className="pill-dot" style={{ background: estado ? COLOR_ESTADO[estado] : undefined }} />
                  {estado ? ESTADO_TEXTO[estado] : ""}
                </span>
                <span className="font-cond text-sm font-semibold tabular-nums text-ink/70">
                  {Math.round(pct * 100)}% de {fmtKm(VIDA_UTIL_KM)}
                </span>
              </div>
              <BarraDeVida pct={pct} color={estado ? COLOR_ESTADO[estado] : "#8d9296"} />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato titulo="Código" valor={cubierta.codigo} grande />
              <Dato titulo="Modelo" valor={modelo.nombre} sub={modelo.medida} />
              <Dato titulo="Colocada el" valor={fmtDate(cubierta.fecha)} />
              <Dato titulo="Km al colocarla" valor={fmtKm(cubierta.kmInicial)} />
              <Dato
                titulo="Km recorridos"
                valor={fmtKm(km)}
                sub={`${vehiculo.km.toLocaleString("es-UY")} − ${cubierta.kmInicial.toLocaleString("es-UY")}`}
                grande
                ancho
              />
              <Dato titulo="Observaciones" valor={cubierta.obs || "Sin observaciones."} ancho suave={!cubierta.obs} />
            </dl>

            <div>
              <h3 className="kicker mb-2">Historial de esta posición</h3>
              <ol className="relative space-y-0 border-l-2 border-ink/15 pl-4">
                <Historia
                  actual
                  codigo={cubierta.codigo}
                  modelo={`${modelo.nombre}`}
                  fechas={`Desde el ${fmtDate(cubierta.fecha)}`}
                  km={km}
                  detalle="Puesta actual"
                />
                {cubierta.anteriores.map((a) => (
                  <Historia
                    key={a.codigo}
                    codigo={a.codigo}
                    modelo={MODELOS[a.modeloId]?.nombre ?? a.modeloId}
                    fechas={`${fmtDate(a.desde)} → ${fmtDate(a.hasta)}`}
                    km={a.kmRecorridos}
                    detalle={`Salió por: ${a.motivo.toLowerCase()}`}
                  />
                ))}
                {cubierta.anteriores.length === 0 && (
                  <li className="pb-1 pt-3 text-sm text-ink/55">Antes de ésta no hubo otra cargada.</li>
                )}
              </ol>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BarraDeVida({ pct, color }: { pct: number; color: string }) {
  const lleno = Math.min(1, pct) * 100;
  return (
    <div className="relative mt-2 h-3 bg-surface" role="img" aria-label={`${Math.round(pct * 100)}% de la vida útil`}>
      <div className="h-full" style={{ width: `${lleno}%`, background: color }} />
      {[UMBRAL_AMBAR, UMBRAL_ROJO].map((u) => (
        <i key={u} className="absolute top-[-3px] h-[18px] w-px bg-ink/55" style={{ left: `${u * 100}%` }} />
      ))}
    </div>
  );
}

function Dato({
  titulo,
  valor,
  sub,
  grande,
  ancho,
  suave,
}: {
  titulo: string;
  valor: ReactNode;
  sub?: string;
  grande?: boolean;
  ancho?: boolean;
  suave?: boolean;
}) {
  return (
    <div className={ancho ? "col-span-2" : undefined}>
      <dt className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">{titulo}</dt>
      <dd
        className={`mt-0.5 ${grande ? "font-cond text-2xl font-semibold tabular-nums" : "text-[15px]"} ${
          suave ? "text-ink/45" : "text-ink"
        }`}
      >
        {valor}
      </dd>
      {sub && <dd className="text-xs tabular-nums text-ink/50">{sub}</dd>}
    </div>
  );
}

function Historia({
  codigo,
  modelo,
  fechas,
  km,
  detalle,
  actual,
}: {
  codigo: string;
  modelo: string;
  fechas: string;
  km: number;
  detalle: string;
  actual?: boolean;
}) {
  return (
    <li className="relative pb-4 pt-3 first:pt-0 last:pb-0">
      <i
        className={`absolute -left-[22px] block h-3 w-3 border-2 ${actual ? "border-navy bg-navy" : "border-ink/35 bg-white"}`}
        style={{ top: actual ? 4 : 16 }}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-cond text-[15px] font-semibold text-ink">{codigo}</span>
        <span className="font-cond text-sm font-semibold tabular-nums text-ink/70">{fmtKm(km)}</span>
      </div>
      <div className="text-sm text-ink/70">{modelo}</div>
      <div className="text-xs text-ink/50">
        {fechas} · {detalle}
      </div>
    </li>
  );
}
