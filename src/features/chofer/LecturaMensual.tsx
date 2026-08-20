import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Corners, ErrorText } from "../../components/ui";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

export interface Pendiente {
  periodo: string; // "YYYY-MM"
  truck_id: number | null;
  truck_plate: string | null;
  falta: boolean;
  km_anterior: number | null;
  exige_foto: boolean;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function nombreDelMes(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1] ?? periodo} de ${anio}`;
}

/**
 * El pedido de la lectura mensual del tacógrafo, arriba de todo en la pantalla del chofer.
 *
 * "Se me ocurrió que el día 1 o 31 exigirle una foto del tacógrafo, o sea son 12 fotos al
 * año." Es con lo que la oficina verifica que no se le comió ningún viaje a nadie.
 *
 * BLOQUEA EMPEZAR UN VIAJE, no la app: "por ahora vamos a bloquearla, total es solo una foto
 * al tacógrafo, no es complicado". El viaje que ya está en curso se puede cerrar igual —"si
 * un chofer justo está en ruta cuando cambia el día, que le permita terminar el viaje y
 * después que le pida la foto"—, así no se pierde justo el dato que esto viene a proteger.
 * Quien decide eso es `ChoferHome`, que es el que sabe si hay un viaje abierto; acá sólo se
 * pide la foto.
 *
 * Devuelve `null` cuando no hay nada que pedir, así se monta sin condiciones.
 */
export function AvisoLecturaMensual({
  pendiente,
  onGuardada,
}: {
  pendiente: Pendiente | null;
  onGuardada: () => void;
}) {
  const [km, setKm] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  async function guardar() {
    setError("");
    if (!km) return setError("Poné el kilometraje que marca el tacógrafo.");
    if (pendiente?.km_anterior != null && Number(km) < pendiente.km_anterior) {
      return setError(
        `El tacógrafo no puede marcar menos que el mes pasado (${Math.round(pendiente.km_anterior).toLocaleString("es-UY")} km).`,
      );
    }
    if (pendiente?.exige_foto && !foto) return setError("Sacá la foto del tacógrafo.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kilometraje", km);
      if (foto) fd.append("file", await compressImage(foto));
      await api.upload("/lecturas", fd);
      setListo(true);
      // Recién ahora se le habilita salir: el aviso y el bloqueo miran el mismo dato.
      onGuardada();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la lectura");
    } finally {
      setBusy(false);
    }
  }

  if (listo) {
    return (
      <div className="panel border-l-4 border-l-st-greenDot bg-st-greenBg p-4">
        <Corners />
        <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-st-greenTx">
          Tacógrafo del mes
        </div>
        <p className="mt-1 text-sm text-ink/75">
          Listo, quedó guardada. Nos vemos el mes que viene.
        </p>
      </div>
    );
  }

  if (!pendiente?.falta) return null;

  return (
    <div className="panel border-l-4 border-l-st-amberDot p-4">
      <Corners />
      <div className="kicker">Control del mes</div>
      <h2 className="font-cond text-2xl font-semibold leading-tight text-ink">
        Falta la foto del tacógrafo
      </h2>
      <p className="mt-1 text-sm text-ink/75">
        Es la de {nombreDelMes(pendiente.periodo)}
        {pendiente.truck_plate ? ` del ${pendiente.truck_plate}` : ""}. Es una sola vez por mes
        y con eso la oficina controla los kilómetros.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <span className="label">Kilometraje del tacógrafo</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="Ej: 354537"
          />
          {pendiente.km_anterior != null && (
            <p className="mt-1 text-xs text-ink/50">
              El mes pasado marcaba {Math.round(pendiente.km_anterior).toLocaleString("es-UY")} km.
            </p>
          )}
        </div>

        {/* La cámara va acá adentro: si hubiera que ir a otra pantalla, la foto no llega. */}
        {pendiente.exige_foto && (
          <CameraCapture label="Foto del tacógrafo" onChange={setFoto} />
        )}

        <ErrorText>{error}</ErrorText>
        <Button variant="navy" loading={busy} onClick={guardar} className="w-full py-3">
          Guardar la lectura
        </Button>
      </div>
    </div>
  );
}
