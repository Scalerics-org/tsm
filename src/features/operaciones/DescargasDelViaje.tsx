import { useState } from "react";
import { descargasDelViaje, PHOTO_KIND, type Trip, type TripPhoto } from "@shared/domain";
import { Card } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";

/**
 * Dónde descargó el viaje, como lo ve la oficina.
 *
 * Lee los dos modelos con \`descargasDelViaje\`: el nuevo (una descarga por lugar, con su boleta,
 * kilos y pallets) y el anterior (la descarga vive en cada carga: se muestra igual, sin boleta ni
 * cantidades). Un lugar sin foto de boleta lo dice en ámbar, porque si no se ve nadie la pide.
 */
export function DescargasDelViaje({ trip, photos }: { trip: Trip; photos: TripPhoto[] }) {
  const descargas = descargasDelViaje(trip);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  if (!descargas.length) return null;

  const delModeloNuevo = trip.descargas != null;
  const boletas = (sid: string) => photos.filter((p) => p.kind === PHOTO_KIND.DESCARGA && p.segment_sid === sid);
  const todas = descargas.flatMap((d) => boletas(d.sid));

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <h3 className="font-semibold text-ink">Descargas</h3>
        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          {descargas.length} {descargas.length === 1 ? "lugar" : "lugares"}
        </span>
      </div>
      <div className="space-y-2">
        {descargas.map((d, i) => {
          const fotos = boletas(d.sid);
          const cantidad = [
            d.kilos != null && `${d.kilos.toLocaleString("es-UY")} kg`,
            d.pallets != null && `${d.pallets.toLocaleString("es-UY")} pallets`,
          ].filter(Boolean);
          return (
            <Card key={d.sid} accent={delModeloNuevo && d.sin_boleta ? "amber" : undefined} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-surface font-cond text-[13px] font-semibold text-ink/60">
                  {i + 1}
                </span>
                <div className="font-cond text-lg font-semibold leading-tight text-ink">
                  {d.departamento || "sin departamento"}
                  {d.lugar && <span className="text-ink/70"> · {d.lugar}</span>}
                </div>
                {cantidad.length > 0 && <div className="text-sm text-ink/60">{cantidad.join(" · ")}</div>}
              </div>
              {fotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {fotos.map((p) => (
                    <div key={p.id}>
                      <PhotoImage
                        r2Key={p.r2_key}
                        alt={`Boleta en ${d.lugar}`}
                        className="h-28 w-full"
                        onAmpliar={() => setAmpliada(todas.findIndex((f) => f.id === p.id))}
                      />
                      <div className="mt-1 text-xs text-ink/55">{fmtDateTime(p.taken_at)}</div>
                    </div>
                  ))}
                </div>
              ) : delModeloNuevo ? (
                <p className="text-sm font-semibold text-st-amberTx">
                  {d.sin_boleta ? "Falta la boleta: el chofer no pudo sacarla." : "Sin foto de la boleta."}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
      {ampliada != null && ampliada >= 0 && (
        <VisorFotos
          fotos={todas.map((p) => ({ r2_key: p.r2_key, titulo: "Boleta de descarga", detalle: fmtDateTime(p.taken_at) }))}
          indice={ampliada}
          onCerrar={() => setAmpliada(null)}
        />
      )}
    </div>
  );
}
