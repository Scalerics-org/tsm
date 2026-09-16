import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { Button, Card, Corners, ErrorText } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

/**
 * Registrar surtida de la cámara de frío.
 *
 * "Solo para la boleta del gas oil": el chofer anota los litros y saca la foto de la boleta.
 * Nada de km ni de horas: el equipo de frío no tiene tacógrafo, y las horas no las puede leer
 * el chofer —las pone la oficina una vez por mes—.
 *
 * Va separada de la surtida del camión porque ese gasoil no mueve kilómetros: si se mezclara,
 * el km/L del camión saldría peor de lo que anda.
 */
export function FrioFuelPage() {
  const navigate = useNavigate();
  const [litros, setLitros] = useState("");
  const [fotoBoleta, setFotoBoleta] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guardada, setGuardada] = useState(false);

  async function confirm() {
    setError("");
    const n = Number(litros);
    if (!litros || !Number.isFinite(n) || n <= 0) return setError("Cargá los litros.");
    if (!fotoBoleta) return setError("Sacá la foto de la boleta de gasoil.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("liters", String(n));
      fd.append("boleta", await compressImage(fotoBoleta));
      await api.upload("/frio", fd);
      setGuardada(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la surtida");
    } finally {
      setBusy(false);
    }
  }

  if (guardada) {
    return (
      <div className="space-y-5">
        <div>
          <div className="kicker">Cámara de frío</div>
          <h1 className="text-3xl text-ink">Surtida registrada</h1>
        </div>
        <Card className="border-l-4 border-l-st-greenDot">
          <Corners />
          <div className="font-cond text-5xl font-semibold text-ink">
            {Number(litros).toLocaleString("es-UY")} L
          </div>
          <div className="mt-1 text-sm text-ink/60">cargados en la cámara de frío</div>
        </Card>
        <Button variant="navy" onClick={() => navigate("/")} className="w-full py-4 text-lg">
          Listo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Inicio
      </Link>
      <div>
        <div className="kicker">Cámara de frío</div>
        <h1 className="text-3xl text-ink">Registrar surtida</h1>
      </div>

      <Card className="space-y-4">
        <div>
          <span className="label">1 · Litros cargados en la cámara</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={litros}
            onChange={(e) => setLitros(e.target.value)}
            placeholder="Ej: 85"
          />
        </div>
        <CameraCapture label="2 · Foto de la boleta de gasoil" onChange={setFotoBoleta} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="navy" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Guardar surtida de la cámara
      </Button>
    </div>
  );
}
