import { useState, type FormEvent } from "react";
import { COBRO_TIPO, type CobroTipo, type LibretaEntry } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, ErrorText, Field } from "../../components/ui";

interface Props {
  remitenteId: number;
  remitenteNombre: string;
  /** Entradas tipo destinatario, para elegir la parte destino de la combinación. */
  destinatarios: LibretaEntry[];
  destinatarioInicial?: number | null;
  /** Recibe cuántas cargas ya registradas quedaron resueltas por esta regla. */
  onSaved: (destrabadas: number) => void;
  onCancel: () => void;
}

/**
 * Alta de una regla de facturación para la combinación remitente + destinatario.
 *
 * Es el único trabajo manual del módulo, y se hace una vez por combinación nueva:
 * a partir de ahí cada carga que la use hereda el cobro sola.
 */
export function ReglaCobroForm({
  remitenteId,
  remitenteNombre,
  destinatarios,
  destinatarioInicial = null,
  onSaved,
  onCancel,
}: Props) {
  const [destinatarioId, setDestinatarioId] = useState(
    destinatarioInicial != null ? String(destinatarioInicial) : "",
  );
  const [cobroTipo, setCobroTipo] = useState<CobroTipo>(COBRO_TIPO.CLIENTE);
  const [cobroA, setCobroA] = useState(remitenteNombre);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cobroA.trim()) {
      setError("Falta a quién se factura.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ saved: boolean; destrabadas: number }>("/libreta/reglas", {
        remitente_id: remitenteId,
        destinatario_id: destinatarioId ? Number(destinatarioId) : null,
        cobro_tipo: cobroTipo,
        cobro_a: cobroA.trim(),
      });
      onSaved(r.destrabadas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la regla.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mt-3 border border-ink/15 bg-bg p-3">
      <div className="mb-3 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
        Regla de facturación · carga desde {remitenteNombre}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cuando va a">
          <select
            className="input"
            value={destinatarioId}
            onChange={(e) => setDestinatarioId(e.target.value)}
          >
            <option value="">Cualquier destino</option>
            {destinatarios.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Se cobra a">
          <select
            className="input"
            value={cobroTipo}
            onChange={(e) => setCobroTipo(e.target.value as CobroTipo)}
          >
            <option value={COBRO_TIPO.CLIENTE}>Cliente</option>
            <option value={COBRO_TIPO.PROVEEDOR}>Proveedor</option>
          </select>
        </Field>

        <Field label="Nombre a facturar">
          <input
            className="input"
            value={cobroA}
            onChange={(e) => setCobroA(e.target.value)}
            placeholder="Ej: Armco"
          />
        </Field>
      </div>

      <p className="mt-2 text-xs text-ink/45">
        Una regla sin destino puntual aplica a todo lo que cargue {remitenteNombre}; la del par exacto
        pisa a la general.
      </p>

      <ErrorText>{error}</ErrorText>

      <div className="mt-3 flex gap-2">
        <Button type="submit" loading={busy}>
          Guardar regla
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
