import { Link } from "react-router-dom";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { HOY, VEHICULOS, enLaDireccion } from "./datos";
import { useFlotaConLoCargado } from "./servicio";
import { TipoPill } from "./TabServices";
import { COLOR_ESTADO } from "./VistaSuperior";
import { cubiertasPorPosicion, fmtUso, proximoService, ultimoService } from "./tipos";

/** El tablero del taller: los km de cada vehículo, su último service y cuántas cubiertas piden atención. */
export function FlotaPage() {
  const flota = useFlotaConLoCargado(VEHICULOS);
  const filas = flota.map((v) => {
    const items = cubiertasPorPosicion(v);
    return {
      v,
      ultimo: ultimoService(v),
      prox: v.services.length ? proximoService(v, HOY) : null,
      rojas: items.filter((i) => i.estado === "rojo").length,
      ambar: items.filter((i) => i.estado === "ambar").length,
    };
  });
  const urgentes = filas.filter((f) => f.rojas > 0 || (f.prox && f.prox.estado !== "verde")).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="kicker">Taller</div>
        <h1 className="font-cond text-3xl">Mantenimiento de la flota</h1>
        <p className="mt-1 max-w-prose text-sm text-ink/60">
          Los km de cada vehículo, cuándo toca el próximo service y cómo están las cubiertas. {urgentes} de {filas.length}{" "}
          piden atención.
        </p>
      </div>

      <div className="panel hidden md:block">
        <Corners />
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
              {["Vehículo", "Km", "Último service", "Próximo service", "Cubiertas"].map((c) => (
                <th key={c} className="px-4 py-2.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map(({ v, ultimo, prox, rojas, ambar }) => (
              <tr key={v.patente} className="border-t border-ink/10 hover:bg-brand-100/60">
                <td className="px-4 py-3">
                  <Link to={`/panel/taller/${enLaDireccion(v.patente)}`} className="block min-h-[44px] content-center">
                    <span className="font-cond text-lg font-semibold text-ink">{v.patente}</span>
                    <span className="block text-xs text-ink/55">{v.descripcion}</span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-cond text-lg font-semibold tabular-nums">
                  {v.km.toLocaleString("es-UY")} <span className="text-sm text-ink/45">{v.unidad}</span>
                </td>
                <td className="px-4 py-3">
                  {ultimo ? (
                    <span className="flex items-center gap-2">
                      <TipoPill tipo={ultimo.tipo} />
                      <span className="text-ink/70">{fmtDate(ultimo.fecha)}</span>
                    </span>
                  ) : (
                    <span className="text-ink/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{prox ? <Proximo prox={prox} unidad={v.unidad} /> : <span className="text-ink/40">—</span>}</td>
                <td className="px-4 py-3">
                  {v.disposicion ? <Atencion rojas={rojas} ambar={ambar} /> : <span className="text-ink/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {filas.map(({ v, ultimo, prox, rojas, ambar }) => (
          <li key={v.patente}>
            <Link to={`/panel/taller/${enLaDireccion(v.patente)}`} className="panel block px-4 py-3 active:bg-brand-100">
              <Corners />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-cond text-xl font-semibold">{v.patente}</div>
                  <div className="text-xs text-ink/55">{v.descripcion}</div>
                </div>
                <div className="text-right font-cond text-xl font-semibold tabular-nums">{fmtUso(v, v.km)}</div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3 text-sm">
                {prox && ultimo ? (
                  <span className="flex items-center gap-2 text-ink/70">
                    Último <TipoPill tipo={ultimo.tipo} /> {fmtDate(ultimo.fecha)}
                  </span>
                ) : (
                  <span className="text-ink/40">Sin services</span>
                )}
                {v.disposicion && <Atencion rojas={rojas} ambar={ambar} />}
              </div>
              {prox && (
                <div className="mt-2 flex items-center gap-2 text-sm text-ink/70">
                  Próximo <Proximo prox={prox} unidad={v.unidad} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink/50">
        Los semirremolques y acoplados llevan cubiertas, frenos y componentes; el montacargas cuenta horas en vez de km. Los datos de esta maqueta son de ejemplo.
      </p>
    </div>
  );
}

function Proximo({ prox, unidad }: { prox: NonNullable<ReturnType<typeof proximoService>>; unidad: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <TipoPill tipo={prox.tipo} />
      <span className="tabular-nums" style={{ color: prox.faltan <= 0 ? COLOR_ESTADO.rojo : undefined }}>
        {prox.faltan > 0 ? `faltan ${prox.faltan.toLocaleString("es-UY")} ${unidad}` : "ya toca"}
      </span>
    </span>
  );
}

function Atencion({ rojas, ambar }: { rojas: number; ambar: number }) {
  if (rojas === 0 && ambar === 0) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-ink/60">
        <i className="block h-2.5 w-2.5" style={{ background: COLOR_ESTADO.verde }} />
        Todas bien
      </span>
    );
  }
  return (
    <span className="flex items-center gap-3 font-cond text-sm font-semibold tabular-nums">
      {rojas > 0 && (
        <span className="flex items-center gap-1.5">
          <i className="block h-2.5 w-2.5" style={{ background: COLOR_ESTADO.rojo }} />
          {rojas} para cambiar
        </span>
      )}
      {ambar > 0 && (
        <span className="flex items-center gap-1.5">
          <i className="block h-2.5 w-2.5" style={{ background: COLOR_ESTADO.ambar }} />
          {ambar} a mirar
        </span>
      )}
    </span>
  );
}
