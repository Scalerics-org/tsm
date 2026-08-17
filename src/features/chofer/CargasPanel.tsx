import { useEffect, useState } from "react";
import {
  LIBRETA_TIPO,
  PHOTO_KIND,
  TIPO_DEPARTAMENTO,
  UNIDAD,
  type LibretaEntry,
  type TripPhoto,
  renglonesSinFoto,
  type TripSegment,
  type Unidad,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";
import { CameraCapture } from "../../components/CameraCapture";
import { compressImage } from "../../lib/image";

interface Props {
  tripId: number;
  providerId: number | null;
  segments: TripSegment[];
  photos: TripPhoto[];
  /** Si cada carga necesita su foto para poder cerrar el viaje. */
  pideFoto: boolean;
  /** Combinado genérico: cada carga lleva su ciudad de carga y su destino. */
  pideUbicacion: boolean;
  /** Origen y destino del viaje: los renglones los heredan. */
  origenViaje: string;
  destinoViaje: string;
  editable: boolean;
  onChange: () => void;
}

/**
 * Cargas del viaje combinado. El chofer registra dónde cargó y para quién, una línea
 * por lugar. No ve nada de facturación: eso lo completan solas las reglas de la libreta.
 */
export function CargasPanel({
  tripId,
  providerId,
  segments,
  photos,
  pideFoto,
  pideUbicacion,
  origenViaje,
  destinoViaje,
  editable,
  onChange,
}: Props) {
  const [agregando, setAgregando] = useState(false);
  const sinFoto = new Set(renglonesSinFoto(segments, photos).map((s) => s.sid));
  // La carga nueva hereda de la anterior; si es la primera, del viaje. Cargar en dos
  // ciudades el mismo viaje es la excepción, así que no se le pregunta a todos.
  const ultima = segments.length ? segments[segments.length - 1] : null;

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
          <div key={s.sid} className="flex items-start gap-3 border border-ink/15 bg-bg p-3">
            <span className="grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-surface font-cond text-[13px] font-semibold text-ink/60">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-cond text-lg font-semibold leading-tight text-ink">{s.remitente}</div>
              {s.clientes.length > 0 && (
                <div className="text-sm text-ink/60">{s.clientes.join(" · ")}</div>
              )}
              {pideUbicacion && (s.origen || s.destino) && (
                <div className="text-xs text-ink/45">
                  {s.origen ?? origenViaje} → {s.destino ?? destinoViaje}
                </div>
              )}
              {pideFoto && sinFoto.has(s.sid) && (
                <div className="text-xs font-semibold text-st-amberTx">Falta la foto</div>
              )}
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
            // Al guardar y seguir, se remonta limpio en vez de conservar lo anterior:
            // en un combinado cada carga es de otro lugar y otro cliente.
            key={segments.length}
            tripId={tripId}
            providerId={providerId}
            pideFoto={pideFoto}
            pideUbicacion={pideUbicacion}
            origenHeredado={ultima?.origen ?? origenViaje}
            destinoHeredado={ultima?.destino ?? destinoViaje}
            onCancel={() => setAgregando(false)}
            onSaved={(seguirCargando) => {
              setAgregando(seguirCargando);
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
  pideFoto,
  pideUbicacion,
  origenHeredado,
  destinoHeredado,
  onCancel,
  onSaved,
}: {
  tripId: number;
  providerId: number | null;
  pideFoto: boolean;
  pideUbicacion: boolean;
  origenHeredado: string;
  destinoHeredado: string;
  onCancel: () => void;
  onSaved: (seguirCargando: boolean) => void;
}) {
  // Vienen heredados y sólo se tocan si esta carga fue de otra ciudad o a otro destino.
  const [origen, setOrigen] = useState<LibretaEntry | null>(null);
  const [destino, setDestino] = useState<LibretaEntry | null>(null);
  const [cambiarUbicacion, setCambiarUbicacion] = useState(false);
  const [lugar, setLugar] = useState<LibretaEntry | null>(null);
  const [clientes, setClientes] = useState<LibretaEntry[]>([]);
  const [opciones, setOpciones] = useState<LibretaEntry[] | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>(UNIDAD.KILOS);
  const [foto, setFoto] = useState<File | null>(null);
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

  async function guardar(seguirCargando: boolean) {
    if (!lugar) return setError("Elegí dónde cargaste.");
    if (pideFoto && !foto) return setError("Sacá la foto de esta carga.");
    setError("");
    setBusy(true);
    try {
      // El sid lo genera el celular para poder subir la foto sin esperar respuesta;
      // el backend lo respeta y garantiza que no choque con otro.
      const sid = crypto.randomUUID();
      await api.post(`/trips/${tripId}/segments`, {
        segments: [
          {
            sid,
            // Sólo viajan si el chofer los cambió: null significa "el del viaje".
            origen: origen?.nombre ?? null,
            origen_id: origen?.id ?? null,
            destino: destino?.nombre ?? null,
            destino_id: destino?.id ?? null,
            remitente: lugar.nombre,
            remitente_id: lugar.id,
            clientes: clientes.map((c) => c.nombre),
            cliente_ids: clientes.map((c) => c.id),
            cantidad: cantidad ? Number(cantidad) : null,
            unidad: cantidad ? unidad : null,
          },
        ],
      });
      if (foto) {
        const fd = new FormData();
        fd.append("file", await compressImage(foto));
        fd.append("trip_id", String(tripId));
        fd.append("kind", PHOTO_KIND.CARGA);
        fd.append("segment_sid", sid);
        await api.upload("/photos", fd);
      }
      onSaved(seguirCargando);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la carga");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-2 space-y-4">
      <h3 className="font-cond text-xl font-semibold text-ink">Agregar carga</h3>

      {/* Ciudad y destino vienen heredados. La mayoría de las cargas de un viaje son del
          mismo tramo, así que se muestran resueltos y sólo se abren si hay que cambiarlos. */}
      {pideUbicacion &&
        (cambiarUbicacion ? (
          <div className="space-y-3 border border-ink/15 bg-bg p-3">
            <LibretaPicker
              tipo={TIPO_DEPARTAMENTO}
              label="Ciudad de carga"
              value={origen}
              onChange={setOrigen}
              placeholder={origenHeredado}
            />
            <LibretaPicker
              tipo={TIPO_DEPARTAMENTO}
              label="Destino"
              value={destino}
              onChange={setDestino}
              placeholder={destinoHeredado}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCambiarUbicacion(true)}
            className="flex w-full items-center justify-between border border-ink/15 bg-bg px-3 py-2 text-left"
          >
            <span className="min-w-0 truncate text-sm text-ink/70">
              {origenHeredado || "—"} → {destinoHeredado || "—"}
            </span>
            <span className="ml-2 flex-none font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-700">
              Cambiar
            </span>
          </button>
        ))}

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
        <p className="mt-1 text-xs text-ink/45">Podés marcar más de uno.</p>
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

      <CameraCapture
        label={pideFoto ? "Foto de esta carga" : "Foto de esta carga (opcional)"}
        onChange={setFoto}
      />

      <ErrorText>{error}</ErrorText>

      {/* Dos salidas: la de siempre y la de seguir cargando. En un combinado el chofer
          registra 3 lugares seguidos, y volver a la lista para tocar "+" cada vez es el
          tipo de fricción por la que se abandona la app. */}
      <div className="space-y-2">
        <Button loading={busy} onClick={() => guardar(true)} className="w-full py-4 text-lg">
          Guardar y cargar otra
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} onClick={() => guardar(false)} className="flex-1 py-3">
            Guardar y listo
          </Button>
          <Button variant="ghost" onClick={onCancel} className="py-3">
            Cancelar
          </Button>
        </div>
      </div>
    </Card>
  );
}
