import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

export function FuelPage() {
  const navigate = useNavigate();
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [isFull, setIsFull] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setError("");
    if (!odometer || !liters) return setError("Cargá el odómetro y los litros.");
    if (!file) return setError("Sacá la foto del tacógrafo.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      fd.append("odometer_km", odometer);
      fd.append("liters", liters);
      fd.append("is_full", String(isFull));
      await api.upload("/fuel", fd);
      navigate("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la surtida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Inicio
      </Link>
      <div>
        <div className="kicker">Combustible</div>
        <h1 className="text-3xl text-ink">Registrar surtida</h1>
      </div>

      <Card className="space-y-4">
        <CameraCapture label="Foto del tacógrafo (odómetro)" onChange={setFile} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Odómetro (km)">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="Ej: 182450"
            />
          </Field>
          <Field label="Litros cargados">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              placeholder="Ej: 300"
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={isFull}
            onChange={(e) => setIsFull(e.target.checked)}
            className="h-5 w-5 accent-brand"
          />
          Llenado completo (destildá si fue solo un "chorro" en ruta)
        </label>
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="navy" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Guardar surtida
      </Button>
    </div>
  );
}
