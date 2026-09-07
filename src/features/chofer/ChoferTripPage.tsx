import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FIELD_STAGE,
  PHOTO_KIND,
  PHOTO_KIND_LABEL,
  TRIP_STATUS,
  type PhotoKind,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner, StatusBadge } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos, type FotoDelVisor } from "../../components/VisorFotos";
import { CargasPanel } from "./CargasPanel";
import { compressImage } from "../../lib/image";
import { estimateTravel, fmtDuration } from "../../lib/eta";
import { fmtDateTime } from "../../lib/format";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
  arrival_photo_label: string | null;
  multi_renglon: boolean;
  /** Nombre del papel que hay que fotografiar al cargar (ej. "Hoja MIC"). */
  carga_photo_label: string | null;
  pide_kilometros: boolean;
  viaje_vacio: boolean;
  /** Si el cierre va a exigir la foto de la carga. Lo resuelve el backend con la plantilla. */
  foto_carga_requerida: boolean;
  /** Combinado genérico: cada carga lleva su ciudad y su destino. */
  renglon_pide_ubicacion: boolean;
  renglon_pide_departamento: boolean;
  provider_id: number | null;
}

async function uploadPhoto(tripId: number, file: File, kind: string) {
  const fd = new FormData();
  fd.append("file", await compressImage(file));
  fd.append("trip_id", String(tripId));
  fd.append("kind", kind);
  await api.upload("/photos", fd);
}

export function ChoferTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<Detail>(`/trips/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner size={28} />;
  const { trip, photos, arrival_photo_label, multi_renglon, provider_id } = data;
  const fields = trip.fields ?? [];
  const enCurso = trip.status === TRIP_STATUS.EN_CURSO;

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Inicio
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="kicker">{trip.provider_name}</div>
          <h1 className="text-2xl text-ink">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.destinatario ? `${trip.destinatario} · ` : ""}🚛 {trip.truck_plate}
          </p>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      {trip.status === TRIP_STATUS.EN_CURSO &&
        (() => {
          const est = estimateTravel(trip.origin, trip.destination);
          if (!est) return null;
          const llegada = new Date(
            (Date.parse(trip.started_at.replace(" ", "T") + "Z") || Date.now()) + est.hours * 3_600_000,
          ).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
          return (
            <div className="border-l-4 border-l-st-blueDot bg-surface px-4 py-3">
              <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                Tiempo estimado
              </div>
              <div className="font-cond text-3xl font-semibold text-ink">{fmtDuration(est.hours)}</div>
              <div className="text-xs text-ink/55">
                ≈ {est.km} km · llegada aprox. {llegada}
              </div>
            </div>
          );
        })()}

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {trip.remite && <Info label="Remite" value={trip.remite} />}
          {fields.map((f) => (
            <Info key={f.key} label={f.label} value={trip.field_values[f.key] || "—"} />
          ))}
          <Info label="Salida" value={fmtDateTime(trip.started_at)} />
          {trip.finished_at && <Info label="Llegada" value={fmtDateTime(trip.finished_at)} />}
        </div>
        {trip.notes && (
          <div className="mt-3 border-l-4 border-brand bg-surface p-3 text-sm text-ink/80">
            <span className="font-semibold">Observaciones:</span> {trip.notes}
          </div>
        )}
      </Card>

      {multi_renglon && (
        <CargasPanel
          tripId={trip.id}
          providerId={provider_id}
          segments={trip.segments}
          photos={photos}
          pideFoto={data.foto_carga_requerida}
          pideUbicacion={data.renglon_pide_ubicacion}
          pideDepartamento={data.renglon_pide_departamento}
          origenViaje={trip.origin}
          destinoViaje={trip.destination}
          editable={enCurso}
          onChange={load}
        />
      )}

      {/* Si la foto de la carga no llegó a subirse (mala señal en el muelle), el viaje no
          puede cerrarse. Se puede sacar de nuevo desde acá para no quedar trabado.
          En los combinados la foto va por carga, así que la pide CargasPanel. */}
      {/* La cámara sigue disponible aunque ya haya una foto: una movida o del papel
          equivocado no sirve de nada, y antes no se podía ni sumar otra ni rehacerla. */}
      {enCurso && !multi_renglon && data.foto_carga_requerida && (
        <MissingCargoPhoto
          tripId={trip.id}
          onDone={load}
          yaTiene={photos.some((p) => p.kind === PHOTO_KIND.CARGA)}
        />
      )}

      {trip.status === TRIP_STATUS.EN_CURSO && (
        <ArrivalForm
          tripId={trip.id}
          descargaFields={fields.filter((f) => f.stage === FIELD_STAGE.DESCARGA)}
          photoLabel={arrival_photo_label}
          pideKilometros={data.pide_kilometros}
          fotosDeLlegada={photos.filter((p) => p.kind === PHOTO_KIND.DESCARGA)}
          onDone={load}
        />
      )}

      {photos.length > 0 && <Gallery photos={photos} editable={enCurso} onChanged={load} />}

      {trip.status === TRIP_STATUS.EN_CURSO && (
        <button
          onClick={async () => {
            if (!confirm("¿Cancelar este viaje?")) return;
            await api.post(`/trips/${trip.id}/cancel`, {});
            navigate("/");
          }}
          className="text-sm text-st-redTx hover:underline"
        >
          Cancelar viaje
        </button>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        {label}
      </div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}

/** Reintento de la foto de la carga cuando no quedó guardada al iniciar el viaje. */
function MissingCargoPhoto({
  tripId,
  onDone,
  yaTiene,
}: {
  tripId: number;
  onDone: () => void;
  /** Si ya hay al menos una foto de carga: cambia el tono, de "falta" a "podés sumar otra". */
  yaTiene: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function subir() {
    if (!file) return setError("Sacá la foto de la carga.");
    setError("");
    setBusy(true);
    try {
      await uploadPhoto(tripId, file, PHOTO_KIND.CARGA);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card accent={yaTiene ? undefined : "amber"} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">
          {yaTiene ? "Agregar otra foto de la carga" : "Falta la foto de la carga"}
        </h2>
        <p className="text-sm text-ink/60">
          {yaTiene
            ? "Podés sumar las que necesites. Si alguna salió mal, borrala abajo y sacá otra."
            : "No llegó a guardarse cuando saliste. Sacala de nuevo para poder cerrar el viaje."}
        </p>
      </div>
      <CameraCapture label="Foto de la carga" onChange={setFile} />
      <ErrorText>{error}</ErrorText>
      <Button loading={busy} onClick={subir} className="w-full py-3">
        Guardar foto
      </Button>
    </Card>
  );
}

/**
 * Registrar la llegada, con tantas fotos como haga falta.
 *
 * "MOLINO PARA CERRAR PIDE HORA FIRMADA. PERO DA PARA SACAR SOLO UNA FOTO, TIENE Q DAR OPCIÓN
 * DE SACAR OTRA FOTO POR SI SON MÁS DE UNA." — el cliente. El backend siempre aguantó N fotos
 * (`POST /api/photos` ni siquiera mira el estado del viaje); lo que había acá era un solo
 * `CameraCapture` cuyo File se pisaba al sacar la segunda.
 *
 * Cada foto se sube EN EL MOMENTO, no al confirmar la llegada, igual que la de la carga en
 * `MissingCargoPhoto`. Dos razones:
 *
 *  - el chofer ve cuántas lleva y puede borrar la movida antes de cerrar (la galería de abajo
 *    tiene el botón mientras el viaje esté en curso);
 *  - la versión de una sola foto tenía un bug: la subía y RECIÉN DESPUÉS llamaba a `finish`.
 *    Si el cierre fallaba —un campo de descarga sin llenar—, la foto ya estaba arriba y el
 *    reintento la subía de nuevo. Dos copias del mismo papel, sin que nadie lo notara.
 */
function ArrivalForm({
  tripId,
  descargaFields,
  photoLabel,
  pideKilometros,
  fotosDeLlegada,
  onDone,
}: {
  tripId: number;
  descargaFields: TemplateField[];
  photoLabel: string | null;
  pideKilometros: boolean;
  /** Las de descarga que ya están guardadas. Es contra esto que se valida el cierre. */
  fotosDeLlegada: TripPhoto[];
  onDone: () => void;
}) {
  const [kilometros, setKilometros] = useState("");
  const [descarga, setDescarga] = useState<File | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  // Remonta el CameraCapture después de cada subida: no expone forma de limpiarse, y sin esto
  // la vista previa de la foto anterior queda puesta como si la nueva no se hubiera sacado.
  const [ronda, setRonda] = useState(0);
  const [error, setError] = useState("");
  const photoRequired = !!photoLabel;
  const yaSubidas = fotosDeLlegada.length;

  async function guardarFoto() {
    if (!descarga) return;
    setError("");
    setSubiendo(true);
    try {
      await uploadPhoto(tripId, descarga, PHOTO_KIND.DESCARGA);
      setDescarga(null);
      setRonda((n) => n + 1);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
    }
  }

  async function confirm() {
    setError("");
    // El error nuevo que trae subir de a una: el chofer saca la foto, la ve en la vista previa
    // y da por hecho que ya está. Sin este aviso se le perdería al confirmar.
    if (descarga) return setError("Te falta guardar la foto que sacaste.");
    for (const f of descargaFields) {
      if (f.required && !String(values[f.key] ?? "").trim()) return setError(`Cargá ${f.label}.`);
    }
    if (photoRequired && !yaSubidas) return setError(`Sacá la foto: ${photoLabel}.`);
    if (pideKilometros && !kilometros) return setError("Cargá los kilómetros del recorrido.");
    setBusy(true);
    try {
      await api.post(`/trips/${tripId}/finish`, {
        field_values: values,
        notes: notes || undefined,
        kilometros: kilometros ? Number(kilometros) : undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la llegada");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Registrar llegada</h2>
      {descargaFields.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? "" : " (opcional)"}`}>
          <input
            className="input"
            type={f.type === "numero" ? "number" : "text"}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          />
        </Field>
      ))}
      {pideKilometros && (
        <Field label="Kilómetros del recorrido">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={kilometros}
            onChange={(e) => setKilometros(e.target.value)}
            placeholder="Ej: 500"
          />
        </Field>
      )}
      <div className="space-y-2">
        <CameraCapture
          key={ronda}
          label={photoLabel ? `Foto: ${photoLabel}` : "Foto de descarga (opcional)"}
          onChange={setDescarga}
        />
        <p className="text-sm text-ink/60">
          {yaSubidas === 0
            ? "Podés sumar las que necesites: sacá una, guardala, y volvé a sacar."
            : `${yaSubidas} guardada${yaSubidas === 1 ? "" : "s"}. Podés sumar las que necesites; si alguna salió mal, borrala abajo.`}
        </p>
        <Button
          variant="secondary"
          loading={subiendo}
          disabled={!descarga}
          onClick={guardarFoto}
          className="w-full py-3"
        >
          {yaSubidas === 0 ? "Guardar foto" : "Guardar otra foto"}
        </Button>
      </div>
      <Field label="Agregar comentario (opcional)">
        <textarea
          className="input min-h-[70px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Si pasó algo — pallets rotos, demoras, lo que sea — contámelo acá."
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button variant="success" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Confirmar llegada ✓
      </Button>
    </Card>
  );
}

/**
 * Las fotos del viaje como las ve el chofer.
 *
 * Con el visor puesto, igual que en oficina. La miniatura va recortada (`object-cover`) y de
 * un remito se ve un pedazo: con cinco papeles el chofer no tenía cómo verificar que se leen
 * ANTES de cerrar el viaje, que es el único momento en que todavía puede sacarlos de nuevo.
 * El componente ya sabía ampliar; lo que faltaba era pasarle el `onAmpliar`.
 */
function Gallery({
  photos,
  editable,
  onChanged,
}: {
  photos: TripPhoto[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const paraElVisor: FotoDelVisor[] = photos.map((p) => ({
    r2_key: p.r2_key,
    titulo: PHOTO_KIND_LABEL[p.kind as PhotoKind],
    detalle: fmtDateTime(p.taken_at),
  }));

  return (
    <div>
      <h3 className="mb-2 font-semibold text-ink">Fotos</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <FotoDelViaje
            key={p.id}
            p={p}
            editable={editable}
            onChanged={onChanged}
            onAmpliar={() => setAmpliada(i)}
          />
        ))}
      </div>
      {ampliada != null && (
        <VisorFotos fotos={paraElVisor} indice={ampliada} onCerrar={() => setAmpliada(null)} />
      )}
    </div>
  );
}

/** Una foto del viaje. Se puede sacar mientras el viaje siga en curso. */
function FotoDelViaje({
  p,
  editable,
  onChanged,
  onAmpliar,
}: {
  p: TripPhoto;
  editable: boolean;
  onChanged: () => void;
  onAmpliar: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const etiqueta = PHOTO_KIND_LABEL[p.kind as PhotoKind];

  async function borrar() {
    if (busy) return;
    // Si era la única foto de la carga, el viaje vuelve a quedar sin poder cerrarse.
    // Decirlo acá evita que lo descubra recién al intentar registrar la llegada.
    if (!confirm(`¿Borrar esta foto (${etiqueta})?

Vas a poder sacar otra en su lugar.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/photos/${p.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar");
      setBusy(false);
    }
  }

  return (
    <div>
      <PhotoImage r2Key={p.r2_key} alt={etiqueta} className="h-32 w-full" onAmpliar={onAmpliar} />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-ink/60">{etiqueta}</span>
        {editable && (
          <button
            type="button"
            onClick={borrar}
            disabled={busy}
            className="text-xs text-st-redTx hover:underline disabled:opacity-40"
          >
            {busy ? "…" : "Borrar"}
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
