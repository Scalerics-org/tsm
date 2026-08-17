import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmtConsumo, type FuelFeedback, type FuelLog } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Corners, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

export function FuelPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isFull, setIsFull] = useState<boolean | null>(null);
  const [kmFinal, setKmFinal] = useState("");
  const [liters, setLiters] = useState("");
  const [fotoTacografo, setFotoTacografo] = useState<File | null>(null);
  const [fotoBoleta, setFotoBoleta] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FuelFeedback | null>(null);

  // El km inicial no se pide: es el final de la surtida anterior de este camión.
  const [kmInicial, setKmInicial] = useState<number | null>(null);
  useEffect(() => {
    if (user?.truck_id == null) return setKmInicial(0);
    api
      .get<FuelLog[]>(`/fuel?truck=${user.truck_id}`)
      .then((logs) => setKmInicial(logs.reduce((max, l) => Math.max(max, l.odometer_km), 0)))
      .catch(() => setKmInicial(0));
  }, [user?.truck_id]);

  const recorridos = kmInicial != null && kmFinal ? Number(kmFinal) - kmInicial : null;

  async function confirm() {
    setError("");
    if (isFull === null) return setError("Indicá si llenaste o no.");
    if (isFull) {
      if (!kmFinal) return setError("Cargá el km final del tacógrafo.");
      if (recorridos != null && recorridos <= 0) {
        return setError(`El km final tiene que ser mayor al inicial (${kmInicial?.toLocaleString("es-UY")}).`);
      }
      if (!fotoTacografo) return setError("Sacá la foto del tacógrafo.");
    }
    if (!liters) return setError("Cargá los litros surtidos.");

    setBusy(true);
    try {
      const fd = new FormData();
      if (fotoTacografo) fd.append("file", await compressImage(fotoTacografo));
      if (fotoBoleta) fd.append("boleta", await compressImage(fotoBoleta));
      // Sin llenar no se pide el tacógrafo: se guarda el mismo km, y esos litros
      // recién se reparten cuando llene y se cierre el tramo.
      fd.append("odometer_km", isFull ? kmFinal : String(kmInicial ?? 0));
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
  if (kmInicial === null) return <Spinner size={28} />;

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
        <div>
          <span className="label">1 · ¿Llenaste?</span>
          <div className="grid gap-2">
            {[
              { v: true, l: "Llené los dos tanques" },
              { v: false, l: "No llené, eché un poco" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                onClick={() => {
                  setIsFull(o.v);
                  if (!o.v) setFotoTacografo(null);
                }}
                className={`border py-3 font-cond font-semibold uppercase tracking-[0.06em] ${
                  isFull === o.v ? "border-brand bg-brand text-bg" : "border-ink/20 text-ink"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* Sólo cuando llena: el tramo se mide de llenado a llenado. */}
        {isFull === true && (
          <>
            <div>
              <span className="label">2 · Km del tacógrafo</span>
              <div className="mb-2 flex items-center justify-between border border-ink/15 bg-surface px-3 py-2">
                <span className="text-sm text-ink/60">Inicial (de la surtida anterior)</span>
                <span className="font-cond text-lg font-semibold text-ink">
                  {kmInicial.toLocaleString("es-UY")}
                </span>
              </div>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={kmFinal}
                onChange={(e) => setKmFinal(e.target.value)}
                placeholder="Km final del tacógrafo"
              />
              {recorridos != null && recorridos > 0 && (
                <div className="mt-2 flex items-center justify-between border-l-4 border-l-brand bg-brand/[.06] px-3 py-2">
                  <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                    Km recorridos
                  </span>
                  <span className="font-cond text-xl font-semibold text-ink">
                    {recorridos.toLocaleString("es-UY")}
                  </span>
                </div>
              )}
            </div>

            <CameraCapture label="3 · Foto del tacógrafo" onChange={setFotoTacografo} />
          </>
        )}

        {isFull === false && (
          <p className="border-l-4 border-l-st-blueDot bg-surface px-3 py-2 text-sm text-ink/70">
            Sin tacógrafo: el consumo de esta surtida queda en 0,00 y se calcula recién cuando
            llenes el tanque.
          </p>
        )}

        <Field label="4 · Litros surtidos">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            placeholder="Ej: 474,7"
          />
        </Field>

        <CameraCapture label="Foto de la boleta de gasoil" onChange={setFotoBoleta} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="navy" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Guardar surtida
      </Button>
    </div>
  );
}

function ResultView({ r, onDone }: { r: FuelFeedback; onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="kicker">Surtida registrada</div>
        <h1 className="text-3xl text-ink">Consumo</h1>
      </div>

      <Card className="border-l-4 border-l-st-greenDot">
        <Corners />
        <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-st-greenTx">
          Esta surtida
        </div>
        {/* Sin llenar no hay tramo cerrado: se muestra 0,00, como en su planilla. */}
        <div className="mt-1 font-cond text-5xl font-semibold text-ink">
          {r.closed && r.segment_kml != null ? fmtConsumo(r.segment_kml) : "0,00"}
        </div>
        <div className="mt-1 text-sm text-ink/60">
          {r.closed && r.segment_kml != null
            ? `${r.segment_liters} L en ${r.segment_km?.toLocaleString("es-UY")} km`
            : r.closed
              ? "Es tu primer llenado, queda como base."
              : "Se calcula cuando llenes el tanque."}
        </div>
      </Card>

      <Card className="border-l-4 border-l-st-blueDot">
        <Corners />
        <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          Acumulado del mes
        </div>
        <div className="mt-1 font-cond text-5xl font-semibold text-ink">{fmtConsumo(r.month_kml)}</div>
        {r.month_kml != null && (
          <div className="mt-1 text-sm text-ink/60">
            {Math.round(r.month_liters)} L en {r.month_km.toLocaleString("es-UY")} km
          </div>
        )}
      </Card>

      <Button variant="navy" onClick={onDone} className="w-full py-4 text-lg">
        Listo
      </Button>
    </div>
  );
}
