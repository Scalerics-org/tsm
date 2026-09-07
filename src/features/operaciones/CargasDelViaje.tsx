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
import { Card } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos, type FotoDelVisor } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";

interface Props {
  segments: TripSegment[];
  photos: TripPhoto[];
  /** Para releer el viaje después de borrar una foto. */
  onChanged: () => void;
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
                  onChanged={onChanged}
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
              <div key={p.id}>
                <PhotoImage
                  r2Key={p.r2_key}
                  alt={PHOTO_KIND_LABEL[p.kind as PhotoKind]}
                  className="h-32 w-full"
                  onAmpliar={() => abrir(p.r2_key)}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink/60">
                  <span className="min-w-0 truncate">
                    {PHOTO_KIND_LABEL[p.kind as PhotoKind]} · {fmtDateTime(p.taken_at)}
                  </span>
                  <BorrarFoto
                    foto={p}
                    que={`la foto de ${PHOTO_KIND_LABEL[p.kind as PhotoKind].toLowerCase()}`}
                    onChanged={onChanged}
                  />
                </div>
              </div>
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
  onChanged,
}: {
  fotos: TripPhoto[];
  lugar: string;
  onAmpliar: (r2Key: string) => void;
  onChanged: () => void;
}) {
  if (fotos.length === 0) {
    return <p className="border-t border-ink/10 pt-2 text-xs text-ink/45">Sin foto de esta carga.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-ink/10 pt-3 sm:grid-cols-4">
      {fotos.map((p) => (
        <div key={p.id}>
          <PhotoImage
            r2Key={p.r2_key}
            alt={`Carga en ${lugar}`}
            className="h-28 w-full"
            onAmpliar={() => onAmpliar(p.r2_key)}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink/55">
            <span className="min-w-0 truncate">{fmtDateTime(p.taken_at)}</span>
            <BorrarFoto foto={p} que={`la foto de la carga en ${lugar}`} onChanged={onChanged} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Sacar una foto desde la oficina.
 *
 * El backend ya lo permitía desde el primer día, pero el único botón vivía en la pantalla del
 * chofer y sólo con el viaje en curso: una foto movida en un viaje ya cerrado no la podía
 * sacar nadie. Se lleva también el archivo de R2, así que se pregunta antes.
 */
function BorrarFoto({
  foto,
  que,
  onChanged,
}: {
  foto: TripPhoto;
  que: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    if (busy) return;
    if (!confirm(`¿Borrar ${que}?\n\nNo se puede deshacer: la foto se borra también del archivo.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/photos/${foto.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={borrar}
        disabled={busy}
        className="flex-none text-st-redTx hover:underline disabled:opacity-40"
      >
        {busy ? "…" : "Borrar"}
      </button>
      {error && <span className="text-st-redTx">{error}</span>}
    </>
  );
}
