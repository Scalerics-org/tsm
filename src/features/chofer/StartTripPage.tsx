import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FIELD_STAGE, PHOTO_KIND, type Trip, type TripTemplate } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, Corners, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

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
  const [tpl, setTpl] = useState<TripTemplate | null>(null);
  const [optIdx, setOptIdx] = useState("");
  const [otroDest, setOtroDest] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<TripTemplate[]>("/templates")
      .then((list) => setTpl(list.find((t) => t.id === Number(templateId)) ?? null))
      .catch(() => setTpl(null));
  }, [templateId]);

  if (!tpl) return <Spinner size={28} />;

  const cargaFields = tpl.fields.filter((f) => f.stage === FIELD_STAGE.CARGA);
  const opt = optIdx !== "" ? tpl.dest_options[Number(optIdx)] : null;
  const destinatarioFinal =
    opt?.destinatario === "Otro" && otroDest.trim() ? otroDest.trim() : opt?.destinatario ?? "";

  const setVal = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  async function confirm() {
    setError("");
    if (!opt) return setError("Elegí el destino.");
    for (const f of cargaFields) {
      if (f.required && !String(values[f.key] ?? "").trim()) return setError(`Cargá ${f.label}.`);
    }
    if (!file) return setError("Sacá la foto de la carga.");

    setBusy(true);
    try {
      const trip = await api.post<Trip>("/trips", {
        template_id: tpl!.id,
        origin: tpl!.origin,
        destino: opt.destino,
        destinatario: destinatarioFinal,
        field_values: values,
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
