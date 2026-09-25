import { useState } from "react";
import {
  COBRO_TIPO,
  PHOTO_KIND_LABEL,
  UNIDAD,
  type Unidad,
  fotosPorRenglon,
  type PhotoKind,
  type TripPhoto,
  type TripSegment,
} from "@shared/domain";
import { api, ApiError, mensajeDe } from "../../lib/api";
import { Card } from "../../components/ui";
import { PhotoImage } from "../../components/PhotoImage";
import { VisorFotos, type FotoDelVisor } from "../../components/VisorFotos";
import { fmtDateTime } from "../../lib/format";
import { useSoloMirar } from "../../lib/auth";
import { EditarLugaresDeCarga } from "./EditarLugaresDeCarga";

interface Props {
  /** Con el id, cada carga se puede corregir desde acá (cantidad, unidad y remito). */
  tripId?: number;
  segments: TripSegment[];
  photos: TripPhoto[];
  /** Para releer el viaje después de borrar una foto. */
  onChanged: () => void;
  /**
   * El recorrido sale de las cargas (Otros Viajes): acá se corrigen dónde cargó y dónde
   * descargó, porque Corregir el viaje no deja tocar el origen ni el destino.
   */
  editarLugares?: boolean;
}

/**
 * Las cargas del viaje como las ve la oficina: una por lugar de carga, con su foto y a
 * quién se le factura. Es la misma fila que sale en el Excel, pero en pantalla.
 */
export function CargasDelViaje({ tripId, segments, photos, onChanged, editarLugares = false }: Props) {
  // El lector ve las cargas y las fotos enteras; lo que no ve es el "Corregir" de cada carga
  // ni el "Borrar" de cada foto. El visor, que es lo que viene a mirar, queda igual.
  const soloMirar = useSoloMirar();
  const { porCarga, delViaje } = fotosPorRenglon(photos);

  /* Todas las fotos del viaje en una sola lista: con las flechas del visor la oficina las
     recorre de corrido, en vez de cerrar y abrir una por una. El orden es el de la pantalla
     —primero las de cada carga, después las del viaje— para que no se pierda. */
  const todas: FotoDelVisor[] = [
    ...segments.flatMap((s) =>
      (porCarga.get(s.sid) ?? []).map((f) => ({
        r2_key: f.r2_key,
        titulo: `Carga en ${s.remitente}`,
        detalle: fmtDateTime(f.taken_at),
      })),
    ),
    ...delViaje.map((f) => ({
      r2_key: f.r2_key,
      titulo: PHOTO_KIND_LABEL[f.kind as PhotoKind],
      detalle: fmtDateTime(f.taken_at),
    })),
  ];
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const abrir = (r2Key: string) => setAmpliada(todas.findIndex((f) => f.r2_key === r2Key));

  return (
    <div className="space-y-4">
      {segments.length > 0 && (
        <div>
          <div className="mb-2 flex items-end justify-between">
            <h3 className="font-semibold text-ink">Cargas</h3>
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
              {segments.length} {segments.length === 1 ? "renglón" : "renglones"}
            </span>
          </div>

          <div className="space-y-2">
            {segments.map((s, i) => (
              <Card key={s.sid} accent={s.cobro_tipo ? undefined : "amber"} className="space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center border border-ink/20 bg-surface font-cond text-[13px] font-semibold text-ink/60">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="font-cond text-lg font-semibold leading-tight text-ink">
                      {s.remitente} → {s.clientes.join(" · ") || "sin destinatario"}
                    </div>
                    {tripId != null && !soloMirar ? (
                      <CantidadDeCarga tripId={tripId} segments={segments} carga={s} onGuardada={onChanged} />
                    ) : (
                      <div className="mt-0.5 text-xs text-ink/55">
                        {s.cantidad != null ? `${s.cantidad.toLocaleString("es-UY")} ${s.unidad}` : "sin cantidad"}
                        {s.remito && ` · remito ${s.remito}`}
                      </div>
                    )}
                    {editarLugares && tripId != null && !soloMirar && (
                      <EditarLugaresDeCarga tripId={tripId} segments={segments} carga={s} onGuardado={onChanged} />
                    )}
                  </div>

                  {/* La facturación es lo único que la oficina ve y el chofer no. */}
                  <div className="flex-none text-right">
                    {s.cobro_tipo ? (
                      <>
                        <div className="font-cond text-base font-semibold leading-none text-ink">
                          {s.cobro_a}
                        </div>
                        <div
                          className={`text-[10px] uppercase tracking-[0.08em] ${
                            s.cobro_tipo === COBRO_TIPO.CLIENTE ? "text-st-greenTx" : "text-st-blueTx"
                          }`}
                        >
                          {s.cobro_tipo}
                          {s.cobro_manual && " · a mano"}
                        </div>
                      </>
                    ) : (
                      <span className="pill border-st-amberBd bg-st-amberBg text-st-amberTx">
                        <i className="pill-dot bg-st-amberDot" />
                        SIN REGLA
                      </span>
                    )}
                  </div>
                </div>

                <FotosDeCarga
                  fotos={porCarga.get(s.sid) ?? []}
                  lugar={s.remitente}
                  onAmpliar={abrir}
                  onChanged={onChanged}
                  soloMirar={soloMirar}
                />
              </Card>
            ))}
          </div>
        </div>
      )}

      {delViaje.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-ink">
            {segments.length > 0 ? "Otras fotos del viaje" : "Fotos"}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {delViaje.map((p) => (
              <div key={p.id}>
                <PhotoImage
                  r2Key={p.r2_key}
                  alt={PHOTO_KIND_LABEL[p.kind as PhotoKind]}
                  className="h-32 w-full"
                  onAmpliar={() => abrir(p.r2_key)}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink/60">
                  <span className="min-w-0 truncate">
                    {PHOTO_KIND_LABEL[p.kind as PhotoKind]} · {fmtDateTime(p.taken_at)}
                  </span>
                  {!soloMirar && (
                    <BorrarFoto
                      foto={p}
                      que={`la foto de ${PHOTO_KIND_LABEL[p.kind as PhotoKind].toLowerCase()}`}
                      onChanged={onChanged}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {segments.length === 0 && delViaje.length === 0 && (
        <p className="text-sm text-ink/50">Sin cargas ni fotos registradas todavía.</p>
      )}

      {ampliada != null && ampliada >= 0 && (
        <VisorFotos fotos={todas} indice={ampliada} onCerrar={() => setAmpliada(null)} />
      )}
    </div>
  );
}

/**
 * La cantidad de una carga, corregible desde la oficina.
 *
 * "No le pusieron los pallets y no puedo agregar. Modificar sería." — Rodrigo, 17/9, en una
 * ida y vuelta de Manassi: las dos cargas vienen fijas de la plantilla y el chofer las cerró
 * sin cantidad. Se manda la lista entera por `PUT /trips/:id/segments` cambiando sólo ésta,
 * identificada por su `sid`: así no se mueven sus fotos, su cobro a mano ni la marca de fija.
 */
function CantidadDeCarga({
  tripId,
  segments,
  carga,
  onGuardada,
}: {
  tripId: number;
  segments: TripSegment[];
  carga: TripSegment;
  onGuardada: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>(UNIDAD.PALLETS);
  const [remito, setRemito] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const abrir = () => {
    setCantidad(carga.cantidad == null ? "" : String(carga.cantidad));
    setUnidad(carga.unidad ?? UNIDAD.PALLETS);
    setRemito(carga.remito ?? "");
    setError("");
    setAbierto(true);
  };

  async function guardar() {
    setBusy(true);
    setError("");
    try {
      await api.put(`/trips/${tripId}/segments`, {
        segments: segments.map((x) =>
          x.sid === carga.sid
            ? {
                ...x,
                cantidad: cantidad === "" ? null : Number(cantidad),
                unidad: cantidad === "" ? x.unidad : unidad,
                remito: remito.trim() || null,
              }
            : x,
        ),
      });
      setAbierto(false);
      onGuardada();
    } catch (e) {
      // Si el viaje ya está facturado el servidor lo frena y dice cómo seguir.
      setError(mensajeDe(e, "No se pudo corregir la carga"));
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <div className="mt-0.5 text-xs text-ink/55">
        {carga.cantidad != null ? (
          `${carga.cantidad.toLocaleString("es-UY")} ${carga.unidad}`
        ) : (
          <span className="text-st-amberTx">sin cantidad</span>
        )}
        {carga.remito && ` · remito ${carga.remito}`}
        <button type="button" onClick={abrir} className="ml-2 text-brand-700 hover:underline">
          Corregir
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink/60">
          Cantidad
          <input
            className="input mt-0.5 w-28 py-1"
            type="number"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            autoFocus
          />
        </label>
        <label className="text-xs text-ink/60">
          Unidad
          <select className="input mt-0.5 w-28 py-1" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            <option value={UNIDAD.PALLETS}>Pallets</option>
            <option value={UNIDAD.KILOS}>Kilos</option>
          </select>
        </label>
        <label className="text-xs text-ink/60">
          Remito
          <input className="input mt-0.5 w-32 py-1" value={remito} onChange={(e) => setRemito(e.target.value)} />
        </label>
        <button type="button" onClick={guardar} disabled={busy} className="pb-1.5 text-sm text-brand-700 hover:underline disabled:opacity-40">
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="pb-1.5 text-sm text-ink/55 hover:underline">
          Cancelar
        </button>
      </div>
      {error && <div className="text-xs text-st-redTx">{error}</div>}
    </div>
  );
}

function FotosDeCarga({
  fotos,
  lugar,
  onAmpliar,
  onChanged,
  soloMirar,
}: {
  fotos: TripPhoto[];
  lugar: string;
  onAmpliar: (r2Key: string) => void;
  onChanged: () => void;
  /** Por prop: el componente es de este mismo archivo, que ya preguntó por el rol una vez. */
  soloMirar: boolean;
}) {
  if (fotos.length === 0) {
    return <p className="border-t border-ink/10 pt-2 text-xs text-ink/45">Sin foto de esta carga.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-ink/10 pt-3 sm:grid-cols-4">
      {fotos.map((p) => (
        <div key={p.id}>
          <PhotoImage
            r2Key={p.r2_key}
            alt={`Carga en ${lugar}`}
            className="h-28 w-full"
            onAmpliar={() => onAmpliar(p.r2_key)}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink/55">
            <span className="min-w-0 truncate">{fmtDateTime(p.taken_at)}</span>
            {!soloMirar && (
              <BorrarFoto foto={p} que={`la foto de la carga en ${lugar}`} onChanged={onChanged} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Sacar una foto desde la oficina.
 *
 * El backend ya lo permitía desde el primer día, pero el único botón vivía en la pantalla del
 * chofer y sólo con el viaje en curso: una foto movida en un viaje ya cerrado no la podía
 * sacar nadie. Se lleva también el archivo de R2, así que se pregunta antes.
 */
export function BorrarFoto({
  foto,
  que,
  onChanged,
}: {
  foto: TripPhoto;
  que: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    if (busy) return;
    if (!confirm(`¿Borrar ${que}?\n\nNo se puede deshacer: la foto se borra también del archivo.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/photos/${foto.id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={borrar}
        disabled={busy}
        className="flex-none text-st-redTx hover:underline disabled:opacity-40"
      >
        {busy ? "…" : "Borrar"}
      </button>
      {error && <span className="text-st-redTx">{error}</span>}
    </>
  );
}
