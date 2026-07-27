import { useEffect, useState } from "react";
import { TRUCK_STATUS, type Truck, type TruckStatus } from "@shared/domain";
import { api } from "../../lib/api";
import { Button, Card, Field, Spinner } from "../../components/ui";

const EMPTY: Omit<Truck, "id"> = {
  plate: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  type: "",
  capacity_kg: 0,
  odometer_km: 0,
  avg_consumption_l100: 0,
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

  function load() {
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => setTrucks([]));
  }
  useEffect(load, []);

  async function remove(id: number) {
    if (!confirm("¿Eliminar este camión?")) return;
    await api.del(`/trucks/${id}`);
    load();
  }

  if (!trucks) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Camiones</h1>
        <Button onClick={() => setEditing("new")}>+ Nuevo camión</Button>
      </div>

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
          <thead className="text-left text-slate-400">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3">Patente</th>
              <th className="px-4 py-3">Marca / Modelo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Odómetro</th>
              <th className="px-4 py-3 text-right">L/100km</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {trucks.map((t) => (
              <tr key={t.id} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium text-white">{t.plate}</td>
                <td className="px-4 py-3 text-slate-300">
                  {t.brand} {t.model} · {t.year}
                </td>
                <td className="px-4 py-3 text-slate-300">{t.type}</td>
                <td className="px-4 py-3 text-right text-slate-300">{t.odometer_km.toLocaleString("es-UY")} km</td>
                <td className="px-4 py-3 text-right text-slate-300">{t.avg_consumption_l100}</td>
                <td className="px-4 py-3 text-slate-300">{STATUS_LABEL[t.status]}</td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-3 text-brand-300 hover:underline" onClick={() => setEditing(t)}>
                    Editar
                  </button>
                  <button className="text-red-300 hover:underline" onClick={() => remove(t.id)}>
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
  const set = (k: keyof typeof f, num = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (id) await api.put(`/trucks/${id}`, f);
      else await api.post("/trucks", f);
      onSaved();
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
        <Field label="Rendimiento (L/100km)">
          <input type="number" step="0.1" className="input" value={f.avg_consumption_l100} onChange={set("avg_consumption_l100", true)} />
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
