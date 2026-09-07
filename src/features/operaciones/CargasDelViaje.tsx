import { useState } from "react";
import {
  COBRO_TIPO,
  PHOTO_KIND_LABEL,
  fotosPorRenglon,
  type PhotoKind,
  type TripPhoto,
  type TripSegment,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Card, ErrorText } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos, type FotoDelVisor } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";

interface Props {
  segments: TripSegment[];
  photos: TripPhoto[];
  /** Recargar el viaje después de borrar una foto. Sin esto las fotos son de sólo lectura. */
  onChanged?: () => void;
}

/**
 * Las cargas del viaje como las ve la oficina: una por lugar de carga, con su foto y a
 * quién se le factura. Es la misma fila que sale en el Excel, pero en pantalla.
 */
export function CargasDelViaje({ segments, photos, onChanged }: Props) {
  const { porCarga, delViaje } = fotosPorRenglon(photos);

  /* Todas las fotos del viaje en una sola lista: con las flechas del visor la oficina las
     recorre de corrido, en vez de cerrar y abrir una por una. El orden es el de la pantalla
     —primero las de cada carga, después las del viaje— para que no se pierda. */
  const todas: FotoDelVisor[] = [
    ...segments.flatMap((s) =>
      (porCarga.get(s.sid) ?? []).map((f) => ({
        r2_key: f.r2_key,
        titulo: `Carga en ${s.remitente}`,
        detalle: fmtDateTime(f.taken_at),
      })),
    ),
    ...delViaje.map((f) => ({
      r2_key: f.r2_key,
      titulo: PHOTO_KIND_LABEL[f.kind as PhotoKind],
      detalle: fmtDateTime(f.taken_at),
    })),
  ];
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const abrir = (r2Key: string) => setAmpliada(todas.findIndex((f) => f.r2_key === r2Key));

  return (
    <div className="space-y-4">
      {segments.length > 0 && (
        <div>
          <div className="mb-2 flex items-end justify-between">
            <h3 className="font-semibold text-ink">Cargas</h3>
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
              {segments.length} {segments.length === 1 ? "renglón" : "renglones"}
            </span>
          </div>

          <div className="space-y-2">
            {segments.map((s, i) => (
              <Card key={s.sid} accent={s.cobro_tipo ? undefined : "amber"} className="space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-surface font-cond text-[13px] font-semibold text-ink/60">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="font-cond text-lg font-semibold leading-tight text-ink">
                      {s.remitente} → {s.clientes.join(" · ") || "sin destinatario"}
                    </div>
                    <div className="mt-0.5 text-xs text-ink/55">
                      {s.cantidad != null ? `${s.cantidad.toLocaleString("es-UY")} ${s.unidad}` : "sin cantidad"}
                      {s.remito && ` · remito ${s.remito}`}
                    </div>
                  </div>

                  {/* La facturación es lo único que la oficina ve y el chofer no. */}
                  <div className="flex-none text-right">
                    {s.cobro_tipo ? (
                      <>
                        <div className="font-cond text-base font-semibold leading-none text-ink">
                          {s.cobro_a}
                        </div>
                        <div
                          className={`text-[10px] uppercase tracking-[0.08em] ${
                            s.cobro_tipo === COBRO_TIPO.CLIENTE ? "text-st-greenTx" : "text-st-blueTx"
                          }`}
                        >
                          {s.cobro_tipo}
                          {s.cobro_manual && " · a mano"}
                        </div>
                      </>
                    ) : (
                      <span className="pill border-st-amberBd bg-st-amberBg text-st-amberTx">
                        <i className="pill-dot bg-st-amberDot" />
                        SIN REGLA
                      </span>
                    )}
                  </div>
                </div>

                <FotosDeCarga
                  fotos={porCarga.get(s.sid) ?? []}
                  lugar={s.remitente}
                  onAmpliar={abrir}
                  onBorrada={onChanged}
                />
              </Card>
            ))}
          </div>
        </div>
      )}

      {delViaje.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-ink">
            {segments.length > 0 ? "Otras fotos del viaje" : "Fotos"}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {delViaje.map((p) => (
              <FotoDeOficina
                key={p.id}
                foto={p}
                titulo={PHOTO_KIND_LABEL[p.kind as PhotoKind]}
                pie={`${PHOTO_KIND_LABEL[p.kind as PhotoKind]} · ${fmtDateTime(p.taken_at)}`}
                alto="h-32"
                onAmpliar={() => abrir(p.r2_key)}
                onBorrada={onChanged}
              />
            ))}
          </div>
        </div>
      )}

      {segments.length === 0 && delViaje.length === 0 && (
        <p className="text-sm text-ink/50">Sin cargas ni fotos registradas todavía.</p>
      )}

      {ampliada != null && ampliada >= 0 && (
        <VisorFotos fotos={todas} indice={ampliada} onCerrar={() => setAmpliada(null)} />
      )}
    </div>
  );
}

function FotosDeCarga({
  fotos,
  lugar,
  onAmpliar,
  onBorrada,
}: {
  fotos: TripPhoto[];
  lugar: string;
  onAmpliar: (r2Key: string) => void;
  onBorrada?: () => void;
}) {
  if (fotos.length === 0) {
    return <p className="border-t border-ink/10 pt-2 text-xs text-ink/45">Sin foto de esta carga.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-ink/10 pt-3 sm:grid-cols-4">
      {fotos.map((p) => (
        <FotoDeOficina
          key={p.id}
          foto={p}
          titulo={`Carga en ${lugar}`}
          pie={fmtDateTime(p.taken_at)}
          alto="h-28"
          onAmpliar={() => onAmpliar(p.r2_key)}
          onBorrada={onBorrada}
        />
      ))}
    </div>
  );
}

/**
 * Una foto en la vista de oficina: se amplía y —esto es lo nuevo— se puede sacar.
 *
 * El único `DELETE /photos/:id` que había en todo el front estaba en la pantalla del chofer, y
 * ahí el backend sólo lo permite con el viaje EN CURSO. O sea: una foto movida en un viaje ya
 * cerrado no la podía sacar nadie. El endpoint siempre lo permitió para oficina, incluso en un
 * viaje facturado —que es justamente el caso donde más duele—; lo que faltaba era el botón.
 *
 * Con confirmación y diciendo que no se recupera: acá no hay papelera, y esta foto es la
 * evidencia con la que se dio el viaje por bueno.
 */
function FotoDeOficina({
  foto,
  titulo,
  pie,
  alto,
  onAmpliar,
  onBorrada,
}: {
  foto: TripPhoto;
  titulo: string;
  pie: string;
  alto: string;
  onAmpliar: () => void;
  /** Sin esto no se dibuja el botón: la pantalla que la muestra decide si se puede borrar. */
  onBorrada?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    if (busy) return;
    if (!confirm(`¿Borrar esta foto (${titulo})?\n\nEs la evidencia del viaje y no se puede recuperar.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.del(`/photos/${foto.id}`);
      onBorrada?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar");
      setBusy(false);
    }
  }

  return (
    <div>
      <PhotoImage r2Key={foto.r2_key} alt={titulo} className={`${alto} w-full`} onAmpliar={onAmpliar} />
      <div className="mt-1 flex items-start justify-between gap-2">
        <span className="text-xs text-ink/55">{pie}</span>
        {onBorrada && (
          <button
            type="button"
            onClick={borrar}
            disabled={busy}
            className="flex-none text-xs text-st-redTx hover:underline disabled:opacity-40"
          >
            {busy ? "…" : "Borrar"}
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
