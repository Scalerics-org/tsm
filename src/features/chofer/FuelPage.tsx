import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { FuelFeedback } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, Corners, ErrorText, Field } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

export function FuelPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [odometer, setOdometer] = useState("");
  const [isFull, setIsFull] = useState<boolean | null>(null);
  const [liters, setLiters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FuelFeedback | null>(null);

  async function confirm() {
    setError("");
    if (!file) return setError("Sacá la foto del tacógrafo.");
    if (!odometer) return setError("Cargá el kilometraje.");
    if (isFull === null) return setError("Indicá si llenaste o no.");
    if (!liters) return setError("Cargá los litros.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      fd.append("odometer_km", odometer);
      fd.append("liters", liters);
      fd.append("is_full", String(isFull));
      const res = await api.upload<{ feedback: FuelFeedback }>("/fuel", fd);
      setResult(res.feedback);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar la surtida");
    } finally {
      setBusy(false);
    }
  }

  if (result) return <ResultView r={result} onDone={() => navigate("/")} />;

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
        <CameraCapture label="1 · Foto del tacógrafo" onChange={setFile} />
        <Field label="2 · Kilometraje (km)">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder="Ej: 182450"
          />
        </Field>
        <div>
          <span className="label">3 · ¿Llenaste el tanque?</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, l: "Sí, llené" },
              { v: false, l: "No (chorro)" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => setIsFull(o.v)}
                className={`border py-3 font-cond font-semibold uppercase tracking-[0.06em] ${
                  isFull === o.v ? "border-brand bg-brand text-bg" : "border-ink/20 text-ink"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <Field label="4 · Litros cargados">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            placeholder="Ej: 300"
          />
        </Field>
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="navy" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Guardar surtida
      </Button>
    </div>
  );
}

function ResultView({ r, onDone }: { r: FuelFeedback; onDone: () => void }) {
  const fmt = (n: number | null) => (n != null ? n.toFixed(1) : "—");
  return (
    <div className="space-y-5">
      <div>
        <div className="kicker">Surtida registrada</div>
        <h1 className="text-3xl text-ink">Consumo</h1>
      </div>

      <Card className="border-l-4 border-l-st-greenDot">
        <Corners />
        <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-st-greenTx">
          Este tramo
        </div>
        {r.closed && r.segment_l100 != null ? (
          <>
            <div className="mt-1 font-cond text-4xl font-semibold text-ink">{fmt(r.segment_l100)} L/100km</div>
            <div className="mt-1 text-sm text-ink/60">
              {fmt(r.segment_liters)} L en {r.segment_km} km
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-ink/70">
            {r.closed ? "Es tu primer llenado, queda como base." : "Tramo abierto: se cierra en la próxima que llenes."}
          </div>
        )}
      </Card>

      <Card className="border-l-4 border-l-st-blueDot">
        <Corners />
        <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          Acumulado del mes
        </div>
        {r.month_l100 != null ? (
          <>
            <div className="mt-1 font-cond text-4xl font-semibold text-ink">{fmt(r.month_l100)} L/100km</div>
            <div className="mt-1 text-sm text-ink/60">
              {fmt(r.month_liters)} L en {r.month_km} km
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-ink/70">Primer llenado del mes.</div>
        )}
      </Card>

      <Button variant="navy" onClick={onDone} className="w-full py-4 text-lg">
        Listo
      </Button>
    </div>
  );
}
