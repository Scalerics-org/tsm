import { useState } from "react";
import { Link } from "react-router-dom";
import type { LibretaEntry, PendienteCobro } from "@shared/domain";
import { Card } from "../../components/ui";
import { agruparPendientes, type PendienteGrupo } from "../../lib/libreta-view";
import { ReglaCobroForm } from "./ReglaCobroForm";

interface Props {
  pendientes: PendienteCobro[];
  destinatarios: LibretaEntry[];
  onReglaCreada: (destrabadas: number) => void;
}

/**
 * Cargas que quedaron sin regla de facturación, agrupadas por combinación.
 *
 * Se agrupan a propósito: la oficina define la regla una vez y se destraban todas las
 * cargas que la usan. Listar renglón por renglón haría parecer trabajo diario a algo
 * que se hace una vez por combinación nueva.
 */
export function PendientesCobroCard({ pendientes, destinatarios, onReglaCreada }: Props) {
  const grupos = agruparPendientes(pendientes);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (grupos.length === 0) {
    return (
      <Card accent="green">
        <div className="font-cond text-lg font-semibold text-ink">Sin cargas pendientes</div>
        <p className="mt-1 text-sm text-ink/60">
          Todas las cargas registradas heredaron su regla de facturación.
        </p>
      </Card>
    );
  }

  return (
    <Card accent="amber" className="space-y-3">
      <div>
        <div className="font-cond text-lg font-semibold text-ink">
          Cargas sin regla de facturación
        </div>
        <p className="mt-1 text-sm text-ink/60">
          {grupos.length} combinación(es) sin definir. Se resuelve una vez por combinación, no por viaje.
        </p>
      </div>

      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.key} className="border border-ink/15 bg-bg p-3">
            <GrupoPendiente
              grupo={g}
              destinatarios={destinatarios}
              abierto={abierto === g.key}
              onToggle={() => setAbierto((k) => (k === g.key ? null : g.key))}
              onReglaCreada={(destrabadas) => {
                setAbierto(null);
                onReglaCreada(destrabadas);
              }}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GrupoPendiente({
  grupo,
  destinatarios,
  abierto,
  onToggle,
  onReglaCreada,
}: {
  grupo: PendienteGrupo;
  destinatarios: LibretaEntry[];
  abierto: boolean;
  onToggle: () => void;
  onReglaCreada: (destrabadas: number) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-cond text-base font-semibold text-ink">
            {grupo.remitente} → {grupo.clientes.join(" / ") || "sin destinatario"}
          </div>
          <div className="mt-1 text-xs text-ink/50">
            {grupo.cargas} carga(s) en {grupo.viajes.length} viaje(s):{" "}
            {grupo.viajes.slice(0, 6).map((id, i) => (
              <span key={id}>
                {i > 0 && ", "}
                <Link to={`/panel/viajes/${id}`} className="text-brand-700 hover:underline">
                  #{id}
                </Link>
              </span>
            ))}
            {grupo.viajes.length > 6 && ` y ${grupo.viajes.length - 6} más`}
          </div>
        </div>

        {grupo.remitente_id == null ? (
          // Sin id no hay a qué colgar la regla: primero hay que normalizar el nombre en la libreta.
          <span className="flex-none text-xs text-ink/50">
            El lugar de carga no está en la libreta
          </span>
        ) : (
          <button className="flex-none text-sm text-brand-700 hover:underline" onClick={onToggle}>
            {abierto ? "Cancelar" : "Definir regla"}
          </button>
        )}
      </div>

      {abierto && grupo.remitente_id != null && (
        <ReglaCobroForm
          remitenteId={grupo.remitente_id}
          remitenteNombre={grupo.remitente}
          destinatarios={destinatarios}
          destinatarioInicial={grupo.cliente_ids[0] ?? null}
          onSaved={onReglaCreada}
          onCancel={onToggle}
        />
      )}
    </>
  );
}
