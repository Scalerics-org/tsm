import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TRUCK_STATUS, fmtConsumo, type Truck, type TruckStatus, type TripTemplate } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Button, Card, ErrorDeCarga, ErrorText, Field, Spinner } from "../../components/ui";

const EMPTY: Omit<Truck, "id"> = {
  plate: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  type: "",
  capacity_kg: 0,
  odometer_km: 0,
  avg_km_litro: 0,
  status: TRUCK_STATUS.DISPONIBLE,
};

const STATUS_LABEL: Record<TruckStatus, string> = {
  disponible: "Disponible",
  en_viaje: "En viaje",
  mantenimiento: "Mantenimiento",
};

export function AdminTrucksPage() {
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [editing, setEditing] = useState<Truck | "new" | null>(null);
  const [falló, setFalló] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    setFalló(null);
    api
      .get<Truck[]>("/trucks")
      .then(setTrucks)
      .catch((e) => setFalló(mensajeDe(e)));
  }
  useEffect(load, []);

  // Un camión con viajes o surtidas no se puede borrar y el servidor dice por qué. Sin el
  // `catch`, se apretaba Eliminar y no pasaba nada.
  async function remove(id: number) {
    if (!confirm("¿Eliminar este camión?")) return;
    setError("");
    try {
      await api.del(`/trucks/${id}`);
      load();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo eliminar."));
    }
  }

  if (!trucks) {
    return falló ? (
      <ErrorDeCarga titulo="No se pudo cargar la lista de camiones." mensaje={falló} onReintentar={load} />
    ) : (
      <Spinner size={28} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Camiones</h1>
        <Button onClick={() => setEditing("new")}>+ Nuevo camión</Button>
      </div>

      {falló && (
        <ErrorDeCarga titulo="No se pudo actualizar la lista: puede estar vieja." mensaje={falló} onReintentar={load} />
      )}
      <ErrorText>{error}</ErrorText>

      {editing && (
        <TruckForm
          initial={editing === "new" ? EMPTY : editing}
          id={editing === "new" ? null : editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-3">Patente</th>
              <th className="px-4 py-3">Marca / Modelo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Odómetro</th>
              <th className="px-4 py-3 text-right">km/L</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((t) => (
              <tr key={t.id} className="border-b border-ink/10">
                {/* La patente entra a la ficha del camión: es lo que uno mira y lo que va a
                    tocar. Choferes enlazaba a su ficha desde el primer día y Camiones se
                    había quedado sin puerta, así que a las surtidas y al tacógrafo de un
                    camión sólo se llegaba desde el Resumen. */}
                <td className="px-4 py-3 font-medium">
                  <Link
                    to={`/panel/camion/${t.id}`}
                    className="text-ink hover:text-brand-700 hover:underline"
                  >
                    {t.plate}
                  </Link>
                  {!!t.camara_frio && <span className="ml-2 text-xs text-ink/50" title="Lleva cámara de frío">❄</span>}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {t.brand} {t.model} · {t.year}
                </td>
                <td className="px-4 py-3 text-ink/70">{t.type}</td>
                <td className="px-4 py-3 text-right text-ink/70">{t.odometer_km.toLocaleString("es-UY")} km</td>
                <td className="px-4 py-3 text-right text-ink/70">{fmtConsumo(t.avg_km_litro)}</td>
                <td className="px-4 py-3 text-ink/70">{STATUS_LABEL[t.status]}</td>
                <td className="px-4 py-3 text-right">
                  {/* Y también en Acciones, igual que en Choferes: es donde se busca. */}
                  <Link to={`/panel/camion/${t.id}`} className="mr-3 text-brand-700 hover:underline">
                    Ver
                  </Link>
                  <button className="mr-3 text-brand-700 hover:underline" onClick={() => setEditing(t)}>
                    Editar
                  </button>
                  <button className="text-st-redTx hover:underline" onClick={() => remove(t.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TruckForm({
  initial,
  id,
  onClose,
  onSaved,
}: {
  initial: Omit<Truck, "id">;
  id: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Los viajes que ve este camión. Vacío = ve lo de siempre (todos los que no son de otro).
  const [plantillas, setPlantillas] = useState<TripTemplate[]>([]);
  const [lista, setLista] = useState<number[]>([]);
  const [soloEstos, setSoloEstos] = useState(false);
  const [listaFalló, setListaFalló] = useState("");
  useEffect(() => {
    api
      .get<TripTemplate[]>("/templates")
      .then(setPlantillas)
      .catch((e) => setListaFalló(mensajeDe(e, "No se pudieron cargar los viajes.")));
    if (id) {
      api
        .get<number[]>(`/trucks/${id}/plantillas`)
        .then((ids) => {
          setLista(ids);
          setSoloEstos(ids.length > 0);
        })
        .catch((e) => setListaFalló(mensajeDe(e, "No se pudo cargar la lista de viajes del camión.")));
    }
  }, [id]);
  const alternar = (tid: number) =>
    setLista((prev) => (prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]));
  const set = (k: keyof typeof f, num = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (soloEstos && lista.length === 0) {
        setBusy(false);
        return setError("Marcá al menos un viaje, o elegí que vea todos.");
      }
      const guardado = id ? await api.put<Truck>(`/trucks/${id}`, f) : await api.post<Truck>("/trucks", f);
      // Si la lista no cargó no se toca: guardarla vacía le cambiaría los viajes sin que nadie lo pidiera.
      if (!listaFalló) {
        await api.put(`/trucks/${guardado.id}/plantillas`, { template_ids: soloEstos ? lista : [] });
      }
      onSaved();
    } catch (err) {
      // Sin esto, un rechazo del servidor dejaba el formulario abierto y quieto, como si el
      // botón no anduviera.
      setError(mensajeDe(err, "No se pudo guardar el camión."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
        <Field label="Patente">
          <input className="input" value={f.plate} onChange={set("plate")} required />
        </Field>
        <Field label="Marca">
          <input className="input" value={f.brand} onChange={set("brand")} />
        </Field>
        <Field label="Modelo">
          <input className="input" value={f.model} onChange={set("model")} />
        </Field>
        <Field label="Año">
          <input type="number" className="input" value={f.year} onChange={set("year", true)} />
        </Field>
        <Field label="Tipo">
          <input className="input" value={f.type} onChange={set("type")} placeholder="Tolva, Tanque…" />
        </Field>
        <Field label="Capacidad (kg)">
          <input type="number" className="input" value={f.capacity_kg} onChange={set("capacity_kg", true)} />
        </Field>
        <Field label="Odómetro (km)">
          <input type="number" className="input" value={f.odometer_km} onChange={set("odometer_km", true)} />
        </Field>
        <Field label="Rendimiento esperado (km/L)">
          <input type="number" step="0.1" className="input" value={f.avg_km_litro} onChange={set("avg_km_litro", true)} />
        </Field>
        <Field label="Estado">
          <select className="input" value={f.status} onChange={set("status")}>
            {Object.values(TRUCK_STATUS).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {/* "El 4383 hace solo eso" (Rodrigo, 16/9): un camión puede tener su propia lista de
            viajes. Sin lista ve lo de siempre. */}
        <div className="col-span-full space-y-2 border border-ink/15 p-3">
          <span className="label">Viajes que ve este camión</span>
          <div className="flex flex-wrap gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="radio" checked={!soloEstos} onChange={() => setSoloEstos(false)} />
              Todos (lo de siempre)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={soloEstos} onChange={() => setSoloEstos(true)} />
              Sólo estos
            </label>
          </div>
          <ErrorText>{listaFalló}</ErrorText>
          {soloEstos && (
            <div className="grid gap-1 sm:grid-cols-2">
              {/* Las inactivas no se ofrecen, salvo que ya estén en la lista: si no, quedaban
                  guardadas sin forma de destildarlas. */}
              {plantillas
                .filter((t) => t.active || lista.includes(t.id))
                .sort((a, b) => (a.provider_name ?? "").localeCompare(b.provider_name ?? "") || a.name.localeCompare(b.name))
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={lista.includes(t.id)} onChange={() => alternar(t.id)} />
                    <span>
                      <span className="text-ink/50">{t.provider_name} · </span>
                      {t.name}
                      {!t.active && <span className="text-st-amberTx"> (desactivada)</span>}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </div>

        {/* Habilita la surtida de la cámara de frío en el celular del chofer, y las horas del
            equipo en la ficha. Si otro camión engancha el furgón, se tilda acá. */}
        <label className="col-span-full flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={!!f.camara_frio}
            onChange={(e) => setF({ ...f, camara_frio: e.target.checked })}
          />
          Lleva cámara de frío
        </label>
        <div className="col-span-full">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="col-span-full flex gap-2">
          <Button type="submit" loading={busy}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
