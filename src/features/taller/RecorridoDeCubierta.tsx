import { fmtDate } from "../../lib/format";
import { MODELOS } from "./base";
import { Dialogo } from "./Dialogo";
import { recorridoDeCubierta, type CubiertaBaja, type RecorridoDeCubierta } from "./movimientos";
import type { CubiertaEnStock } from "./datos-extra";
import { fmtKm, type Cubierta, type Vehiculo } from "./tipos";

/** El recorrido de una cubierta que está en un vehículo: sus tramos cerrados y el de hoy, contra el tacógrafo de cada uno. */
export const recorridoEnVehiculo = (v: Vehiculo, c: Cubierta): RecorridoDeCubierta =>
  recorridoDeCubierta(c.historial ?? [], { tipo: "vehiculo", patente: v.patente, posicion: c.numero, desde: c.fecha, kmDesde: c.kmInicial, kmActual: v.km }, fmtDate, c.balanceos);

export const recorridoEnStock = (s: CubiertaEnStock): RecorridoDeCubierta =>
  recorridoDeCubierta(s.historial ?? [], { tipo: "stock", desde: s.desde, nueva: s.estado === "nueva" }, fmtDate, s.balanceos);

export const recorridoDeBaja = (b: CubiertaBaja): RecorridoDeCubierta =>
  recorridoDeCubierta(b.historial, { tipo: "baja", fecha: b.fecha, motivo: b.motivo }, fmtDate, b.balanceos);

/**
 * Dónde estuvo la cubierta y cuántos km hizo en cada lado. Los tramos siguen a la cubierta (por su id interno) entre
 * vehículos y stock, tenga o no código. El total es la suma de los tramos.
 */
export function ListaDeRecorrido({ recorrido }: { recorrido: RecorridoDeCubierta }) {
  return (
    <div>
      <ol className="relative border-l-2 border-ink/15 pl-4">
        {recorrido.lineas.map((l, i) => (
          <li key={i} className="relative pb-3 last:pb-0">
            <i className={`absolute -left-[22px] top-[5px] block h-3 w-3 border-2 ${l.actual ? "border-navy bg-navy" : "border-ink/35 bg-white"}`} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[15px] font-semibold text-ink">{l.donde}</span>
              {l.km != null && <span className="font-cond text-sm font-semibold tabular-nums text-ink/70">{fmtKm(l.km)}</span>}
            </div>
            {l.cuando && <div className="text-xs text-ink/55">{l.cuando}</div>}
          </li>
        ))}
      </ol>
      {recorrido.balanceos.length > 0 && (
        <div className="mt-3 border-t border-ink/10 pt-2">
          <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">Balanceos</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {recorrido.balanceos.map((b, i) => (
              <li key={i} data-balanceo>
                Balanceada el {fmtDate(b.fecha)} <span className="text-ink/50">· a los {fmtKm(b.km)} del vehículo</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink/10 pt-2">
        <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">Total · suma de los tramos</span>
        <span className="whitespace-nowrap font-cond text-xl font-semibold tabular-nums">{fmtKm(recorrido.totalKm)}</span>
      </div>
    </div>
  );
}

/** El recorrido de una cubierta de stock o de baja, en una ventana (se abre desde Stock). */
export function DialogoDeRecorrido({
  titulo,
  codigo,
  modeloId,
  recorrido,
  onCerrar,
}: {
  titulo: string;
  codigo?: string;
  modeloId: string;
  recorrido: RecorridoDeCubierta;
  onCerrar: () => void;
}) {
  return (
    <Dialogo titulo={titulo} onCerrar={onCerrar}>
      <div className="mb-4">
        <div className="font-cond text-2xl font-semibold">{codigo || <span className="text-ink/45">Sin código</span>}</div>
        <div className="text-sm text-ink/60">
          {MODELOS[modeloId]?.nombre} · {MODELOS[modeloId]?.medida}
        </div>
      </div>
      <ListaDeRecorrido recorrido={recorrido} />
    </Dialogo>
  );
}
