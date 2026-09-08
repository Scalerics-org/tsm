import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  litrosTotales,
  textoKmInicial,
  type FuelFeedback,
  type KmInicial,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Corners, ErrorText, Field, Spinner } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

/** Cuando no hay de dónde sacar el km de arranque, lo tipea el chofer. */
const SIN_DATO: KmInicial = { km: 0, origen: "sin-dato", fecha: null };

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

  // El km inicial no se pide: lo resuelve el servidor —última surtida de este camión, o el
  // odómetro que le cargó la oficina— y viene con de dónde salió, para poder mostrarlo.
  const [inicial, setInicial] = useState<KmInicial | null>(null);
  const [kmInicialManual, setKmInicialManual] = useState("");
  useEffect(() => {
    if (user?.truck_id == null) return setInicial(SIN_DATO);
    // Las surtidas previas se pedían sólo para calcular el acumulado que se le mostraba al
    // chofer. Sin esa tarjeta, la pantalla no las necesita: una consulta menos por surtida.
    api
      .get<KmInicial>("/fuel/inicial")
      .then(setInicial)
      .catch(() => setInicial(SIN_DATO));
  }, [user?.truck_id]);

  // Sólo se tipea cuando no hay de dónde sacarlo: ni surtidas ni odómetro en la ficha.
  const seTipea = inicial?.origen === "sin-dato";
  const kmInicial = seTipea ? Number(kmInicialManual || 0) : (inicial?.km ?? 0);
  const recorridos = inicial != null && kmFinal && kmInicial > 0 ? Number(kmFinal) - kmInicial : null;

  // Cada foto abre el paso siguiente. Sin la del tacógrafo no se ven ni los litros.
  const tacografoListo = isFull === false || fotoTacografo != null;
  const litros = litrosTotales(
    tanque1 === "" ? null : Number(tanque1),
    tanque2 === "" ? null : Number(tanque2),
  );
  async function confirm() {
    setError("");
    if (isFull === null) return setError("Indicá si llenaste o no.");
    if (isFull) {
      if (seTipea && !kmInicialManual) return setError("Poné el km inicial del tacógrafo.");
      if (!kmFinal) return setError("Cargá el km final del tacógrafo.");
      if (recorridos != null && recorridos <= 0) {
        return setError(`El km final tiene que ser mayor al inicial (${kmInicial.toLocaleString("es-UY")}).`);
      }
      if (!fotoTacografo) return setError("Sacá la foto del tacógrafo.");
    } else if (kmInicial <= 0) {
      // El chorro guarda el mismo km del arranque, así que sin arranque no hay qué guardar.
      return setError("Este camión todavía no tiene kilometraje cargado. Pedile a la oficina que lo cargue.");
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
      fd.append("odometer_km", isFull ? kmFinal : String(kmInicial));
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

  if (result) return <ResultView onDone={() => navigate("/")} />;
  if (inicial === null) return <Spinner size={28} />;

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
              {/* Si no hay ni surtidas ni odómetro en la ficha del camión, se escribe. Cuando
                  hay, queda fijo: dejarlo editable sería dejar que se corrija el número que
                  cierra el tramo. Al lado va de dónde salió —"de la surtida del 3/8", "cargado
                  por la oficina"— así el chofer sabe a quién preguntarle si no le cuadra. */}
              {seTipea ? (
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
                    Este camión no tiene kilometraje cargado: poné el de arranque.
                  </p>
                </div>
              ) : (
                <div className="mb-2 flex items-center justify-between border border-ink/15 bg-surface px-3 py-2">
                  <span className="text-sm text-ink/60">{textoKmInicial(inicial)}</span>
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
          <div className="border-l-4 border-l-st-blueDot bg-surface px-3 py-2 text-sm text-ink/70">
            Sin tacógrafo: el consumo de esta surtida queda en 0,00 y se calcula recién cuando
            llenes el tanque.
            {/* El chorro se guarda con el km de arranque, así que también acá tiene que verse
                cuál es y de dónde salió. */}
            {kmInicial > 0 && (
              <div className="mt-1 text-xs text-ink/55">
                Se guarda con {kmInicial.toLocaleString("es-UY")} km ·{" "}
                {textoKmInicial(inicial).toLowerCase()}
              </div>
            )}
          </div>
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

        {tacografoListo && litros != null && (
          <CameraCapture label="Foto de la boleta de gasoil" onChange={setFotoBoleta} />
        )}

      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="navy" loading={busy} onClick={confirm} className="w-full py-4 text-lg">
        Guardar surtida
      </Button>
    </div>
  );
}

/**
 * Lo que ve el chofer después de registrar la surtida.
 *
 * YA NO MUESTRA EL CONSUMO, y es una decisión del cliente: "estos detalles que los choferes no
 * los vean". Antes mostraba dos km/L —el de esta surtida y el acumulado del mes— como premio
 * por subir la boleta.
 *
 * De paso se cae sola la tensión que arrastrábamos: el acumulado del chofer se calculaba de
 * llenado a llenado y la oficina mide por calendario, así que sobre los mismos datos daban
 * distinto. Se había decidido dejarlo y documentarlo; ahora directamente no se muestra, y el
 * único km/L que existe para mirar es el de la oficina.
 *
 * Lo que se guarda no cambia: `fuelFeedback` se sigue calculando y la oficina lo sigue viendo.
 */
function ResultView({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="kicker">Listo</div>
        <h1 className="text-3xl text-ink">Surtida registrada</h1>
      </div>

      <Card className="border-l-4 border-l-st-greenDot">
        <Corners />
        <p className="text-ink">
          Quedó anotada con la foto de la boleta. No tenés que hacer nada más.
        </p>
      </Card>

      <Button variant="navy" onClick={onDone} className="w-full py-4 text-lg">
        Listo
      </Button>
    </div>
  );
}
