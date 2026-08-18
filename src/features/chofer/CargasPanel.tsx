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
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
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
            {s.cantidad != null ? (
              <div className="flex-none text-right">
                <div className="font-cond text-base font-semibold leading-none text-ink">
                  {s.cantidad.toLocaleString("es-UY")}
                </div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-ink/45">{s.unidad}</div>
              </div>
            ) : (
              editable && <CompletarCantidad tripId={tripId} seg={s} onDone={onChange} />
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
  onCancel,
  onSaved,
}: {
  tripId: number;
  providerId: number | null;
  pideFoto: boolean;
  pideUbicacion: boolean;
  onCancel: () => void;
  onSaved: (seguirCargando: boolean) => void;
}) {
  // Vienen heredados y sólo se tocan si esta carga fue de otra ciudad o a otro destino.
  const [origen, setOrigen] = useState<LibretaEntry | null>(null);
  const [destino, setDestino] = useState<LibretaEntry | null>(null);
  const [lugarTexto, setLugarTexto] = useState("");
  const [descargaTexto, setDescargaTexto] = useState("");
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
    if (pideUbicacion) {
      // El ocasional: cada renglón se completa entero, sin heredar nada del anterior.
      // Es un viaje puntual y cada parada puede ser de otro departamento.
      if (!origen) return setError("Elegí el departamento donde cargaste.");
      if (!lugarTexto.trim()) return setError("Escribí el lugar de carga.");
      if (!destino) return setError("Elegí el departamento de destino.");
      if (!descargaTexto.trim()) return setError("Escribí dónde descargaste.");
    } else if (!lugar) {
      return setError("Elegí dónde cargaste.");
    }
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
            // En el ocasional el departamento sale de lista y el lugar se escribe: es un
            // viaje puntual, y agendar nombres que se usan una vez ensucia la libreta.
            origen: origen?.nombre ?? null,
            origen_id: null,
            destino: destino?.nombre ?? null,
            destino_id: null,
            remitente: pideUbicacion ? lugarTexto.trim() : lugar!.nombre,
            remitente_id: pideUbicacion ? null : lugar!.id,
            clientes: pideUbicacion ? [descargaTexto.trim()] : clientes.map((c) => c.nombre),
            cliente_ids: pideUbicacion ? [] : clientes.map((c) => c.id),
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

      {/* El ocasional: los cuatro campos, en cada renglón. No se heredan del anterior
          porque cada parada puede ser de otro departamento — es el viaje que abarca todo
          lo que no está precargado. El departamento sale de lista; el lugar se escribe,
          porque son nombres que se usan una vez y no vale la pena agendarlos. */}
      {pideUbicacion ? (
        <>
          <LibretaPicker
            tipo={TIPO_DEPARTAMENTO}
            label="1 · Departamento donde cargaste"
            value={origen}
            onChange={setOrigen}
          />
          <Field label="2 · Lugar de carga">
            <input
              className="input"
              value={lugarTexto}
              onChange={(e) => setLugarTexto(e.target.value)}
              placeholder="Ej: Galpón Bella Unión"
              autoCapitalize="words"
            />
          </Field>
          <LibretaPicker
            tipo={TIPO_DEPARTAMENTO}
            label="3 · Departamento de destino"
            value={destino}
            onChange={setDestino}
          />
          <Field label="4 · Lugar de descarga">
            <input
              className="input"
              value={descargaTexto}
              onChange={(e) => setDescargaTexto(e.target.value)}
              placeholder="Ej: UAM, un depósito, una estancia…"
              autoCapitalize="words"
            />
          </Field>
        </>
      ) : (
        <LibretaPicker
          tipo={LIBRETA_TIPO.REMITENTE}
          label="¿Dónde cargaste?"
          value={lugar}
          onChange={setLugar}
          providerId={providerId}
          soloSeleccionables
        />
      )}

      {/* En el ocasional el destinatario ya se escribió arriba: no hay lista curada que
          ofrecerle, y son clientes que aparecen una vez. */}
      <div className={pideUbicacion ? "hidden" : undefined}>
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

/**
 * Completar la cantidad de una carga que ya venía puesta por la oficina.
 *
 * Es lo único que el chofer toca en los viajes de ida y vuelta: el lugar y el cliente los
 * definió la oficina —de ahí sale el cobro— y a él le queda decir cuántos pallets.
 */
function CompletarCantidad({
  tripId,
  seg,
  onDone,
}: {
  tripId: number;
  seg: TripSegment;
  onDone: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>(seg.unidad ?? UNIDAD.PALLETS);
  const [busy, setBusy] = useState(false);

  async function guardar() {
    if (!cantidad) return;
    setBusy(true);
    try {
      await api.patch(`/trips/${tripId}/segments/${seg.sid}`, { cantidad: Number(cantidad), unidad });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex-none border border-dashed border-brand/50 bg-brand/[.06] px-3 py-2 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-700"
      >
        Poner cantidad
      </button>
    );
  }

  return (
    <div className="flex flex-none items-center gap-1">
      <input
        className="input h-10 w-20 px-2"
        type="number"
        inputMode="decimal"
        autoFocus
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
      />
      <div className="flex flex-none flex-col border border-ink/25">
        {[UNIDAD.PALLETS, UNIDAD.KILOS].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnidad(u)}
            className={`px-2 font-cond text-[11px] font-semibold capitalize ${
              unidad === u ? "bg-navy text-bg" : "bg-bg text-ink/45"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={guardar}
        disabled={busy || !cantidad}
        className="h-10 bg-brand px-3 font-cond text-sm font-semibold text-bg disabled:opacity-50"
      >
        OK
      </button>
    </div>
  );
}
