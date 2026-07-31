import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CAMPO_MODO,
  FIELD_STAGE,
  PHOTO_KIND,
  type CampoUbicacion,
  type LibretaEntry,
  type Trip,
  type TripTemplate,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Corners, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { LibretaPicker } from "../../components/LibretaPicker";
import { compressImage } from "../../lib/image";
import { estimateTravel, fmtDuration, etaClock } from "../../lib/eta";

interface TruckOption {
  id: number;
  plate: string;
}

async function uploadPhoto(tripId: number, file: File, kind: string) {
  const fd = new FormData();
  fd.append("file", await compressImage(file));
  fd.append("trip_id", String(tripId));
  fd.append("kind", kind);
  await api.upload("/photos", fd);
}

export function StartTripPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tpl, setTpl] = useState<TripTemplate | null>(null);
  const [optIdx, setOptIdx] = useState("");
  const [otroDest, setOtroDest] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [libreta, setLibreta] = useState<Record<string, LibretaEntry | null>>({});
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [truckId, setTruckId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<TripTemplate[]>("/templates")
      .then((list) => setTpl(list.find((t) => t.id === Number(templateId)) ?? null))
      .catch(() => setTpl(null));
  }, [templateId]);

  // Camión asignado por defecto; el chofer puede cambiarlo si hoy maneja otro.
  useEffect(() => {
    api
      .get<TruckOption[]>("/trucks/options")
      .then((list) => {
        setTrucks(list);
        setTruckId(String(user?.truck_id ?? list[0]?.id ?? ""));
      })
      .catch(() => {});
  }, [user?.truck_id]);

  if (!tpl) return <Spinner size={28} />;

  const cargaFields = tpl.fields.filter((f) => f.stage === FIELD_STAGE.CARGA);
  const cu = tpl.campos_ubicacion ?? {};

  /** Valor de una parte según su modo: fijo lo trae la plantilla, libreta lo elige el chofer. */
  const valorDe = (campo: CampoUbicacion | undefined, key: string, fallback: string): string => {
    if (!campo) return fallback;
    if (campo.modo === CAMPO_MODO.FIJO) return campo.valor ?? fallback;
    return libreta[key]?.nombre ?? "";
  };

  // El destino sale de la libreta solo si la plantilla lo configuró; si no, del par clásico.
  const usaLibretaDestino = !!(cu.destino || cu.destinatario);
  const opt = optIdx !== "" ? tpl.dest_options[Number(optIdx)] : null;

  const origenFinal = valorDe(cu.origen, "origen", tpl.origin);
  const remitenteFinal = valorDe(cu.remitente, "remitente", tpl.remite ?? "");
  const destinoFinal = usaLibretaDestino ? valorDe(cu.destino, "destino", "") : opt?.destino ?? "";
  const destinatarioFinal = usaLibretaDestino
    ? valorDe(cu.destinatario, "destinatario", "")
    : opt?.destinatario === "Otro" && otroDest.trim()
      ? otroDest.trim()
      : opt?.destinatario ?? "";

  const est = destinoFinal ? estimateTravel(origenFinal, destinoFinal) : null;
  const setLib = (key: string) => (e: LibretaEntry | null) => setLibreta((p) => ({ ...p, [key]: e }));

  const setVal = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  async function confirm() {
    setError("");
    if (cu.origen?.modo === CAMPO_MODO.LIBRETA && cu.origen.requerido !== false && !origenFinal) {
      return setError("Elegí el origen.");
    }
    if (cu.remitente?.modo === CAMPO_MODO.LIBRETA && cu.remitente.requerido !== false && !remitenteFinal) {
      return setError("Elegí el remitente.");
    }
    if (usaLibretaDestino) {
      if (!destinoFinal) return setError("Elegí el destino.");
      if (cu.destinatario && cu.destinatario.requerido !== false && !destinatarioFinal) {
        return setError("Elegí el destinatario.");
      }
    } else if (!opt) {
      return setError("Elegí el destino.");
    }
    for (const f of cargaFields) {
      if (f.required && !String(values[f.key] ?? "").trim()) return setError(`Cargá ${f.label}.`);
    }
    if (!file) return setError("Sacá la foto de la carga.");

    setBusy(true);
    try {
      const trip = await api.post<Trip>("/trips", {
        template_id: tpl!.id,
        origin: origenFinal,
        remitente: remitenteFinal || undefined,
        destino: destinoFinal,
        destinatario: destinatarioFinal,
        field_values: values,
        truck_id: truckId ? Number(truckId) : undefined,
      });
      await uploadPhoto(trip.id, file, PHOTO_KIND.CARGA);
      navigate(`/viaje/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo iniciar el viaje");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Volver
      </Link>
      <div>
        <div className="kicker">{tpl.provider_name}</div>
        <h1 className="text-3xl text-ink">{tpl.name}</h1>
        <p className="text-sm text-ink/60">Salida desde {tpl.origin}</p>
      </div>

      <Card className="space-y-4">
        <Field label="Camión">
          <select className="input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plate}
                {t.id === user?.truck_id ? " (asignado)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink/50">Cambialo solo si hoy manejás otro camión.</p>
        </Field>
        {/* Partes que la plantilla resuelve con la libreta. Las fijas ya vienen resueltas. */}
        {cu.origen?.modo === CAMPO_MODO.LIBRETA && (
          <LibretaPicker
            tipo={cu.origen.libreta_tipo ?? "lugar"}
            label={cu.origen.label ?? "Origen / Lugar de carga"}
            value={libreta.origen ?? null}
            onChange={setLib("origen")}
            providerId={tpl.provider_id}
            permiteAlta={cu.origen.permite_alta !== false}
          />
        )}
        {cu.remitente?.modo === CAMPO_MODO.LIBRETA && (
          <LibretaPicker
            tipo={cu.remitente.libreta_tipo ?? "remitente"}
            label={cu.remitente.label ?? "Remitente"}
            value={libreta.remitente ?? null}
            onChange={setLib("remitente")}
            providerId={tpl.provider_id}
            permiteAlta={cu.remitente.permite_alta !== false}
            soloSeleccionables
          />
        )}

        {usaLibretaDestino ? (
          <>
            {cu.destino?.modo === CAMPO_MODO.LIBRETA && (
              <LibretaPicker
                tipo={cu.destino.libreta_tipo ?? "lugar"}
                label={cu.destino.label ?? "Destino"}
                value={libreta.destino ?? null}
                onChange={setLib("destino")}
                providerId={tpl.provider_id}
                permiteAlta={cu.destino.permite_alta !== false}
              />
            )}
            {cu.destinatario?.modo === CAMPO_MODO.LIBRETA && (
              <LibretaPicker
                tipo={cu.destinatario.libreta_tipo ?? "destinatario"}
                label={cu.destinatario.label ?? "Destinatario"}
                value={libreta.destinatario ?? null}
                onChange={setLib("destinatario")}
                providerId={tpl.provider_id}
                permiteAlta={cu.destinatario.permite_alta !== false}
              />
            )}
          </>
        ) : (
          <>
            <Field label="Destino">
              <select className="input" value={optIdx} onChange={(e) => setOptIdx(e.target.value)}>
                <option value="">Elegí…</option>
                {tpl.dest_options.map((o, i) => (
                  <option key={i} value={i}>
                    {o.destino}
                    {o.destinatario ? ` · ${o.destinatario}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {opt?.destinatario === "Otro" && (
              <Field label="¿Qué destinatario?">
                <input className="input" value={otroDest} onChange={(e) => setOtroDest(e.target.value)} />
              </Field>
            )}
          </>
        )}
        {cargaFields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? "" : " (opcional)"}`}>
            <input
              className="input"
              type={f.type === "numero" ? "number" : "text"}
              inputMode={f.type === "numero" ? "decimal" : undefined}
              value={values[f.key] ?? ""}
              onChange={(e) => setVal(f.key, e.target.value)}
            />
          </Field>
        ))}
      </Card>

      {est && (
        <div className="border-l-4 border-l-st-blueDot bg-surface px-4 py-3">
          <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
            Tiempo estimado
          </div>
          <div className="font-cond text-2xl font-semibold text-ink">{fmtDuration(est.hours)}</div>
          <div className="text-xs text-ink/55">
            ≈ {est.km} km · llegada aprox. {etaClock(est.hours)}
          </div>
        </div>
      )}

      <Card className="space-y-3">
        <Corners />
        <CameraCapture label="Foto de la carga" onChange={setFile} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="success" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Confirmar salida →
      </Button>
    </div>
  );
}
