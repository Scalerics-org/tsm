import { useState } from "react";
import { litrosTotales, type FuelLog } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, ErrorText, Spinner } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

/**
 * Una surtida en la ficha del camión, con corregir y borrar.
 *
 * "Al igual gas oil desde oficina, corregir litros y km." Hasta ahora una surtida quedaba
 * congelada: si el chofer tipeaba 990.000 en vez de 99.000 en el surtidor, ese número
 * arruinaba el km/L de ese mes para siempre y no había forma de arreglarlo.
 *
 * La FECHA también se corrige ("lo mismo de las fechas en el gas oil"): una surtida cargada
 * al otro día cae en el mes que no es, y el acumulado del mes sale de ahí. Se edita el día;
 * la hora se conserva, que es lo que ordena dos surtidas del mismo día.
 *
 * Las fotos no se editan: son la evidencia de lo que pasó.
 */
export function SurtidaRow({ f, onChanged }: { f: FuelLog; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [km, setKm] = useState(String(f.odometer_km));
  const [t1, setT1] = useState(f.liters_tanque1 == null ? "" : String(f.liters_tanque1));
  const [t2, setT2] = useState(f.liters_tanque2 == null ? "" : String(f.liters_tanque2));
  const [fecha, setFecha] = useState(f.logged_at.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo criterio que en el celular: el total se suma, no se escribe. Si la surtida es
  // vieja y no tiene desglose, se deja editar el total sin repartirlo por tanque.
  const sinDesglose = f.liters_tanque1 == null && f.liters_tanque2 == null;
  const total = sinDesglose
    ? Number(t1 || 0)
    : litrosTotales(t1 === "" ? null : Number(t1), t2 === "" ? null : Number(t2));

  async function guardar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`/fuel/${f.id}`, {
        odometer_km: Number(km),
        liters: total,
        liters_tanque1: sinDesglose ? null : t1 === "" ? null : Number(t1),
        liters_tanque2: sinDesglose ? null : t2 === "" ? null : Number(t2),
        fecha,
      });
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function borrar() {
    if (busy) return;
    if (!confirm(`¿Borrar la surtida del ${fmtDateTime(f.logged_at)}, de ${f.liters} litros?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/fuel/${f.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar");
      setBusy(false);
    }
  }

  if (!editando) {
    return (
      <tr className="border-b border-ink/10">
        <td className="px-4 py-2 text-ink/70">
          {fmtDateTime(f.logged_at)}
          {f.edited_at && (
            <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-st-amberTx">corregida</span>
          )}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-ink/70">
          {f.odometer_km.toLocaleString("es-UY")}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-ink/70">
          {f.liters.toLocaleString("es-UY")}
          {(f.liters_tanque1 != null || f.liters_tanque2 != null) && (
            <div className="text-[11px] text-ink/45">
              T1 {f.liters_tanque1 ?? 0} · T2 {f.liters_tanque2 ?? 0}
            </div>
          )}
        </td>
        <td className="px-4 py-2 text-ink/70">{f.is_full ? "Sí" : "Chorro"}</td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="mr-3 text-sm text-brand-700 hover:underline"
          >
            Corregir
          </button>
          <button
            type="button"
            onClick={borrar}
            disabled={busy}
            className="text-sm text-st-redTx hover:underline disabled:opacity-40"
          >
            {busy ? <Spinner size={12} /> : "Borrar"}
          </button>
          <ErrorText>{error}</ErrorText>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink/10 bg-surface">
      <td className="px-4 py-2">
        <input
          className="input w-36"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          aria-label="Fecha de la surtida"
        />
        <div className="mt-1 text-[11px] text-ink/45">{fmtDateTime(f.logged_at)}</div>
      </td>
      <td className="px-4 py-2 text-right">
        <input
          className="input w-28 text-right"
          type="number"
          inputMode="decimal"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          aria-label="Odómetro"
        />
      </td>
      <td className="px-4 py-2 text-right">
        {sinDesglose ? (
          <input
            className="input w-24 text-right"
            type="number"
            inputMode="decimal"
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            aria-label="Litros totales"
          />
        ) : (
          <div className="flex justify-end gap-1">
            <input
              className="input w-20 text-right"
              type="number"
              inputMode="decimal"
              value={t1}
              onChange={(e) => setT1(e.target.value)}
              aria-label="Litros del tanque 1"
              placeholder="T1"
            />
            <input
              className="input w-20 text-right"
              type="number"
              inputMode="decimal"
              value={t2}
              onChange={(e) => setT2(e.target.value)}
              aria-label="Litros del tanque 2"
              placeholder="T2"
            />
          </div>
        )}
        <div className="mt-1 text-[11px] text-ink/55">Total {total ?? 0} L</div>
      </td>
      <td className="px-4 py-2 text-ink/70">{f.is_full ? "Sí" : "Chorro"}</td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-2">
          <Button onClick={guardar} loading={busy}>
            Guardar
          </Button>
          <Button variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
        {/* La cadena de odómetro es acumulativa: tocar los km de una surtida vieja mueve el
            consumo de ese mes y de todos los siguientes. Mejor decirlo que sorprender. */}
        <p className="mt-1 text-right text-[11px] text-ink/55">
          Cambiar los km o la fecha recalcula el consumo de este mes y los siguientes.
        </p>
        <ErrorText>{error}</ErrorText>
      </td>
    </tr>
  );
}
