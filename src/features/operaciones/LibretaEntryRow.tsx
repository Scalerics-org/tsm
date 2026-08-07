import { useState } from "react";
import {
  COBRO_TIPO,
  LIBRETA_ESTADO,
  LIBRETA_TIPO,
  type CobroRegla,
  type LibretaEntry,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText } from "../../components/ui";
import { describirDestino, reglasDeRemitente } from "../../lib/libreta-view";
import { ReglaCobroForm } from "./ReglaCobroForm";

interface Props {
  entry: LibretaEntry;
  reglas: CobroRegla[];
  /** Entradas tipo destinatario, para armar reglas por combinación. */
  destinatarios: LibretaEntry[];
  /** Candidatas para fusionar: mismo tipo, sin contarse a sí misma. */
  candidatasFusion: LibretaEntry[];
  nombres: Map<number, string>;
  providerName: string | null;
  isAdmin: boolean;
  onChanged: () => void;
  onReglaCreada: (destrabadas: number) => void;
}

export function LibretaEntryRow({
  entry,
  reglas,
  destinatarios,
  candidatasFusion,
  nombres,
  providerName,
  isAdmin,
  onChanged,
  onReglaCreada,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fusionando, setFusionando] = useState(false);
  const [destinoFusion, setDestinoFusion] = useState("");
  const [nuevaRegla, setNuevaRegla] = useState(false);

  const esNueva = entry.estado === LIBRETA_ESTADO.NUEVO;
  const esRemitente = entry.tipo === LIBRETA_TIPO.REMITENTE;
  const misReglas = esRemitente ? reglasDeRemitente(reglas, entry.id) : [];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  function renombrar() {
    const nombre = prompt("Nuevo nombre:", entry.nombre);
    if (!nombre?.trim() || nombre.trim() === entry.nombre) return;
    run(() => api.put(`/libreta/${entry.id}`, { nombre: nombre.trim() }));
  }

  function fusionar() {
    if (!destinoFusion) return;
    const destino = candidatasFusion.find((e) => e.id === Number(destinoFusion));
    if (!confirm(`Se borra "${entry.nombre}" y queda "${destino?.nombre}". ¿Fusionar?`)) return;
    run(async () => {
      await api.post(`/libreta/${entry.id}/merge`, { into_id: Number(destinoFusion) });
      setFusionando(false);
    });
  }

  function eliminar() {
    const aviso = entry.usos
      ? `"${entry.nombre}" tiene ${entry.usos} uso(s). Si es un duplicado conviene fusionarla en vez de borrarla. ¿Eliminar igual?`
      : `¿Eliminar "${entry.nombre}"?`;
    if (!confirm(aviso)) return;
    run(() => api.del(`/libreta/${entry.id}`));
  }

  return (
    <Card accent={esNueva ? "amber" : undefined} className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-cond text-lg font-semibold text-ink">{entry.nombre}</span>
            {esNueva && (
              <span className="pill border-st-amberBd bg-st-amberBg text-st-amberTx">
                <i className="pill-dot bg-st-amberDot" />
                A REVISAR
              </span>
            )}
            {entry.agrupador && (
              <span className="pill border-ink/20 bg-surface text-ink/60">AGRUPADOR</span>
            )}
          </div>
          <div className="mt-1 text-xs text-ink/50">
            {providerName ?? "Todos los clientes"} · {entry.usos} uso(s)
            {esRemitente && ` · ${misReglas.length} regla(s)`}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
          {esNueva && (
            <button
              className="text-st-greenTx hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => run(() => api.put(`/libreta/${entry.id}`, { estado: LIBRETA_ESTADO.CONFIRMADO }))}
            >
              Confirmar
            </button>
          )}
          <button className="text-brand-700 hover:underline disabled:opacity-50" disabled={busy} onClick={renombrar}>
            Renombrar
          </button>
          {candidatasFusion.length > 0 && (
            <button
              className="text-brand-700 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => setFusionando((f) => !f)}
            >
              Fusionar
            </button>
          )}
          {isAdmin && (
            <button className="text-st-redTx hover:underline disabled:opacity-50" disabled={busy} onClick={eliminar}>
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Agrupador: "Varios" y similares sirven para nombrar un viaje, nunca para decir dónde se cargó. */}
      {entry.tipo !== LIBRETA_TIPO.LUGAR && (
        <label className="flex items-center gap-2 text-xs text-ink/60">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={entry.agrupador}
            disabled={busy}
            onChange={(e) => run(() => api.put(`/libreta/${entry.id}`, { agrupador: e.target.checked }))}
          />
          Agrupador: el chofer no puede elegirlo como lugar de carga
        </label>
      )}

      {fusionando && (
        <div className="border border-ink/15 bg-bg p-3">
          <div className="mb-2 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            Fusionar “{entry.nombre}” dentro de
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="input max-w-xs"
              value={destinoFusion}
              onChange={(e) => setDestinoFusion(e.target.value)}
            >
              <option value="">Elegí la entrada que queda…</option>
              {candidatasFusion.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={fusionar} disabled={!destinoFusion || busy}>
              Fusionar
            </Button>
            <Button variant="ghost" onClick={() => setFusionando(false)}>
              Cancelar
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink/45">
            Las reglas se reapuntan y los usos se suman. Es lo que mantiene los reportes sin duplicados.
          </p>
        </div>
      )}

      {esRemitente && (
        <div className="border-t border-ink/10 pt-2">
          {misReglas.length === 0 ? (
            <p className="text-xs text-ink/50">
              Sin regla de facturación: las cargas desde acá quedan pendientes de asignar.
            </p>
          ) : (
            <ul className="space-y-1">
              {misReglas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink/80">
                    → {describirDestino(r, nombres)}:{" "}
                    <span
                      className={
                        r.cobro_tipo === COBRO_TIPO.CLIENTE ? "text-st-greenTx" : "text-st-blueTx"
                      }
                    >
                      {r.cobro_tipo}
                    </span>{" "}
                    {r.cobro_a}
                  </span>
                  <button
                    className="flex-none text-st-redTx hover:underline disabled:opacity-50"
                    disabled={busy}
                    title="Borrar regla"
                    onClick={() => run(() => api.del(`/libreta/reglas/${r.id}`))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {nuevaRegla ? (
            <ReglaCobroForm
              remitenteId={entry.id}
              remitenteNombre={entry.nombre}
              destinatarios={destinatarios}
              onSaved={(destrabadas) => {
                setNuevaRegla(false);
                onReglaCreada(destrabadas);
              }}
              onCancel={() => setNuevaRegla(false)}
            />
          ) : (
            <button
              className="mt-2 text-sm text-brand-700 hover:underline"
              onClick={() => setNuevaRegla(true)}
            >
              + Agregar regla
            </button>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
