import { useState } from "react";
import { fmtConsumo, litrosTotales, type FuelLog } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, ErrorText, Spinner } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { VisorFotos, type FotoDelVisor } from "../../components/VisorFotos";
import { FechaInput } from "../../components/FechaInput";

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
 *
 * Y el TILDE DE VERIFICADA, que es el control de la oficina sobre los litros: el único número
 * de la surtida que el chofer puede mover a mano —menos litros declarados = mejor consumo—.
 * El tilde no cambia nada, sólo deja dicho quién miró la boleta contra estos números.
 */
export function SurtidaRow({
  f,
  onChanged,
  sospechosa = null,
  consumo = null,
  esperado = 0,
}: {
  f: FuelLog;
  onChanged: () => void;
  /** Por qué esta surtida no cierra contra el rendimiento del camión, o `null` si cierra. */
  sospechosa?: string | null;
  /** El tramo que cierra esta surtida. `null` = chorro, o el primer llenado (la base). */
  consumo?: { kml: number; km: number; litros: number } | null;
  /** El rendimiento esperado del camión (ficha), para pintar la columna. 0 = no se sabe. */
  esperado?: number;
}) {
  const [editando, setEditando] = useState(false);
  const [km, setKm] = useState(String(f.odometer_km));
  const [t1, setT1] = useState(f.liters_tanque1 == null ? "" : String(f.liters_tanque1));
  const [t2, setT2] = useState(f.liters_tanque2 == null ? "" : String(f.liters_tanque2));
  const [fecha, setFecha] = useState(f.logged_at.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  // Optimista: el tilde tiene que responder al toque, es una fila más de una tabla que la
  // oficina va a recorrer entera. Si el servidor rechaza, vuelve solo.
  const [verificada, setVerificada] = useState(f.verificado_at != null);

  async function alternarVerificada() {
    const querido = !verificada;
    setVerificada(querido);
    setError(null);
    try {
      await api.put(`/fuel/${f.id}/verificado`, { verificado: querido });
      onChanged();
    } catch (e) {
      setVerificada(!querido);
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el tilde");
    }
  }

  const fotos: FotoDelVisor[] = [
    f.r2_key && { r2_key: f.r2_key, titulo: "Tacógrafo", detalle: fmtDateTime(f.logged_at) },
    f.r2_key_boleta && {
      r2_key: f.r2_key_boleta,
      titulo: "Boleta de gasoil",
      detalle: fmtDateTime(f.logged_at),
    },
  ].filter(Boolean) as FotoDelVisor[];

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
          {/* El aviso va pegado a los litros porque es el número que no cierra, y en la fila
              que la oficina va a tildar: es el momento en que tiene la boleta en la mano. */}
          {sospechosa && !verificada && (
            <div className="mt-1 text-left text-[11px] font-medium text-st-redTx" title={sospechosa}>
              ⚠ revisar la boleta
            </div>
          )}
        </td>
        <CeldaConsumo consumo={consumo} esperado={esperado} sospechosa={!!sospechosa && !verificada} chorro={!f.is_full} />
        <td className="px-4 py-2 text-ink/70">
          {f.is_full ? "Sí" : "Chorro"}
          {/* Las dos fotos respaldan números distintos: el tacógrafo los km y la boleta los
              litros. Estaban guardadas y no se podían mirar desde ningún lado. */}
          {fotos.length > 0 && (
            <button
              type="button"
              onClick={() => setAmpliada(0)}
              className="mt-1 block text-xs text-brand-700 hover:underline"
            >
              📷 ver {fotos.length === 1 ? "la foto" : `las ${fotos.length} fotos`}
            </button>
          )}
          {ampliada != null && (
            <VisorFotos fotos={fotos} indice={ampliada} onCerrar={() => setAmpliada(null)} />
          )}
        </td>
        <td className="px-4 py-2">
          {/* El tilde de la oficina. Cuando está puesto dice quién y cuándo: sin eso sería
              una marca sin dueño, y lo que se quiere saber es justamente quién la miró. */}
          <button
            type="button"
            onClick={alternarVerificada}
            aria-pressed={verificada}
            title={
              verificada
                ? `Verificada${f.verificado_por ? ` por ${f.verificado_por}` : ""}${
                    f.verificado_at ? ` el ${fmtDateTime(f.verificado_at)}` : ""
                  }`
                : "Marcar que ya chequeaste la boleta"
            }
            className={`flex h-6 w-6 items-center justify-center border transition ${
              verificada
                ? "border-st-greenDot bg-st-greenBg text-st-greenTx"
                : "border-ink/25 text-transparent hover:border-brand hover:text-ink/25"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {verificada && f.verificado_por && (
            <div className="mt-1 text-[11px] text-ink/45">{f.verificado_por}</div>
          )}
        </td>
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
        <FechaInput
          className="input w-36"
          value={fecha}
          onChange={setFecha}
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
      <td className="px-4 py-2 text-right text-ink/40">—</td>
      <td className="px-4 py-2 text-ink/70">{f.is_full ? "Sí" : "Chorro"}</td>
      {/* Sin tilde mientras se corrige: guardar la corrección se lo lleva puesto igual. */}
      <td className="px-4 py-2" />
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

/**
 * El km/L del tramo que cierra la surtida, pintado para leerse de un vistazo: "una columna con
 * el consumo, así puedo observar visualmente cada camión" (Rodrigo, 18/9).
 *
 * Rojo cuando el aviso la marca (no cierra contra el propio camión); ámbar cuando rinde menos
 * que lo esperado en la ficha; el resto, normal. El detalle —km y litros del tramo— en el título.
 */
function CeldaConsumo({
  consumo,
  esperado,
  sospechosa,
  chorro,
}: {
  consumo: { kml: number; km: number; litros: number } | null;
  esperado: number;
  sospechosa: boolean;
  chorro: boolean;
}) {
  if (!consumo) {
    return (
      <td className="px-4 py-2 text-right text-xs text-ink/40" title={chorro ? "Sus litros van al llenado siguiente" : "Primer llenado: es la base"}>
        {chorro ? "va al siguiente" : "base"}
      </td>
    );
  }
  const color = sospechosa
    ? "text-st-redTx"
    : esperado > 0 && consumo.kml < esperado
      ? "text-st-amberTx"
      : "text-st-greenTx";
  return (
    <td
      className={`px-4 py-2 text-right font-semibold tabular-nums ${color}`}
      title={`${consumo.km.toLocaleString("es-UY")} km con ${consumo.litros.toLocaleString("es-UY")} L`}
    >
      {fmtConsumo(consumo.kml)}
      <div className="text-[11px] font-normal text-ink/45">km/L</div>
    </td>
  );
}
