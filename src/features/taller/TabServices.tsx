import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { HOY } from "./datos";
import { COLOR_ESTADO } from "./VistaSuperior";
import {
  CICLO,
  fmtUso,
  proximoService,
  ultimoService,
  type Service,
  type TipoService,
  type Vehiculo,
} from "./tipos";

export function TipoPill({ tipo }: { tipo: TipoService }) {
  const fuerte = tipo === "R+A+B";
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-cond text-[13px] font-bold tracking-[0.06em] ${
        fuerte ? "border-navy bg-navy text-bg" : tipo === "A+B" ? "border-brand bg-brand-200 text-brand-800" : "border-ink/25 bg-white text-ink"
      }`}
    >
      {tipo}
    </span>
  );
}

export function TabServices({ vehiculo }: { vehiculo: Vehiculo }) {
  const ultimo = ultimoService(vehiculo);
  if (!ultimo) {
    return (
      <div className="panel p-5">
        <Corners />
        <div className="kicker">Sin services</div>
        <p className="mt-2 max-w-prose text-sm text-ink/65">
          Este vehículo no tiene service de motor cargado: los semirremolques y acoplados no llevan motor, sólo cubiertas, frenos y componentes.
        </p>
      </div>
    );
  }
  const prox = proximoService(vehiculo, HOY);
  const desdeUltimo = vehiculo.km - ultimo.km;
  const avance = Math.min(1, desdeUltimo / vehiculo.cadaService);
  const orden = [...vehiculo.services].sort((a, b) => b.km - a.km);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel border-l-4 border-l-st-blueDot px-4 py-3">
          <Corners />
          <div className="kicker">{vehiculo.unidad === "h" ? "Horas actuales" : "Km actual"}</div>
          <div className="mt-1 font-cond text-4xl font-semibold leading-none tabular-nums">{vehiculo.km.toLocaleString("es-UY")}</div>
          <div className="mt-1 text-xs text-ink/50">{desdeUltimo.toLocaleString("es-UY")} {vehiculo.unidad} desde el último service</div>
        </div>

        <div className="panel border-l-4 border-l-st-greenDot px-4 py-3">
          <Corners />
          <div className="flex items-center justify-between">
            <span className="kicker">Último service</span>
            <TipoPill tipo={ultimo.tipo} />
          </div>
          <div className="mt-1 font-cond text-2xl font-semibold leading-tight">{fmtDate(ultimo.fecha)}</div>
          <div className="text-sm tabular-nums text-ink/60">a {vehiculo.unidad === "h" ? "las" : "los"} {fmtUso(vehiculo, ultimo.km)}</div>
          <p className="mt-2 border-t border-ink/10 pt-2 text-xs leading-relaxed text-ink/60">
            {vehiculo.unidad === "h" ? "Operador" : "Chofer"} {ultimo.chofer} · Mecánico {ultimo.mecanico}
            <span className="mt-0.5 block text-ink/50">{ultimo.obs}</span>
          </p>
        </div>

        <div className="panel border-l-4 px-4 py-3" style={{ borderLeftColor: COLOR_ESTADO[prox.estado] }}>
          <Corners />
          <div className="flex items-center justify-between">
            <span className="kicker">Próximo (estimado)</span>
            <TipoPill tipo={prox.tipo} />
          </div>
          <div className="mt-1 font-cond text-2xl font-semibold leading-tight">{fmtUso(vehiculo, prox.km)}</div>
          <div className="text-sm text-ink/60">
            {prox.faltan > 0 ? (
              <>
                faltan <b className="tabular-nums text-ink">{prox.faltan.toLocaleString("es-UY")} {vehiculo.unidad}</b> · alrededor del{" "}
                {fmtDate(prox.fechaEstimada)}
              </>
            ) : (
              <b style={{ color: COLOR_ESTADO.rojo }}>Ya pasó por {Math.abs(prox.faltan).toLocaleString("es-UY")} {vehiculo.unidad}</b>
            )}
          </div>
          <div className="mt-3 h-2.5 bg-surface" role="img" aria-label={`${Math.round(avance * 100)}% del camino al próximo service`}>
            <div className="h-full" style={{ width: `${avance * 100}%`, background: COLOR_ESTADO[prox.estado] }} />
          </div>
          <p className="mt-2 text-xs text-ink/50">A {Math.round(vehiculo.kmPorDia)} {vehiculo.unidad} por día, que es lo que viene haciendo.</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink/55">
        Criterio de ejemplo: un service cada {vehiculo.cadaService.toLocaleString("es-UY")} {vehiculo.unidad}, en este orden: {CICLO.join(" → ")} y
        vuelve a empezar. Cada cuánto toca y qué incluye cada tipo lo define Rodrigo.
      </p>

      <section className="panel">
        <Corners />
        <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">Historial de services</h2>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
                {["Fecha", "Tipo", vehiculo.unidad === "h" ? "Horas" : "Km", vehiculo.unidad === "h" ? "Operador" : "Chofer", "Mecánico", "Observaciones"].map((c) => (
                  <th key={c} className="px-4 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orden.map((s) => (
                <tr key={s.km} className="border-t border-ink/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(s.fecha)}</td>
                  <td className="px-4 py-3">
                    <TipoPill tipo={s.tipo} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{s.km.toLocaleString("es-UY")}</td>
                  <td className="px-4 py-3">{s.chofer}</td>
                  <td className="px-4 py-3">{s.mecanico}</td>
                  <td className="px-4 py-3 text-ink/65">{s.obs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-ink/10 md:hidden">
          {orden.map((s) => (
            <FilaDeService key={s.km} s={s} v={vehiculo} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function FilaDeService({ s, v }: { s: Service; v: Vehiculo }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <TipoPill tipo={s.tipo} />
          <span className="font-cond text-base font-semibold">{fmtDate(s.fecha)}</span>
        </span>
        <span className="font-cond text-sm font-semibold tabular-nums text-ink/70">{fmtUso(v, s.km)}</span>
      </div>
      <div className="mt-1 text-xs text-ink/55">
        {v.unidad === "h" ? "Operador" : "Chofer"} {s.chofer} · Mecánico {s.mecanico}
      </div>
      <div className="mt-0.5 text-sm text-ink/65">{s.obs}</div>
    </li>
  );
}
