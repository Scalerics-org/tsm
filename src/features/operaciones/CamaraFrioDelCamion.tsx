import { useEffect, useState } from "react";
import { fmtConsumo } from "@shared/domain";
import type { ConsumoFrioMes, SurtidaFrio } from "@shared/camara-frio";
import { api, mensajeDe } from "../../lib/api";
import { Card, Corners, ErrorDeCarga, ErrorText, Spinner } from "../../components/ui";
import { VisorFotos } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";

interface DatosFrio {
  surtidas: SurtidaFrio[];
  meses: ConsumoFrioMes[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/**
 * La cámara de frío en la ficha del camión: litros por hora de cada mes y sus surtidas.
 *
 * "Yo desde la oficina le agrego las horas inicio de mes, final de mes, y ahí me da litros por
 * hora que gasta." Las horas se escriben acá; los litros los carga el chofer con la boleta.
 *
 * El mes en curso aparece siempre, aunque todavía no tenga surtidas: el día 1 es cuando hay que
 * anotar las horas de inicio.
 */
export function CamaraFrioDelCamion({ truckId }: { truckId: number }) {
  const [d, setD] = useState<DatosFrio | null>(null);
  const [falló, setFalló] = useState<string | null>(null);

  const load = () => {
    setFalló(null);
    api
      .get<DatosFrio>(`/frio?truck=${truckId}`)
      .then(setD)
      .catch((e) => setFalló(mensajeDe(e)));
  };
  useEffect(load, [truckId]);

  if (!d) {
    return falló ? (
      <ErrorDeCarga titulo="No se pudo cargar la cámara de frío." mensaje={falló} onReintentar={load} />
    ) : (
      <Spinner size={20} />
    );
  }

  const esteMes = new Date().toISOString().slice(0, 7);
  const meses: ConsumoFrioMes[] = d.meses.some((m) => m.mes === esteMes)
    ? d.meses
    : [
        { mes: esteMes, litros: 0, surtidas: 0, horas_inicio: null, horas_fin: null, horas: null, litros_por_hora: null },
        ...d.meses,
      ];

  return (
    <Card className="overflow-x-auto p-0">
      <Corners />
      <div className="border-b border-ink/15 px-4 py-3">
        <div className="font-cond text-lg font-semibold text-ink">❄ Cámara de frío</div>
        {/* La regla escrita, igual que en el consumo del camión: sin esto no se sabe de dónde
            sale el número cuando no cierra contra la factura. */}
        <p className="text-xs text-ink/50">
          Litros por hora = todo el gasoil cargado en la cámara dentro del mes, dividido las horas
          del equipo (final menos inicio). Las horas se anotan acá.
        </p>
      </div>
      {falló && (
        <div className="px-4 pt-3">
          <ErrorDeCarga titulo="No se pudo actualizar: los números pueden estar viejos." mensaje={falló} onReintentar={load} />
        </div>
      )}

      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-ink/60">
          <tr className="border-b border-ink/15">
            <th className="px-4 py-2">Mes</th>
            <th className="px-4 py-2">Horas al inicio</th>
            <th className="px-4 py-2">Horas al final</th>
            <th className="px-4 py-2 text-right">Horas</th>
            <th className="px-4 py-2 text-right">Litros</th>
            <th className="px-4 py-2 text-right">L/hora</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <MesFrio key={m.mes} truckId={truckId} m={m} onGuardado={load} />
          ))}
        </tbody>
      </table>

      <div className="border-y border-ink/15 px-4 py-2 font-cond text-sm font-semibold uppercase tracking-[0.08em] text-ink/60">
        Surtidas de la cámara
      </div>
      <table className="w-full min-w-[480px] text-sm">
        <tbody>
          {d.surtidas.map((s) => (
            <SurtidaFrioRow key={s.id} s={s} onChanged={load} />
          ))}
          {d.surtidas.length === 0 && (
            <tr>
              <td className="px-4 py-3 text-ink/50">Todavía no hay surtidas de la cámara.</td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function MesFrio({ truckId, m, onGuardado }: { truckId: number; m: ConsumoFrioMes; onGuardado: () => void }) {
  const [inicio, setInicio] = useState(m.horas_inicio == null ? "" : String(m.horas_inicio));
  const [fin, setFin] = useState(m.horas_fin == null ? "" : String(m.horas_fin));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al recargar la ficha la fila no se vuelve a montar (la clave es el mes), así que los campos
  // se ponen al día con lo que quedó guardado.
  useEffect(() => {
    setInicio(m.horas_inicio == null ? "" : String(m.horas_inicio));
    setFin(m.horas_fin == null ? "" : String(m.horas_fin));
  }, [m.horas_inicio, m.horas_fin]);

  // Se compara el número y no el texto: "1000.0" guardado vuelve como 1000, y el botón de
  // Guardar quedaba a la vista como si no se hubiera guardado.
  const comoNumero = (v: string) => (v === "" ? null : Number(v));
  const cambió = comoNumero(inicio) !== m.horas_inicio || comoNumero(fin) !== m.horas_fin;

  async function guardar() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/frio/horas/${truckId}/${m.mes}`, {
        horas_inicio: inicio === "" ? null : Number(inicio),
        horas_fin: fin === "" ? null : Number(fin),
      });
      onGuardado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudieron guardar las horas"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-ink/10 align-top">
      <td className="px-4 py-2 font-cond font-semibold uppercase tracking-[0.06em] text-ink/70">{nombreMes(m.mes)}</td>
      <td className="px-4 py-2">
        <input className="input w-28 py-1" type="number" inputMode="decimal" value={inicio} onChange={(e) => setInicio(e.target.value)} placeholder="Ej: 12.340" />
      </td>
      <td className="px-4 py-2">
        <input className="input w-28 py-1" type="number" inputMode="decimal" value={fin} onChange={(e) => setFin(e.target.value)} placeholder="—" />
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-ink/70">{m.horas != null ? m.horas.toLocaleString("es-UY") : "—"}</td>
      <td className="px-4 py-2 text-right tabular-nums text-ink/70">
        {m.litros.toLocaleString("es-UY")}
        <div className="text-[11px] text-ink/45">
          {m.surtidas} surtida{m.surtidas === 1 ? "" : "s"}
        </div>
      </td>
      <td className="px-4 py-2 text-right font-semibold text-ink">
        {m.litros_por_hora != null ? fmtConsumo(m.litros_por_hora) : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {cambió && (
          <button type="button" onClick={guardar} disabled={busy} className="text-sm text-brand-700 hover:underline disabled:opacity-40">
            {busy ? <Spinner size={12} /> : "Guardar"}
          </button>
        )}
        <ErrorText>{error}</ErrorText>
      </td>
    </tr>
  );
}

function SurtidaFrioRow({ s, onChanged }: { s: SurtidaFrio; onChanged: () => void }) {
  const [editando, setEditando] = useState(false);
  const [litros, setLitros] = useState(String(s.liters));
  const [verFoto, setVerFoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/frio/${s.id}`, { liters: Number(litros) });
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  async function borrar() {
    if (!confirm(`¿Borrar la surtida de la cámara del ${fmtDateTime(s.logged_at)}, de ${s.liters} litros?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/frio/${s.id}`);
      onChanged();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo borrar"));
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-ink/10">
      <td className="px-4 py-2 text-ink/70">
        {fmtDateTime(s.logged_at)}
        {s.edited_at && <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-st-amberTx">corregida</span>}
        <div className="text-xs text-ink/45">{s.driver_name ?? "Sin chofer"}</div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-ink/70">
        {editando ? (
          <input className="input w-24 py-1 text-right" type="number" inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} />
        ) : (
          `${s.liters.toLocaleString("es-UY")} L`
        )}
      </td>
      <td className="px-4 py-2">
        {s.r2_key_boleta ? (
          <button type="button" onClick={() => setVerFoto(true)} className="text-xs text-brand-700 hover:underline">
            📷 ver la boleta
          </button>
        ) : (
          <span className="text-xs text-ink/40">sin foto</span>
        )}
        {verFoto && s.r2_key_boleta && (
          <VisorFotos
            fotos={[{ r2_key: s.r2_key_boleta, titulo: "Boleta de gasoil · cámara de frío", detalle: fmtDateTime(s.logged_at) }]}
            indice={0}
            onCerrar={() => setVerFoto(false)}
          />
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editando ? (
          <>
            <button type="button" onClick={guardar} disabled={busy} className="mr-3 text-sm text-brand-700 hover:underline disabled:opacity-40">
              Guardar
            </button>
            <button type="button" onClick={() => { setEditando(false); setLitros(String(s.liters)); }} className="text-sm text-ink/60 hover:underline">
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditando(true)} className="mr-3 text-sm text-brand-700 hover:underline">
              Corregir
            </button>
            <button type="button" onClick={borrar} disabled={busy} className="text-sm text-st-redTx hover:underline disabled:opacity-40">
              Borrar
            </button>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </td>
    </tr>
  );
}
