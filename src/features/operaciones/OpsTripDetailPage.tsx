import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  TRIP_STATUS,
  type TemplateField,
  type Trip,
  type TripPhoto,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { fmtKilos } from "@shared/domain";
import { CargasDelViaje } from "./CargasDelViaje";
import { EditarCabecera } from "./EditarCabecera";

interface Detail {
  trip: Trip & { fields?: TemplateField[] };
  photos: TripPhoto[];
  /** En estas plantillas el recorrido lo arman las cargas y no se corrige acá. */
  renglon_pide_ubicacion: boolean;
}

export function OpsTripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  // Con `?editar=1` la ficha abre directo en la corrección: es como llega desde el botón
  // "Corregir" de la lista, para que no haya que buscarlo otra vez acá adentro.
  const [params] = useSearchParams();
  const [editando, setEditando] = useState(params.get("editar") === "1");
  // Lo que el backend devuelve después de guardar: no son errores, son las consecuencias que
  // la oficina tiene que mirar —los km que quedaron de un recorrido que ya no es ése—.
  const [avisos, setAvisos] = useState<string[]>([]);

  const load = useCallback(() => {
    api
      .get<Detail>(`/trips/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Error al cargar"));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner size={28} />;
  const { trip, photos } = data;
  const fields = trip.fields ?? [];

  async function cancel() {
    if (!confirm("¿Cancelar este viaje?")) return;
    try {
      await api.post(`/trips/${trip.id}/cancel`, {});
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cancelar el viaje");
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
    if (!confirm(`¿Borrar el viaje ${trip.origin} → ${trip.destination} del ${fmtDateTime(trip.started_at)}?\n\n${detalle}${enCurso}\n\nEsto no se puede deshacer. Si solo querés dejarlo sin efecto, usá Cancelar.`)) {
      return;
    }
    setBorrando(true);
    try {
      await api.del(`/trips/${trip.id}`);
      navigate("/panel/viajes");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar el viaje");
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
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar la fecha");
    } finally {
      setGuardandoFecha(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/panel/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>

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
            {trip.origin} → {trip.destination}
            {trip.destinatario ? ` (${trip.destinatario})` : ""}
          </h1>
          <p className="text-sm text-ink/60">
            {trip.driver_name} · 🚛 {trip.truck_plate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={trip.status} />
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
            setEditando(false);
            setAvisos(nuevos);
            load();
          }}
          onCancelar={() => setEditando(false)}
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
          <FechaDelViaje
            valor={trip.started_at}
            guardando={guardandoFecha}
            onCambiar={cambiarFecha}
          />
          <Info label="Llegada" value={trip.finished_at ? fmtDateTime(trip.finished_at) : "—"} />
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

      <CargasDelViaje segments={trip.segments} photos={photos} onChanged={load} />
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
      <input
        type="date"
        className="input mt-0.5 py-1 text-sm"
        value={borrador}
        disabled={guardando}
        onChange={(e) => setBorrador(e.target.value)}
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
