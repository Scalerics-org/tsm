import { useState } from "react";
import { Link } from "react-router-dom";
import { LIBRETA_TIPO, type LibretaEntry, type PendienteCobro } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Button, Card, ErrorText } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";
import { agruparPendientes, type PendienteGrupo } from "../../lib/libreta-view";
import { ReglaCobroForm } from "./ReglaCobroForm";

export interface EngancheHecho {
  cargas: number;
  viajes: number;
  con_cobro: number;
  nombre: string;
}

interface Props {
  pendientes: PendienteCobro[];
  destinatarios: LibretaEntry[];
  onReglaCreada: (destrabadas: number) => void;
  /** Enganchar no guarda una regla: tiene su propio aviso. */
  onEnganchado: (r: EngancheHecho) => void;
}

/**
 * Cargas que quedaron sin regla de facturación, agrupadas por combinación.
 *
 * Se agrupan a propósito: la oficina define la regla una vez y se destraban todas las
 * cargas que la usan. Listar renglón por renglón haría parecer trabajo diario a algo
 * que se hace una vez por combinación nueva.
 */
export function PendientesCobroCard({ pendientes, destinatarios, onReglaCreada, onEnganchado }: Props) {
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
              onEnganchado={(r) => {
                setAbierto(null);
                onEnganchado(r);
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
  onEnganchado,
}: {
  grupo: PendienteGrupo;
  destinatarios: LibretaEntry[];
  abierto: boolean;
  onToggle: () => void;
  onReglaCreada: (destrabadas: number) => void;
  onEnganchado: (r: EngancheHecho) => void;
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
          // Sin id no hay a qué colgar la regla. Antes esto era una calle sin salida: el aviso
          // decía que había que normalizar el nombre y no había dónde hacerlo, porque estas
          // cargas están en viajes cerrados y las rutas del chofer exigen viaje en curso.
          <button className="flex-none text-sm text-brand-700 hover:underline" onClick={onToggle}>
            {abierto ? "Cancelar" : "Identificar el lugar de carga"}
          </button>
        ) : (
          <button className="flex-none text-sm text-brand-700 hover:underline" onClick={onToggle}>
            {abierto ? "Cancelar" : "Definir regla"}
          </button>
        )}
      </div>

      {abierto && grupo.remitente_id == null && (
        <EngancharLugar
          texto={grupo.remitente}
          cargas={grupo.cargas}
          onEnganchado={onEnganchado}
          onCancel={onToggle}
        />
      )}

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

/**
 * Engancha una carga vieja al lugar de carga de la libreta.
 *
 * El chofer escribió el lugar a mano —"ISUSA", "molino", "Las piedras"— y esa carga quedó sin
 * id: ninguna regla la alcanza y no se puede cobrar por regla nunca. Con el id puesto, si ya
 * hay una regla para ese lugar, el cobro se resuelve solo.
 */
function EngancharLugar({
  texto,
  cargas,
  onEnganchado,
  onCancel,
}: {
  texto: string;
  cargas: number;
  onEnganchado: (r: EngancheHecho) => void;
  onCancel: () => void;
}) {
  const [elegido, setElegido] = useState<LibretaEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enganchar() {
    if (!elegido) return setError("Elegí el lugar de carga.");
    setError("");
    setBusy(true);
    try {
      const r = await api.post<EngancheHecho>("/libreta/enganchar", {
        remitente: texto,
        libreta_id: elegido.id,
      });
      onEnganchado(r);
    } catch (e) {
      setError(mensajeDe(e, "No se pudo enganchar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
      <p className="text-sm text-ink/70">
        "{texto}" está escrito a mano en {cargas} carga(s) y no figura en la libreta, así que
        ninguna regla lo alcanza. Elegí con qué lugar de carga se corresponde:
      </p>
      {/* `soloSeleccionables`: "Varios", "Productores" y demás agrupadores no son un lugar de
          carga, y el servidor los rechaza igual. Ofrecerlos era mandar a la persona contra una
          pared. */}
      <LibretaPicker
        tipo={LIBRETA_TIPO.REMITENTE}
        label="Lugar de carga"
        value={elegido}
        onChange={setElegido}
        soloSeleccionables
        permiteAlta
      />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button onClick={enganchar} loading={busy}>
          Enganchar
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
