import { useCallback, useEffect, useState } from "react";
import type { LecturaOdometro } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, Corners, ErrorText, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { VisorFotos } from "../../components/VisorFotos";
import { FechaInput } from "../../components/FechaInput";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function nombreDelMes(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1] ?? periodo} ${anio}`;
}

/**
 * Las lecturas mensuales del tacógrafo de un camión, con el kilometraje corregible.
 *
 * Es la pieza que faltaba para cerrar el circuito. El chofer sube una sola foto por mes y no
 * la puede volver a cargar; si tipeó 3.954.705 en vez de 395.705, la app le dice que avise a
 * la oficina — y la oficina no tenía dónde arreglarlo. Peor: al mes siguiente el número real
 * queda por debajo del anterior, la app se lo rechaza, y sin la lectura del mes el chofer no
 * puede empezar ningún viaje. Un dígito de más y el camión parado.
 *
 * La foto NO se toca: es la evidencia contra la que se compara el número corregido.
 */
export function LecturasDelCamion({ truckId }: { truckId: number }) {
  const [lecturas, setLecturas] = useState<LecturaOdometro[] | null>(null);

  const load = useCallback(() => {
    api
      .get<LecturaOdometro[]>(`/lecturas?truck=${truckId}`)
      .then(setLecturas)
      .catch(() => setLecturas([]));
  }, [truckId]);
  useEffect(load, [load]);

  return (
    <Card className="overflow-x-auto p-0">
      <Corners />
      <div className="border-b border-ink/15 px-4 py-3">
        <div className="font-cond text-lg font-semibold text-ink">Tacógrafo, mes a mes</div>
        <p className="mt-0.5 text-xs text-ink/55">
          De acá sale la auditoría de kilómetros. Si un número está mal, corregilo: el chofer
          no puede volver a cargar el mes.
        </p>
      </div>
      {lecturas === null ? (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      ) : lecturas.length === 0 ? (
        <p className="px-4 py-3 text-ink/50">Todavía no hay ninguna foto del tacógrafo.</p>
      ) : (
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-2">Mes</th>
              <th className="px-4 py-2 text-right">Kilometraje</th>
              <th className="px-4 py-2">La sacó</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lecturas.map((l) => (
              <FilaLectura key={l.id} l={l} onChanged={load} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function FilaLectura({ l, onChanged }: { l: LecturaOdometro; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [km, setKm] = useState(String(l.kilometraje));
  const [mes, setMes] = useState(l.periodo);
  const [dia, setDia] = useState(l.tomada_at.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ampliada, setAmpliada] = useState(false);

  const cancelar = () => {
    setKm(String(l.kilometraje));
    setMes(l.periodo);
    setDia(l.tomada_at.slice(0, 10));
    setError("");
    setEditando(false);
  };

  async function guardar() {
    const n = Number(km);
    if (!Number.isFinite(n) || n <= 0) return setError("Poné el kilometraje que marca la foto.");
    setError("");
    setBusy(true);
    try {
      // El mes va sólo si de verdad cambió: el backend lo trata como opcional y así una
      // corrección de kilometraje sigue siendo exactamente lo que era antes.
      await api.put(`/lecturas/${l.id}`, {
        kilometraje: n,
        ...(mes !== l.periodo ? { periodo: mes } : {}),
        // La fecha de la foto va sólo si cambió, por lo mismo que el mes. Y va el día
        // pelado: el backend le pone el mediodía, que es lo que menos corre la ventana.
        ...(dia !== l.tomada_at.slice(0, 10) ? { tomada_at: dia } : {}),
      });
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-ink/10">
      <td className="px-4 py-2 text-ink/70">
        {/* La foto que cierra agosto se saca en los primeros días de setiembre. Si quedó
            anotada contra el mes equivocado, se corre la cuenta de los dos meses, y hasta
            ahora no había forma de moverla. */}
        {editando ? (
          <input
            className="input w-40"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Mes al que pertenece la lectura"
          />
        ) : (
          nombreDelMes(l.periodo)
        )}
        {/* El día real de la foto, que casi nunca es el 1°: es la ventana que la auditoría
            compara. Se corrige porque `tomada_at` se llenaba con la fecha de CARGA, y
            cargando el atraso desde oficina eso es el día en que se subió el archivo, no el
            del tacógrafo. La foto en sí no se toca: es la evidencia. */}
        {editando ? (
          <label className="mt-1 block">
            <span className="block text-[11px] uppercase tracking-[0.08em] text-ink/45">
              Día de la foto
            </span>
            <FechaInput
              className="input w-40 py-1 text-sm"
              value={dia}
              onChange={setDia}
              aria-label="Día en que se sacó la foto del tacógrafo"
            />
          </label>
        ) : (
          <div className="text-[11px] text-ink/45">
            foto del {fmtDate(l.tomada_at)}
            {l.edited_at && (
              <span className="ml-2 uppercase tracking-[0.08em] text-st-amberTx">corregida</span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editando ? (
          <input
            className="input w-32 text-right"
            type="number"
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            aria-label="Kilometraje del tacógrafo"
            autoFocus
          />
        ) : (
          <span className="tabular-nums text-ink/70">
            {Math.round(l.kilometraje).toLocaleString("es-UY")} km
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-ink/70">
        {l.driver_name ?? <span className="text-ink/40">la oficina</span>}
        {/* Es la evidencia contra la que se compara el kilometraje corregido. Existía en R2
            desde el primer día y no había forma de mirarla. */}
        {l.r2_key ? (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="mt-0.5 block text-xs text-brand-700 hover:underline"
          >
            📷 ver la foto
          </button>
        ) : (
          <div className="text-[11px] text-ink/45">sin foto</div>
        )}
        {ampliada && l.r2_key && (
          <VisorFotos
            fotos={[
              {
                r2_key: l.r2_key,
                titulo: `Tacógrafo · ${nombreDelMes(l.periodo)}`,
                detalle: `Foto del ${fmtDate(l.tomada_at)} · ${Math.round(l.kilometraje).toLocaleString("es-UY")} km`,
              },
            ]}
            indice={0}
            onCerrar={() => setAmpliada(false)}
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editando ? (
          <div className="flex justify-end gap-2">
            <Button onClick={guardar} loading={busy}>
              Guardar
            </Button>
            <Button variant="ghost" onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-sm text-brand-700 hover:underline"
          >
            Corregir
          </button>
        )}
        {/* La resta de dos meses usa este número en los dos extremos: tocarlo mueve el mes
            propio y el siguiente. Mejor decirlo que sorprender. */}
        {editando && (
          <p className="mt-1 text-right text-[11px] text-ink/55">
            {mes !== l.periodo
              ? "Al cambiarla de mes se mueven los kilómetros de cuatro meses: el que deja y el que ocupa, más el siguiente a cada uno."
              : dia !== l.tomada_at.slice(0, 10)
                ? "La fecha de la foto define la ventana que se compara: al moverla cambian qué viajes entran en este mes y en el siguiente."
                : "Cambia los kilómetros de este mes y del siguiente."}
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </td>
    </tr>
  );
}
