import { useEffect, useState } from "react";
import {
  LIBRETA_TIPO,
  UNIDAD,
  type LibretaEntry,
  type TripSegment,
  type Unidad,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

interface Props {
  tripId: number;
  providerId: number | null;
  segments: TripSegment[];
  editable: boolean;
  onChange: () => void;
}

/**
 * Cargas del viaje combinado. El chofer registra dónde cargó y para quién, una línea
 * por lugar. No ve nada de facturación: eso lo completan solas las reglas de la libreta.
 */
export function CargasPanel({ tripId, providerId, segments, editable, onChange }: Props) {
  const [agregando, setAgregando] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span className="label mb-0">Cargas</span>
        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
          {segments.length} cargada{segments.length === 1 ? "" : "s"}
        </span>
      </div>

      {segments.length === 0 && !agregando && (
        <p className="mb-2 border-l-4 border-l-st-amberDot bg-surface px-3 py-2 text-sm text-ink/70">
          Todavía no registraste ninguna carga.
        </p>
      )}

      <div className="space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-start gap-3 border border-ink/15 bg-bg p-3">
            <span className="grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-surface font-cond text-[13px] font-semibold text-ink/60">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-cond text-lg font-semibold leading-tight text-ink">{s.remitente}</div>
              {s.clientes.length > 0 && (
                <div className="text-sm text-ink/60">{s.clientes.join(" · ")}</div>
              )}
              {s.remito && <div className="text-xs text-ink/45">Remito {s.remito}</div>}
            </div>
            {s.cantidad != null && (
              <div className="flex-none text-right">
                <div className="font-cond text-base font-semibold leading-none text-ink">
                  {s.cantidad.toLocaleString("es-UY")}
                </div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-ink/45">{s.unidad}</div>
              </div>
            )}
            {editable && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`¿Quitar la carga de ${s.remitente}?`)) return;
                  await api.del(`/trips/${tripId}/segments/${i}`);
                  onChange();
                }}
                className="flex-none text-lg leading-none text-ink/30 hover:text-st-redTx"
                aria-label={`Quitar la carga de ${s.remitente}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {editable &&
        (agregando ? (
          <NuevaCarga
            tripId={tripId}
            providerId={providerId}
            ultimoLugar={segments.length ? segments[segments.length - 1] : null}
            onCancel={() => setAgregando(false)}
            onSaved={() => {
              setAgregando(false);
              onChange();
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-dashed border-brand/40 bg-brand/[.06] py-3 font-cond text-[15px] font-semibold text-brand-700"
          >
            <span className="text-lg leading-none">+</span> Agregar carga
          </button>
        ))}
    </div>
  );
}

function NuevaCarga({
  tripId,
  providerId,
  ultimoLugar,
  onCancel,
  onSaved,
}: {
  tripId: number;
  providerId: number | null;
  ultimoLugar: TripSegment | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  // Si viene cargando en el mismo lugar (Timber para tres clientes), arranca con ese
  // puesto: así la segunda y la tercera son un solo toque.
  const [lugar, setLugar] = useState<LibretaEntry | null>(null);
  const [clientes, setClientes] = useState<LibretaEntry[]>([]);
  const [opciones, setOpciones] = useState<LibretaEntry[] | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>(UNIDAD.KILOS);
  const [remito, setRemito] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ tipo: LIBRETA_TIPO.DESTINATARIO });
    if (providerId != null) p.set("provider", String(providerId));
    api
      .get<LibretaEntry[]>(`/libreta?${p}`)
      .then(setOpciones)
      .catch(() => setOpciones([]));
  }, [providerId]);

  const toggleCliente = (e: LibretaEntry) =>
    setClientes((prev) =>
      prev.some((c) => c.id === e.id) ? prev.filter((c) => c.id !== e.id) : [...prev, e],
    );

  async function guardar() {
    if (!lugar) return setError("Elegí dónde cargaste.");
    setError("");
    setBusy(true);
    try {
      await api.post(`/trips/${tripId}/segments`, {
        segments: [
          {
            remitente: lugar.nombre,
            remitente_id: lugar.id,
            clientes: clientes.map((c) => c.nombre),
            cliente_ids: clientes.map((c) => c.id),
            cantidad: cantidad ? Number(cantidad) : null,
            unidad: cantidad ? unidad : null,
            remito: remito.trim() || null,
          },
        ],
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la carga");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-2 space-y-4">
      <h3 className="font-cond text-xl font-semibold text-ink">Agregar carga</h3>

      <LibretaPicker
        tipo={LIBRETA_TIPO.REMITENTE}
        label="¿Dónde cargaste?"
        value={lugar}
        onChange={setLugar}
        providerId={providerId}
        soloSeleccionables
      />

      <div>
        <span className="label">¿Para quién?</span>
        {opciones === null ? (
          <Spinner size={18} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {opciones.map((o) => {
              const on = clientes.some((c) => c.id === o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleCliente(o)}
                  className={`border px-3 py-2 text-sm ${
                    on ? "border-brand bg-brand font-semibold text-bg" : "border-ink/20 bg-bg text-ink/75"
                  }`}
                >
                  {o.nombre} {on && "✓"}
                </button>
              );
            })}
          </div>
        )}
        {ultimoLugar && <p className="mt-1 text-xs text-ink/45">Podés marcar más de uno.</p>}
      </div>

      <div>
        <span className="label">Cantidad</span>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="number"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej: 15000"
          />
          <div className="flex flex-none border border-ink/25">
            {[UNIDAD.KILOS, UNIDAD.PALLETS].map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnidad(u)}
                className={`px-3 font-cond text-sm font-semibold capitalize ${
                  unidad === u ? "bg-navy text-bg" : "bg-bg text-ink/45"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Field label="N° de remito (opcional)">
        <input className="input" value={remito} onChange={(e) => setRemito(e.target.value)} />
      </Field>

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button loading={busy} onClick={guardar} className="flex-1 py-3">
          Guardar carga
        </Button>
        <Button variant="ghost" onClick={onCancel} className="py-3">
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
