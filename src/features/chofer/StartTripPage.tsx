import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PHOTO_KIND, type Trip, type TripTemplate } from "@shared/domain";
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
  const [destination, setDestination] = useState("");
  const [otherDest, setOtherDest] = useState("");
  const [kilos, setKilos] = useState("");
  const [extra, setExtra] = useState("");
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

  const dest = destination === "__otro__" ? otherDest.trim() : destination;

  async function confirm() {
    setError("");
    if (!dest) return setError("Elegí el destino.");
    if (tpl!.requires_kilos && !kilos) return setError("Cargá los kilos de carga.");
    if (tpl!.extra_type !== "none" && tpl!.extra_required && !extra)
      return setError(`Cargá ${tpl!.extra_label}.`);
    if (!file) return setError("Sacá la foto de la carga.");

    setBusy(true);
    try {
      const trip = await api.post<Trip>("/trips", {
        template_id: tpl!.id,
        destination: dest,
        kilos: kilos ? Number(kilos) : undefined,
        extra_value: extra || undefined,
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
          <select className="input" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Elegí…</option>
            {tpl.destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="__otro__">Otro…</option>
          </select>
        </Field>
        {destination === "__otro__" && (
          <Field label="¿A dónde?">
            <input className="input" value={otherDest} onChange={(e) => setOtherDest(e.target.value)} />
          </Field>
        )}
        {tpl.requires_kilos && (
          <Field label="Kilos de carga">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={kilos}
              onChange={(e) => setKilos(e.target.value)}
              placeholder="Ej: 24000"
            />
          </Field>
        )}
        {tpl.extra_type !== "none" && (
          <Field label={`${tpl.extra_label}${tpl.extra_required ? "" : " (opcional)"}`}>
            <input
              className="input"
              type={tpl.extra_type === "numero" ? "number" : "text"}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </Field>
        )}
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
