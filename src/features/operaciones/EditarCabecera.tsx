import { useEffect, useState } from "react";
import { TRIP_STATUS, type Driver, type Trip, type Truck } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";

/**
 * Corregir la cabecera de un viaje ya cerrado, desde oficina.
 *
 * "Borrar viajes o agregar viajes desde oficina, para posibles correcciones." El caso del
 * medio es el más común: el viaje está bien salvo un dato —el destino que el chofer eligió de
 * apuro, los kilos mal tipeados, el camión equivocado— y la única salida era borrarlo y
 * cargarlo de nuevo, perdiendo las fotos.
 *
 * SE MANDA SÓLO LO QUE CAMBIÓ. No es una optimización: dos personas mirando el mismo viaje
 * pisarían cada una lo que la otra corrigió si cada guardado mandara el formulario entero.
 * Además es lo que hace que un viaje con un campo ya vacío —en producción hay dos, sin tipo
 * de carga— se pueda corregir sin tener que inventarle un valor al campo que está mal.
 *
 * Lo que NO se toca desde acá está decidido en el backend y la pantalla lo acompaña: el
 * cliente (`provider_name`) no se cambia porque es la clave del resumen de facturación, y las
 * cargas —con su facturación— se corrigen en su propio panel, no acá.
 */

interface Props {
  trip: Trip;
  /** La plantilla arma el recorrido con las cargas: ahí origen y destino no se editan. */
  recorridoPorCargas: boolean;
  onGuardado: (avisos: string[]) => void;
  onCancelar: () => void;
}

/** Lo que el formulario edita, todo como texto: es lo que entregan los inputs. */
interface Formulario {
  origin: string;
  destination: string;
  remite: string;
  destinatario: string;
  cargo_type: string;
  kilos_carga: string;
  kilometros: string;
  notes: string;
  driver_id: string;
  truck_id: string;
}

const delViaje = (t: Trip): Formulario => ({
  origin: t.origin ?? "",
  destination: t.destination ?? "",
  remite: t.remite ?? "",
  destinatario: t.destinatario ?? "",
  cargo_type: t.cargo_type ?? "",
  kilos_carga: t.kilos_carga == null ? "" : String(t.kilos_carga),
  kilometros: t.kilometros == null ? "" : String(t.kilometros),
  notes: t.notes ?? "",
  driver_id: String(t.driver_id),
  truck_id: String(t.truck_id),
});

/** Los campos que el usuario tocó de verdad, con el tipo que espera el backend. */
function loQueCambio(form: Formulario, original: Formulario): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const k of Object.keys(form) as (keyof Formulario)[]) {
    if (form[k] === original[k]) continue;
    if (k === "kilos_carga" || k === "kilometros") {
      cambios[k] = form[k].trim() === "" ? null : Number(form[k]);
    } else if (k === "driver_id" || k === "truck_id") {
      cambios[k] = Number(form[k]);
    } else {
      cambios[k] = form[k];
    }
  }
  return cambios;
}

export function EditarCabecera({ trip, recorridoPorCargas, onGuardado, onCancelar }: Props) {
  const original = delViaje(trip);
  const [form, setForm] = useState<Formulario>(original);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => setTrucks([]));
  }, []);

  const set = (k: keyof Formulario) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const cambios = loQueCambio(form, original);
  const hayCambios = Object.keys(cambios).length > 0;
  // El chofer lo tiene abierto en la ruta: cambiárselo se lo saca de la mano a mitad de
  // camino. El backend lo rechaza igual; acá se muestra por qué antes de que lo intente.
  const enCurso = trip.status === TRIP_STATUS.EN_CURSO;

  async function guardar() {
    if (!hayCambios) return onCancelar();
    setError("");
    setGuardando(true);
    try {
      const guardado = await api.patch<Trip & { avisos?: string[] }>(`/trips/${trip.id}`, cambios);
      onGuardado(guardado?.avisos ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la corrección");
      setGuardando(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-cond text-xl font-semibold text-ink">Corregir el viaje</h2>
        <span className="text-xs text-ink/50">Se guarda sólo lo que cambies.</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Origen">
          <input className="input" value={form.origin} onChange={set("origin")} disabled={recorridoPorCargas} />
        </Field>
        <Field label="Destino">
          <input
            className="input"
            value={form.destination}
            onChange={set("destination")}
            disabled={recorridoPorCargas}
          />
        </Field>
        {recorridoPorCargas && (
          <p className="text-xs text-ink/55 sm:col-span-2">
            En esta plantilla el recorrido sale de las cargas: corregí el lugar en la carga y el
            viaje se acomoda solo.
          </p>
        )}

        <Field label="Remite (dónde se cargó)">
          <input className="input" value={form.remite} onChange={set("remite")} />
        </Field>
        <Field label="Cliente de la carga">
          <input className="input" value={form.destinatario} onChange={set("destinatario")} />
        </Field>

        <Field label="Tipo de carga">
          <input className="input" value={form.cargo_type} onChange={set("cargo_type")} />
        </Field>
        <Field label="Kilos">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={form.kilos_carga}
            onChange={set("kilos_carga")}
            placeholder="Ej: 29000"
          />
        </Field>

        <Field label="Kilómetros del recorrido">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={form.kilometros}
            onChange={set("kilometros")}
          />
        </Field>
        <div />

        <Field label="Chofer">
          <select className="input" value={form.driver_id} onChange={set("driver_id")} disabled={enCurso}>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Camión">
          <select className="input" value={form.truck_id} onChange={set("truck_id")} disabled={enCurso}>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plate}
              </option>
            ))}
          </select>
        </Field>
        {enCurso && (
          <p className="text-xs text-ink/55 sm:col-span-2">
            El viaje está en curso: {trip.driver_name ?? "el chofer"} lo tiene abierto, así que
            el chofer y el camión se cambian recién cuando lo cierre.
          </p>
        )}

        <div className="sm:col-span-2">
          <Field label="Observaciones">
            <textarea className="input min-h-[70px]" value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
      </div>

      {/* Los kilómetros son la lectura del chofer y entran en la auditoría del tacógrafo: si
          se corrige el recorrido, el número viejo deja de corresponder y nadie lo va a mirar
          después. El backend además lo devuelve como aviso al guardar. */}
      {(cambios.origin !== undefined || cambios.destination !== undefined) &&
        cambios.kilometros === undefined && (
          <p className="border-l-4 border-st-amberBd bg-st-amberBg p-3 text-sm text-ink/80">
            Cambiaste el recorrido.{" "}
            {trip.kilometros == null ? (
              <>El viaje no tiene kilómetros cargados</>
            ) : (
              <>
                Los kilómetros quedan en <strong>{trip.kilometros}</strong>
              </>
            )}
            : ese número entra en la auditoría del tacógrafo, así que si ya no corresponde,
            corregilo acá mismo.
          </p>
        )}

      <ErrorText>{error}</ErrorText>

      <div className="flex items-center gap-2">
        <Button onClick={guardar} loading={guardando} disabled={!hayCambios}>
          Guardar cambios
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        {!drivers.length && !trucks.length && <Spinner size={16} />}
      </div>
    </Card>
  );
}
