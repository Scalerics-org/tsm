import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fmtConsumo,
  fuelFeedback,
  kmPorLitro,
  litrosTotales,
  type FuelFeedback,
  type FuelLog,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Corners, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

/**
 * Registrar surtida.
 *
 * El orden de los pasos no es estético: es lo que hace que las fotos lleguen. El chofer
 * quiere ver su consumo, así que el consumo aparece DESPUÉS de subir el tacógrafo. Antes
 * pasaba que surtían, arrancaban, y la foto llegaba 100 km más tarde — o no llegaba.
 */
export function FuelPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isFull, setIsFull] = useState<boolean | null>(null);
  const [kmFinal, setKmFinal] = useState("");
  // Los dos tanques del camión. El total sale de sumarlos, no se tipea.
  const [tanque1, setTanque1] = useState("");
  const [tanque2, setTanque2] = useState("");
  const [fotoTacografo, setFotoTacografo] = useState<File | null>(null);
  const [fotoBoleta, setFotoBoleta] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FuelFeedback | null>(null);

  // El km inicial no se pide: es el final de la surtida anterior de este camión.
  const [kmInicialPrevio, setKmInicialPrevio] = useState<number | null>(null);
  const [logsPrevios, setLogsPrevios] = useState<FuelLog[]>([]);
  const [primeraDelCamion, setPrimeraDelCamion] = useState(false);
  const [kmInicialManual, setKmInicialManual] = useState("");
  useEffect(() => {
    if (user?.truck_id == null) return setKmInicialPrevio(0);
    api
      .get<FuelLog[]>(`/fuel?truck=${user.truck_id}`)
      .then((logs) => {
        setLogsPrevios(logs);
        setPrimeraDelCamion(logs.length === 0);
        setKmInicialPrevio(logs.reduce((max, l) => Math.max(max, l.odometer_km), 0));
      })
      .catch(() => setKmInicialPrevio(0));
  }, [user?.truck_id]);

  const kmInicial = primeraDelCamion ? Number(kmInicialManual || 0) : (kmInicialPrevio ?? 0);
  const recorridos =
    kmInicialPrevio != null && kmFinal && kmInicial > 0 ? Number(kmFinal) - kmInicial : null;

  // Cada foto abre el paso siguiente. Sin la del tacógrafo no se ven ni los litros.
  const tacografoListo = isFull === false || fotoTacografo != null;
  const litros = litrosTotales(
    tanque1 === "" ? null : Number(tanque1),
    tanque2 === "" ? null : Number(tanque2),
  );
  const consumoDelDia =
    isFull && fotoTacografo && recorridos && recorridos > 0 && litros
      ? kmPorLitro(recorridos, litros)
      : null;

  /**
   * El acumulado del mes, como premio por subir la boleta.
   *
   * Es la segunda mitad de la misma idea que el consumo del día: cada foto abre algo que al
   * chofer le interesa ver. Sin esto, el acumulado recién aparecía después de guardar, así
   * que la boleta no tenía ninguna recompensa atada y era la que más se salteaba.
   *
   * Se calcula acá con los mismos datos que usa el servidor, así que es lo que va a quedar
   * guardado — no una estimación distinta.
   */
  const acumuladoPrevio =
    fotoBoleta && litros && kmInicialPrevio != null
      ? fuelFeedback(
          logsPrevios.map((l) => ({
            odometer_km: l.odometer_km,
            liters: l.liters,
            is_full: !!l.is_full,
            logged_at: l.logged_at,
          })),
          {
            odometer_km: isFull ? Number(kmFinal) : kmInicial,
            liters: litros,
            is_full: !!isFull,
            logged_at: new Date().toISOString().slice(0, 10),
          },
        ).month_kml
      : null;

  async function confirm() {
    setError("");
    if (isFull === null) return setError("Indicá si llenaste o no.");
    if (isFull) {
      if (primeraDelCamion && !kmInicialManual) return setError("Poné el km inicial del tacógrafo.");
      if (!kmFinal) return setError("Cargá el km final del tacógrafo.");
      if (recorridos != null && recorridos <= 0) {
        return setError(`El km final tiene que ser mayor al inicial (${kmInicial?.toLocaleString("es-UY")}).`);
      }
      if (!fotoTacografo) return setError("Sacá la foto del tacógrafo.");
    }
    if (!litros) return setError("Cargá los litros de al menos un tanque.");
    if (!fotoBoleta) return setError("Sacá la foto de la boleta de gasoil.");

    setBusy(true);
    try {
      const fd = new FormData();
      if (fotoTacografo) fd.append("file", await compressImage(fotoTacografo));
      fd.append("boleta", await compressImage(fotoBoleta));
      // Sin llenar no se pide el tacógrafo: se guarda el mismo km, y esos litros
      // recién se reparten cuando llene y se cierre el tramo.
      fd.append("odometer_km", isFull ? kmFinal : String(kmInicial ?? 0));
      fd.append("liters", String(litros));
      if (tanque1 !== "") fd.append("liters_tanque1", tanque1);
      if (tanque2 !== "") fd.append("liters_tanque2", tanque2);
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
  if (kmInicialPrevio === null) return <Spinner size={28} />;

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

        {isFull === true && (
          <>
            <div>
              <span className="label">2 · Km del tacógrafo</span>
              {/* En la primera surtida del camión no hay anterior de dónde sacarlo, así que
                  se escribe. Después queda fijo: es el final de la surtida previa, y dejarlo
                  editable sería dejar que se corrija el número que cierra el tramo. */}
              {primeraDelCamion ? (
                <div className="mb-2">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    value={kmInicialManual}
                    onChange={(e) => setKmInicialManual(e.target.value)}
                    placeholder="Km inicial del tacógrafo"
                  />
                  <p className="mt-1 text-xs text-ink/50">
                    Es la primera surtida de este camión: poné el kilometraje de arranque.
                  </p>
                </div>
              ) : (
                <div className="mb-2 flex items-center justify-between border border-ink/15 bg-surface px-3 py-2">
                  <span className="text-sm text-ink/60">Inicial (de la surtida anterior)</span>
                  <span className="font-cond text-lg font-semibold text-ink">
                    {kmInicial.toLocaleString("es-UY")}
                  </span>
                </div>
              )}
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

        {/* Los litros se habilitan con la foto del tacógrafo. Si el consumo se pudiera ver
            antes, la foto dejaría de llegar. */}
        {!tacografoListo ? (
          <p className="border border-dashed border-ink/25 bg-bg px-3 py-4 text-center text-sm text-ink/55">
            Sacá la foto del tacógrafo para seguir.
          </p>
        ) : (
          <div>
            <span className="label">4 · Litros surtidos</span>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tanque 1">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={tanque1}
                  onChange={(e) => setTanque1(e.target.value)}
                  placeholder="Ej: 280"
                />
              </Field>
              <Field label="Tanque 2">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={tanque2}
                  onChange={(e) => setTanque2(e.target.value)}
                  placeholder="Ej: 194,7"
                />
              </Field>
            </div>
            {/* El total no se escribe: se suma. Si se pudiera tipear y no coincidiera con los
                dos tanques, el consumo saldría de un número que nadie sabe cuál es. */}
            <div className="mt-2 flex items-baseline justify-between border-t border-ink/15 pt-2">
              <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/55">
                Litros totales
              </span>
              <span className="font-cond text-2xl font-semibold text-ink">
                {litros != null ? litros.toLocaleString("es-UY") : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink/50">
              Si cargaste en un solo tanque, dejá el otro vacío.
            </p>
          </div>
        )}

        {/* La recompensa: su consumo, apenas subió la foto y puso los litros. */}
        {consumoDelDia != null && (
          <div className="border-l-4 border-l-st-greenDot bg-st-greenBg px-3 py-3">
            <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-st-greenTx">
              Tu consumo en este viaje
            </div>
            <div className="mt-1 font-cond text-4xl font-semibold text-ink">
              {fmtConsumo(consumoDelDia)}
            </div>
            <div className="text-xs text-ink/55">km por litro</div>
          </div>
        )}

        {tacografoListo && litros != null && (
          <CameraCapture label="Foto de la boleta de gasoil" onChange={setFotoBoleta} />
        )}

        {/* La segunda recompensa: el acumulado del mes, apenas sube la boleta. Cada foto
            abre algo que al chofer le interesa ver — es lo que hace que las fotos lleguen. */}
        {acumuladoPrevio != null && (
          <div className="border-l-4 border-l-brand bg-brand/[.06] px-3 py-3">
            <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
              Cómo venís este mes
            </div>
            <div className="mt-1 font-cond text-4xl font-semibold text-ink">
              {fmtConsumo(acumuladoPrevio)}
            </div>
            <div className="text-xs text-ink/55">km por litro acumulado</div>
          </div>
        )}
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
