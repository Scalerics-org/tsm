import { useState } from "react";
import { TIPO_DEPARTAMENTO, LIBRETA_ESTADO, LIBRETA_TIPO, type LibretaEntry } from "@shared/domain";
import { lugarVacio, type LugarDeDescarga } from "@shared/en-ruta";
import { Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { LibretaPicker } from "../../components/LibretaPicker";

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

/** Un id para el lugar: de él cuelgan sus fotos, que se suben antes de cerrar el viaje. */
export const nuevoLugar = (): LugarDeDescarga => lugarVacio(crypto.randomUUID());

/**
 * Dónde descargó — el cierre de los viajes con ubicación por carga (Otros Viajes).
 *
 * Es como lo dibujó Rodrigo (25/9): siempre se llena el primer lugar, y después de cada uno se
 * pregunta "¿Agregamos otro lugar de descarga?", hasta que diga que no. Cada lugar lleva
 * departamento, dónde descargó y la foto de la boleta; kilos o pallets, si quiere. No hay que
 * anticipar cuántos lugares son antes de empezar, y el caso normal —uno solo— es llenar un
 * bloque y contestar que no.
 *
 * La foto de la boleta es obligatoria, pero no traba el cierre: "No pude sacar la boleta" deja
 * cerrar y el viaje queda marcado. Se sube al toque, con el id del lugar.
 */
export function DescargasAlCerrar({
  lugares,
  onChange,
  fotosPorSid,
  subiendoSid,
  errorFoto,
  onFoto,
}: {
  lugares: LugarDeDescarga[];
  onChange: (lugares: LugarDeDescarga[]) => void;
  /** Cuántas fotos de boleta ya se subieron de cada lugar. */
  fotosPorSid: Record<string, number>;
  subiendoSid: string | null;
  errorFoto: string | null;
  onFoto: (sid: string, file: File | null) => void;
}) {
  // Contestó "NO" a "¿Agregamos otro lugar?": la pregunta se cierra hasta que agregue uno.
  const [terminado, setTerminado] = useState(false);

  const cambiar = (i: number, parcial: Partial<LugarDeDescarga>) =>
    onChange(lugares.map((l, j) => (j === i ? { ...l, ...parcial } : l)));

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-ink">¿Dónde descargaste?</h3>
      {lugares.map((l, i) => {
        const fotos = fotosPorSid[l.sid] ?? 0;
        const ultimo = i === lugares.length - 1;
        return (
          <div key={l.sid} className="space-y-3 border border-ink/15 bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                Lugar de descarga{lugares.length > 1 ? ` ${i + 1}` : ""}
              </div>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(lugares.filter((_, j) => j !== i));
                    setTerminado(false);
                  }}
                  className="text-xs text-ink/55 underline"
                >
                  Sacar este lugar
                </button>
              )}
            </div>

            <LibretaPicker
              tipo={TIPO_DEPARTAMENTO}
              label="Departamento"
              value={comoEntrada(l.departamento)}
              onChange={(d) => cambiar(i, { departamento: d?.nombre ?? "" })}
            />
            <Field label="Dónde descargaste">
              <input
                className="input"
                value={l.lugar}
                onChange={(e) => cambiar(i, { lugar: e.target.value })}
                placeholder="Ej: UAM, un depósito, una estancia…"
                autoCapitalize="words"
              />
            </Field>

            <div>
              <span className="label">Foto de la boleta</span>
              {l.sinBoleta ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink/70">Queda marcado que falta la boleta.</p>
                  <button
                    type="button"
                    onClick={() => cambiar(i, { sinBoleta: false })}
                    className="flex-none border border-ink/25 px-3 py-2 font-cond text-sm font-semibold text-ink/70"
                  >
                    Ya la saqué
                  </button>
                </div>
              ) : (
                <>
                  {fotos > 0 && (
                    <p className="mb-1 text-xs text-ink/50">
                      {fotos} foto{fotos === 1 ? "" : "s"} subida{fotos === 1 ? "" : "s"}. Podés sumar otra.
                    </p>
                  )}
                  {subiendoSid === l.sid ? (
                    <div className="flex h-24 items-center justify-center gap-2 text-sm text-ink/60">
                      <Spinner size={16} /> Subiendo…
                    </div>
                  ) : (
                    <CameraCapture
                      key={fotos}
                      label={`Foto de la boleta${lugares.length > 1 ? ` · lugar ${i + 1}` : ""}`}
                      onChange={(f) => onFoto(l.sid, f)}
                    />
                  )}
                  {fotos === 0 && (
                    <button
                      type="button"
                      onClick={() => cambiar(i, { sinBoleta: true })}
                      className="mt-2 text-sm text-ink/60 underline"
                    >
                      No pude sacar la boleta
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Kilos (opcional)">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={l.kilos}
                  onChange={(e) => cambiar(i, { kilos: e.target.value })}
                />
              </Field>
              <Field label="Pallets (opcional)">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={l.pallets}
                  onChange={(e) => cambiar(i, { pallets: e.target.value })}
                />
              </Field>
            </div>

            {ultimo && !terminado && (
              <div className="border-t border-ink/15 pt-3">
                <p className="mb-2 font-semibold text-ink">¿Agregamos otro lugar de descarga?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTerminado(true)}
                    className="flex-1 border border-ink/25 px-3 py-3 font-cond text-sm font-semibold text-ink/80"
                  >
                    NO, seguir y confirmar llegada
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([...lugares, nuevoLugar()])}
                    className="flex-1 border border-brand bg-brand/10 px-3 py-3 font-cond text-sm font-semibold text-brand-700"
                  >
                    SÍ, agregamos otro lugar de descarga
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {terminado && (
        <button
          type="button"
          onClick={() => {
            setTerminado(false);
            onChange([...lugares, nuevoLugar()]);
          }}
          className="text-sm text-brand-700 underline"
        >
          Agregar otro lugar de descarga
        </button>
      )}
      {errorFoto && (
        <p className="border-l-4 border-st-redDot bg-st-redBg px-3 py-2 text-sm text-st-redTx">{errorFoto}</p>
      )}
    </div>
  );
}
