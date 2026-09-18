import { useState } from "react";
import { PHOTO_KIND, type TemplateField } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { compressImage } from "../../lib/image";
import { Button, Card, ErrorText, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { CampoDePlantilla } from "../../components/CampoDePlantilla";

/**
 * Lo que el chofer completa en el camino: en los internacionales, el N° de MIC y su foto.
 *
 * "Después para continuar, que le pida el nro del MIC y la foto. Y luego sí cerrarlo." La
 * hoja del MIC se la dan en el puente, así que al salir no se le pide. Si pasa el puente sin
 * cargarla, se la pide el cierre: esta tarjeta ayuda, no traba.
 *
 * La foto se sube apenas se saca, como en la llegada: la cámara vuelve vacía y puede sacar
 * otra si la primera salió movida.
 */
export function EnElPuente({
  tripId,
  campos,
  valores,
  fotoLabel,
  fotosCarga,
  onDone,
}: {
  tripId: number;
  campos: TemplateField[];
  valores: Record<string, string>;
  /** Etiqueta de la foto (ej. "Hoja MIC"). null = no se pide foto acá. */
  fotoLabel: string | null;
  fotosCarga: number;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((f) => [f.key, valores[f.key] ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  async function guardar() {
    setError("");
    setGuardado(false);
    setBusy(true);
    try {
      await api.patch(`/trips/${tripId}/campos`, { field_values: values });
      setGuardado(true);
      onDone();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">En el puente</h2>
        <p className="text-sm text-ink/60">
          Cuando te den los papeles, cargalos acá. Si no llegás, te los pide al cerrar el viaje.
        </p>
      </div>
      {campos.map((f) => (
        <CampoDePlantilla
          key={f.key}
          campo={f}
          valor={values[f.key] ?? ""}
          onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
        />
      ))}
      <ErrorText>{error}</ErrorText>
      {guardado && <p className="text-sm text-st-greenTx">Guardado.</p>}
      <Button loading={busy} onClick={guardar} className="w-full py-3">
        Guardar
      </Button>
      {fotoLabel && <FotoDelPuente tripId={tripId} label={fotoLabel} yaHay={fotosCarga} onDone={onDone} />}
    </Card>
  );
}

/** La foto del papel del puente. Va como foto de la carga, que es la que exige el cierre. */
function FotoDelPuente({
  tripId,
  label,
  yaHay,
  onDone,
}: {
  tripId: number;
  label: string;
  yaHay: number;
  onDone: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  async function subir(file: File | null) {
    if (!file || subiendo) return;
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      fd.append("trip_id", String(tripId));
      fd.append("kind", PHOTO_KIND.CARGA);
      await api.upload("/photos", fd);
      onDone();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo subir la foto"));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      {yaHay > 0 && <p className="mb-1 text-xs text-ink/50">Ya está la foto. Podés sumar otra si hace falta.</p>}
      {subiendo ? (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-ink/60">
          <Spinner size={16} /> Subiendo…
        </div>
      ) : (
        <CameraCapture label={`Foto: ${label}`} onChange={subir} />
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
