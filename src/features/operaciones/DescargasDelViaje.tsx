import { useState } from "react";
import {
  LIBRETA_ESTADO,
  LIBRETA_TIPO,
  PHOTO_KIND,
  TIPO_DEPARTAMENTO,
  TRIP_STATUS,
  descargasDelViaje,
  type Descarga,
  type LibretaEntry,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { compressImage } from "../../lib/image";
import { Button, Card, ErrorText, Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";
import { useSoloMirar } from "../../lib/auth";
import { BorrarFoto } from "./CargasDelViaje";

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

/** Lo que se escribe en el formulario de un lugar: los números como texto, como los tipea la oficina. */
interface Fila {
  sid: string | null;
  departamento: string;
  lugar: string;
  kilos: string;
  pallets: string;
  sinBoleta: boolean;
}

const aFila = (d: Descarga): Fila => ({
  sid: d.sid,
  departamento: d.departamento,
  lugar: d.lugar,
  kilos: d.kilos == null ? "" : String(d.kilos),
  pallets: d.pallets == null ? "" : String(d.pallets),
  sinBoleta: !!d.sin_boleta,
});

/**
 * Dónde descargó el viaje, como lo ve —y lo corrige— la oficina.
 *
 * Lee los dos modelos con `descargasDelViaje`: el nuevo (una descarga por lugar, con su boleta,
 * kilos y pallets) y el anterior (la descarga vive en cada carga: se muestra igual, sin boleta ni
 * cantidades, y se sigue corrigiendo con "Corregir lugares" de cada carga, no acá). Un lugar sin
 * foto de boleta lo dice en ámbar, porque si no se ve nadie la pide.
 *
 * Corregir es sólo del modelo nuevo, sólo oficina y con el viaje sin facturar. La oficina también
 * puede sumar la boleta de un lugar o borrar una que salió mal, con las mismas rutas de fotos de
 * siempre.
 */
export function DescargasDelViaje({
  trip,
  photos,
  onChanged,
}: {
  trip: Trip & { factura_numero?: string | null };
  photos: TripPhoto[];
  onChanged: () => void;
}) {
  const soloMirar = useSoloMirar();
  const descargas = descargasDelViaje(trip);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState("");
  if (!descargas.length && !editando) return null;

  const delModeloNuevo = trip.descargas != null;
  const editable = delModeloNuevo && !soloMirar && !trip.factura_numero && trip.status === TRIP_STATUS.COMPLETADO;
  const boletas = (sid: string) => photos.filter((p) => p.kind === PHOTO_KIND.DESCARGA && p.segment_sid === sid);
  const todas = descargas.flatMap((d) => boletas(d.sid));

  const abrir = () => {
    setFilas(descargas.map(aFila));
    setError("");
    setEditando(true);
  };
  const cambiar = (i: number, parcial: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...parcial } : f)));

  async function guardar() {
    setBusy(true);
    setError("");
    try {
      await api.put(`/trips/${trip.id}/descargas`, {
        descargas: filas.map((f) => ({
          sid: f.sid ?? undefined,
          departamento: f.departamento,
          lugar: f.lugar,
          kilos: f.kilos.trim() || null,
          pallets: f.pallets.trim() || null,
          sin_boleta: f.sinBoleta,
        })),
      });
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  async function sumarBoleta(sid: string, file: File | null) {
    if (!file) return;
    setSubiendo(sid);
    setErrorFoto("");
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      fd.append("trip_id", String(trip.id));
      fd.append("kind", PHOTO_KIND.DESCARGA);
      fd.append("segment_sid", sid);
      await api.upload("/photos", fd);
      onChanged();
    } catch (e) {
      setErrorFoto(mensajeDe(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <h3 className="font-semibold text-ink">Descargas</h3>
        <span className="flex items-baseline gap-3">
          {editable && !editando && (
            <button type="button" onClick={abrir} className="text-sm text-brand-700 hover:underline">
              Corregir dónde descargó
            </button>
          )}
          <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
            {descargas.length} {descargas.length === 1 ? "lugar" : "lugares"}
          </span>
        </span>
      </div>

      {editando ? (
        <div className="space-y-3 border border-brand/30 bg-brand/[.04] p-3">
          {filas.map((f, i) => (
            <div key={f.sid ?? `nuevo-${i}`} className="space-y-3 border border-ink/15 bg-bg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                  Lugar {i + 1}
                </div>
                {filas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                    className="text-xs text-st-redTx hover:underline"
                  >
                    Sacar este lugar
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <LibretaPicker
                  tipo={TIPO_DEPARTAMENTO}
                  label="Departamento"
                  value={comoEntrada(f.departamento)}
                  onChange={(d) => cambiar(i, { departamento: d?.nombre ?? "" })}
                />
                <Field label="Dónde descargó">
                  <input className="input" value={f.lugar} onChange={(e) => cambiar(i, { lugar: e.target.value })} autoCapitalize="words" />
                </Field>
                <Field label="Kilos (opcional)">
                  <input className="input" type="number" inputMode="decimal" value={f.kilos} onChange={(e) => cambiar(i, { kilos: e.target.value })} />
                </Field>
                <Field label="Pallets (opcional)">
                  <input className="input" type="number" inputMode="decimal" value={f.pallets} onChange={(e) => cambiar(i, { pallets: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input type="checkbox" checked={f.sinBoleta} onChange={(e) => cambiar(i, { sinBoleta: e.target.checked })} />
                Falta la boleta de este lugar
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFilas((fs) => [...fs, { sid: null, departamento: "", lugar: "", kilos: "", pallets: "", sinBoleta: false }])}
            className="text-sm text-brand-700 hover:underline"
          >
            + Agregar otro lugar de descarga
          </button>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button loading={busy} onClick={guardar}>
              Guardar dónde descargó
            </Button>
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
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
                {fotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {fotos.map((p) => (
                      <div key={p.id}>
                        <PhotoImage
                          r2Key={p.r2_key}
                          alt={`Boleta en ${d.lugar}`}
                          className="h-28 w-full"
                          onAmpliar={() => setAmpliada(todas.findIndex((f) => f.id === p.id))}
                        />
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink/55">
                          <span className="min-w-0 truncate">{fmtDateTime(p.taken_at)}</span>
                          {editable && <BorrarFoto foto={p} que={`la boleta de ${d.lugar}`} onChanged={onChanged} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {fotos.length === 0 && delModeloNuevo && (
                  <p className="text-sm font-semibold text-st-amberTx">
                    {d.sin_boleta ? "Falta la boleta: el chofer no pudo sacarla." : "Sin foto de la boleta."}
                  </p>
                )}
                {editable && (
                  <label className="inline-block cursor-pointer text-sm text-brand-700 hover:underline">
                    {subiendo === d.sid ? "Subiendo…" : "+ Sumar foto de la boleta"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={subiendo !== null}
                      onChange={(e) => {
                        void sumarBoleta(d.sid, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </Card>
            );
          })}
          {errorFoto && <p className="text-sm text-st-redTx">{errorFoto}</p>}
        </div>
      )}

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
