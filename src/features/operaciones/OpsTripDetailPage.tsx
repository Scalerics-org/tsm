import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  TRIP_STATUS,
  destinoVisible,
  origenVisible,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError, mensajeDe } from "../../lib/api";
import { Button, Card, ErrorDeCarga, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { fmtKilos } from "@shared/domain";
import { AgregarCargaOficina } from "./AgregarCargaOficina";
import { CargasDelViaje } from "./CargasDelViaje";
import { DescargasDelViaje } from "./DescargasDelViaje";
import { EditarCabecera } from "./EditarCabecera";
import { FechaInput } from "../../components/FechaInput";
import { useSoloMirar } from "../../lib/auth";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
  /** En estas plantillas el recorrido lo arman las cargas y no se corrige acá. */
  renglon_pide_ubicacion: boolean;
  /** Del que salen los lugares de carga propios del viaje (los de Mdeo - BU, por ejemplo). */
  provider_id: number | null;
}

export function OpsTripDetailPage() {
  const soloMirar = useSoloMirar();
  const { id } = useParams();
  const navigate = useNavigate();
  // Volver a la lista con los filtros con los que se entró (los manda `FilaViaje`).
  const filtrosDeLaLista = (useLocation().state as { viajes?: string } | null)?.viajes ?? "";
  const aLaLista = `/panel/viajes${filtrosDeLaLista}`;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  // Con `?editar=1` la ficha abre directo en la corrección: es como llega desde el botón
  // "Corregir" de la lista, para que no haya que buscarlo otra vez acá adentro.
  const [params, setParams] = useSearchParams();
  // El `?editar=1` viaja en la dirección: a un "solo mirar" que abra ese link —o que vuelva
  // atrás a uno guardado— se le abría igual el formulario de corrección. Acá nunca.
  const [editando, setEditando] = useState(params.get("editar") === "1" && !soloMirar);
  // Se saca `?editar=1` al salir: si no, recargar la página volvía a abrir la corrección.
  // `state` se conserva para que "← Viajes" siga volviendo con los filtros.
  const location = useLocation();
  const salirDeEdicion = () => {
    setEditando(false);
    if (params.has("editar")) setParams({}, { replace: true, state: location.state });
  };
  // Lo que el backend devuelve después de guardar: no son errores, son las consecuencias que
  // la oficina tiene que mirar —los km que quedaron de un recorrido que ya no es ése—.
  const [avisos, setAvisos] = useState<string[]>([]);

  // Dos errores distintos, a propósito. Antes eran el mismo, y como la pantalla arrancaba con
  // `if (error) return <ErrorText/>`, un rechazo al cancelar o al corregir la fecha —el
  // servidor frena el viaje ya facturado, por ejemplo— se llevaba puesta la ficha entera y
  // dejaba una línea roja sola, sin viaje, sin fotos y sin botón para volver a intentar.
  const [cargaFalló, setCargaFalló] = useState<string | null>(null);
  const load = useCallback(() => {
    setCargaFalló(null);
    api
      .get<Detail>(`/trips/${id}`)
      .then(setData)
      .catch((e) => setCargaFalló(mensajeDe(e, "Error al cargar")));
  }, [id]);
  useEffect(load, [load]);

  if (!data) {
    return cargaFalló ? (
      <ErrorDeCarga titulo="No se pudo cargar el viaje." mensaje={cargaFalló} onReintentar={load} />
    ) : (
      <Spinner size={28} />
    );
  }
  const { trip, photos } = data;
  const fields = trip.fields ?? [];

  async function cancel() {
    if (!confirm("¿Cancelar este viaje?")) return;
    try {
      await api.post(`/trips/${trip.id}/cancel`, {});
      load();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo cancelar el viaje"));
    }
  }

  /**
   * Borrar el viaje entero. "Borrar viajes o agregar viajes desde oficina, para posibles
   * correcciones."
   *
   * La confirmación dice cuántas cargas se lleva porque cada una es una unidad facturable:
   * un "¿Seguro?" pelado no deja ver que se están tirando tres renglones cobrables. Cancelar
   * sigue siendo la opción blanda — el viaje queda, marcado, y no desaparece del historial.
   */
  async function eliminar() {
    const cargas = trip.segments.length;
    const detalle = cargas
      ? `Se van a borrar también sus ${cargas} carga${cargas === 1 ? "" : "s"} y sus fotos, que ya no van a aparecer en el Excel de facturación.`
      : "El viaje no tiene cargas registradas.";
    // Un viaje en curso lo tiene abierto un chofer en el celular. Si se borra, lo que venía
    // cargando se pierde y la app le va a fallar contra un viaje que ya no existe.
    const enCurso =
      trip.status === TRIP_STATUS.EN_CURSO
        ? `

OJO: este viaje está EN CURSO. ${trip.driver_name ?? "El chofer"} lo tiene abierto y va a perder lo que esté cargando.`
        : "";
    if (!confirm(`¿Borrar el viaje ${origenVisible(trip)} → ${destinoVisible(trip)} del ${fmtDateTime(trip.started_at)}?\n\n${detalle}${enCurso}\n\nEsto no se puede deshacer. Si solo querés dejarlo sin efecto, usá Cancelar.`)) {
      return;
    }
    setBorrando(true);
    try {
      await api.del(`/trips/${trip.id}`);
      navigate(aLaLista);
    } catch (e) {
      setError(mensajeDe(e, "No se pudo borrar el viaje"));
      setBorrando(false);
    }
  }

  /**
   * Corregir la fecha del viaje. "Si quiere ingresar un viaje pasado, no puede ahora."
   *
   * Se manda sólo el día: el viaje se corre entero, salida y llegada juntas, así uno que
   * duró dos días sigue durando dos días. Esa cuenta la hace el backend.
   */
  async function cambiarFecha(fecha: string) {
    setError("");
    setGuardandoFecha(true);
    try {
      await api.patch(`/trips/${trip.id}/fecha`, { fecha });
      load();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo cambiar la fecha"));
    } finally {
      setGuardandoFecha(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to={aLaLista} className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>

      {/* Lo que falló al cancelar, borrar o corregir: se lee acá arriba y la ficha sigue. */}
      <ErrorText>{error}</ErrorText>
      {cargaFalló && (
        <ErrorDeCarga
          titulo="No se pudo actualizar el viaje: lo de abajo puede estar viejo."
          mensaje={cargaFalló}
          onReintentar={load}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* El número del mes junto al proveedor: es así como se nombra un viaje por
              teléfono. El `id`, que no se mueve nunca, sigue en la URL y en la primera
              columna del Excel. */}
          <div className="kicker">
            {trip.numero_mes != null && `Viaje N° ${trip.numero_mes} · `}
            {trip.provider_name}
          </div>
          <h1 className="text-2xl text-ink">
            {origenVisible(trip)} → {destinoVisible(trip)}
            {trip.destinatario ? ` (${trip.destinatario})` : ""}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.driver_name} · 🚛 {trip.truck_plate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={trip.status} />
          {/* Corregir, Cancelar y Borrar: los tres escriben. Para el "solo mirar" no existen,
              y la ficha le queda con el estado del viaje y nada más. */}
          {!soloMirar && (
            <>
              {!editando && (
                <Button variant="secondary" onClick={() => setEditando(true)}>
                  Corregir
                </Button>
              )}
              {trip.status === TRIP_STATUS.EN_CURSO && (
                <Button variant="ghost" onClick={cancel}>
                  Cancelar
                </Button>
              )}
              <Button variant="danger" onClick={eliminar} loading={borrando}>
                Borrar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Los avisos del guardado. Se quedan hasta que la oficina los cierre: son justo lo que
          no hay que perderse de vista, y un cartel que se va solo no lo lee nadie. */}
      {avisos.length > 0 && (
        <div className="border-l-4 border-st-amberBd bg-st-amberBg p-3 text-sm text-ink/80">
          <div className="flex items-start justify-between gap-3">
            <ul className="space-y-1">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setAvisos([])}
              className="flex-none text-xs text-ink/60 hover:underline"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {editando ? (
        <EditarCabecera
          trip={trip}
          recorridoPorCargas={data.renglon_pide_ubicacion}
          onGuardado={(nuevos) => {
            salirDeEdicion();
            setAvisos(nuevos);
            load();
          }}
          onCancelar={salirDeEdicion}
        />
      ) : (
      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {trip.remite && <Info label="Remite" value={trip.remite} />}
          <Info label="Carga" value={trip.cargo_type || "—"} />
          <Info label="Kilos" value={fmtKilos(trip.kilos_carga)} />
          {fields
            .filter((f) => !f.is_weight)
            .map((f) => (
              <Info key={f.key} label={f.label} value={trip.field_values[f.key] || "—"} />
            ))}
          {/* La salida se corrige en el mismo lugar donde se lee: para el lector vuelve a
              ser lo que dice que es, una fecha. */}
          {soloMirar ? (
            <Info label="Salida" value={fmtDateTime(trip.started_at)} />
          ) : (
            <FechaDelViaje
              valor={trip.started_at}
              guardando={guardandoFecha}
              onCambiar={cambiarFecha}
            />
          )}
          <LlegadaDelViaje trip={trip} onGuardada={load} soloMirar={soloMirar} />
        </div>
        {trip.notes && (
          <div className="mt-3 border-l-4 border-brand bg-surface p-3 text-sm text-ink/80">
            <span className="font-semibold">Observaciones:</span> {trip.notes}
          </div>
        )}
        {/* El rastro de la corrección se guarda desde la migración 0013 y no se mostraba en
            ninguna pantalla. Importa: cambiar el camión o los km de un viaje cerrado mueve la
            auditoría de kilómetros de dos camiones, y alguien va a preguntar por qué. */}
        {trip.edited_at && (
          <p className="mt-3 text-xs text-ink/50">
            Corregido por {trip.edited_by_name ?? "la oficina"} el {fmtDateTime(trip.edited_at)}
          </p>
        )}
      </Card>
      )}

      <CargasDelViaje
        tripId={trip.id}
        segments={trip.segments}
        photos={photos}
        onChanged={load}
        editarLugares={data.renglon_pide_ubicacion}
      />
      {data.renglon_pide_ubicacion && <DescargasDelViaje trip={trip} photos={photos} />}
      {/* Un viaje cancelado no se factura: agregarle cargas no tiene sentido. */}
      {trip.status !== TRIP_STATUS.CANCELADO && !soloMirar && (
        <AgregarCargaOficina
          tripId={trip.id}
          providerId={data.provider_id}
          segments={trip.segments}
          pideUbicacion={data.renglon_pide_ubicacion}
          onAgregada={load}
        />
      )}
    </div>
  );
}

/**
 * La fecha del viaje, editable en el lugar donde ya se leía.
 *
 * Es un input de fecha y no un formulario aparte a propósito: la oficina llega acá a mirar el
 * viaje y corrige la fecha donde la ve mal, sin buscar un botón de "editar". La hora no se
 * toca —nadie la corrige— y por eso abajo se muestra completa, para que se note que el viaje
 * se corre entero y no se le planta el día a las 00:00.
 */
function FechaDelViaje({
  valor,
  guardando,
  onCambiar,
}: {
  valor: string;
  guardando: boolean;
  onCambiar: (fecha: string) => void;
}) {
  const dia = valor.slice(0, 10);
  const [borrador, setBorrador] = useState(dia);
  useEffect(() => setBorrador(dia), [dia]);

  // Igual que en la lista: un input de fecha entrega fechas enteras y equivocadas mientras
  // se tipea, así que se guarda al salir del campo, no en cada tecla.
  function guardar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(borrador) || borrador === dia) return setBorrador(dia);
    onCambiar(borrador);
  }

  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        Salida
      </div>
      <FechaInput
        className="input mt-0.5 py-1 text-sm"
        value={borrador}
        disabled={guardando}
        onChange={setBorrador}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setBorrador(dia);
        }}
      />
      <div className="mt-0.5 text-xs text-ink/45">{fmtDateTime(valor)}</div>
    </div>
  );
}

/**
 * La llegada del viaje, corregible.
 *
 * El cierre graba la hora en que el chofer toca "confirmar llegada". Si se olvida y lo cierra
 * días después, el viaje queda de varios días —el 48 y el 94 ya figuran así— y la oficina no
 * tenía cómo arreglarlo: cambiar la fecha corre salida y llegada juntas. Acá se corrige sólo
 * la llegada.
 *
 * Se tipea en hora de acá y viaja en UTC, que es como se guarda: `new Date("AAAA-MM-DDTHH:MM")`
 * es hora LOCAL y `toISOString()` la pasa a UTC. El servidor rechaza cualquier fecha sin zona.
 *
 * Tiene su propio error a propósito: el de la página reemplaza la ficha entera por una línea
 * roja, y un fallo acá no puede hacer desaparecer el viaje que se está mirando.
 */
function LlegadaDelViaje({
  trip,
  onGuardada,
  soloMirar,
}: {
  trip: Trip;
  onGuardada: () => void;
  /** Por prop y no con el hook: el componente vive en este mismo archivo, que ya lo preguntó
      una vez, y dos lecturas del mismo dato son dos cosas que se pueden desincronizar. */
  soloMirar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  if (!trip.finished_at) return <Info label="Llegada" value="—" />;
  const llegada = new Date(trip.finished_at.replace(" ", "T") + "Z");
  const salida = new Date(trip.started_at.replace(" ", "T") + "Z");
  const dias = (llegada.getTime() - salida.getTime()) / 86_400_000;

  function abrir() {
    const dos = (n: number) => String(n).padStart(2, "0");
    setDia(`${llegada.getFullYear()}-${dos(llegada.getMonth() + 1)}-${dos(llegada.getDate())}`);
    setHora(`${dos(llegada.getHours())}:${dos(llegada.getMinutes())}`);
    setError("");
    setAbierto(true);
  }

  async function guardar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return setError("Poné el día y la hora.");
    setGuardando(true);
    setError("");
    try {
      await api.patch(`/trips/${trip.id}/llegada`, { llegada: new Date(`${dia}T${hora}`).toISOString() });
      setAbierto(false);
      onGuardada();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo corregir la llegada");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">Llegada</div>
      {!abierto ? (
        <>
          <div className="font-medium text-ink">{fmtDateTime(trip.finished_at)}</div>
          {trip.status === TRIP_STATUS.COMPLETADO && !soloMirar && (
            <button type="button" onClick={abrir} className="text-xs text-brand-700 hover:underline">
              Corregir
            </button>
          )}
          {/* Un viaje de más de dos días casi siempre es uno que el chofer se olvidó de cerrar. */}
          {dias > 2 && (
            <div className="mt-0.5 text-xs text-st-amberTx">
              {/* El aviso lo ve igual: es un dato del viaje. Lo que no le decimos al lector
                  es "corregí", porque no puede y no es su trabajo. */}
              Figura de {Math.round(dias)} días.
              {!soloMirar && " Si el chofer se olvidó de cerrarlo, corregí la llegada."}
            </div>
          )}
        </>
      ) : (
        <div className="mt-0.5 space-y-1">
          <div className="flex flex-wrap gap-1">
            <FechaInput className="input w-36 py-1 text-sm" value={dia} onChange={setDia} disabled={guardando} />
            <input
              className="input w-24 py-1 text-sm"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              disabled={guardando}
              aria-label="Hora de llegada"
            />
          </div>
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={guardar} disabled={guardando} className="text-brand-700 hover:underline">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="text-ink/50 hover:underline">
              Cancelar
            </button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50">
        {label}
      </div>
      <div className="font-medium text-ink">{value}</div>
    </div>
  );
}
