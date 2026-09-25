import { TIPO_DEPARTAMENTO, LIBRETA_ESTADO, LIBRETA_TIPO, type LibretaEntry } from "@shared/domain";
import type { DescargaPendiente, EleccionDeDescarga } from "@shared/en-ruta";
import { Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

export const ELECCION_VACIA: EleccionDeDescarga = { destino: "", lugar: "", sinDefinir: false };

/** El departamento como lo espera el selector: sólo el nombre importa. */
function comoEntrada(nombre: string): LibretaEntry | null {
  if (!nombre) return null;
  return {
    id: 0,
    tipo: LIBRETA_TIPO.LUGAR,
    nombre,
    provider_id: null,
    agrupador: false,
    estado: LIBRETA_ESTADO.CONFIRMADO,
    usos: 0,
    created_by: null,
  };
}

/**
 * "¿Dónde descargó cada carga?" — el bloque del cierre para los viajes con ubicación por carga.
 *
 * Al agregar la carga el chofer sólo dijo dónde cargó, porque adónde va no siempre se sabe en ese
 * momento ("uno no sé para dónde va, no sé aún" — Rodrigo, 25/9). Acá, al cerrar, lo dice de cada
 * una. Un bloque por carga y nada precargado: en producción 11 de 13 viajes con varias cargas
 * descargan en lugares distintos, y un valor por defecto sería el que se confirma sin mirar.
 * "Igual que la carga N" existe, pero lo toca el chofer.
 *
 * "Todavía no sé" deja la carga sin destino y el viaje se cierra igual: queda pendiente y visible
 * ("destino a definir") hasta que la oficina la complete.
 */
export function DescargasAlCerrar({
  pendientes,
  elecciones,
  onChange,
}: {
  pendientes: DescargaPendiente[];
  elecciones: Record<string, EleccionDeDescarga>;
  onChange: (sid: string, e: EleccionDeDescarga) => void;
}) {
  if (!pendientes.length) return null;

  // Si la carga ya traía una parte, arranca con ella: sólo se pide lo que falta.
  const de = (p: DescargaPendiente): EleccionDeDescarga =>
    elecciones[p.sid] ?? { ...ELECCION_VACIA, destino: p.destino, lugar: p.lugar };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-ink">¿Dónde descargó cada carga?</h3>
      {pendientes.map((p, i) => {
        const e = de(p);
        const anterior = i > 0 ? pendientes[i - 1] : null;
        return (
          <div key={p.sid} className="space-y-3 border border-ink/15 bg-surface p-3">
            <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-700">
              Carga {p.numero} · {p.remitente}
              {p.origen ? ` (${p.origen})` : ""}
            </div>

            {e.sinDefinir ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink/70">Queda pendiente: la completa la oficina.</p>
                <button
                  type="button"
                  onClick={() => onChange(p.sid, { ...e, sinDefinir: false })}
                  className="flex-none border border-ink/25 px-3 py-2 font-cond text-sm font-semibold text-ink/70"
                >
                  Ya sé dónde
                </button>
              </div>
            ) : (
              <>
                <LibretaPicker
                  tipo={TIPO_DEPARTAMENTO}
                  label="Departamento de descarga"
                  value={comoEntrada(e.destino)}
                  onChange={(d) => onChange(p.sid, { ...e, destino: d?.nombre ?? "" })}
                />
                <Field label="Lugar de descarga">
                  <input
                    className="input"
                    value={e.lugar}
                    onChange={(ev) => onChange(p.sid, { ...e, lugar: ev.target.value })}
                    placeholder="Ej: UAM, un depósito, una estancia…"
                    autoCapitalize="words"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(p.sid, { ...e, sinDefinir: true })}
                    className="border border-ink/25 px-3 py-2 font-cond text-sm font-semibold text-ink/70"
                  >
                    Todavía no sé
                  </button>
                  {anterior && (
                    <button
                      type="button"
                      onClick={() => {
                        const a = de(anterior);
                        onChange(p.sid, { destino: a.destino, lugar: a.lugar, sinDefinir: a.sinDefinir });
                      }}
                      className="border border-ink/25 px-3 py-2 font-cond text-sm font-semibold text-ink/70"
                    >
                      Igual que la carga {anterior.numero}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
