import { useEffect, useState } from "react";
import { DRIVER_STATUS, type Driver } from "@shared/domain";
import { api } from "../../lib/api";
import { Button, Card, Field, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";

const EMPTY: Omit<Driver, "id"> = {
  name: "",
  document: "",
  license_number: "",
  license_category: "",
  license_expiry: "",
  phone: "",
  status: DRIVER_STATUS.ACTIVO,
};

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [editing, setEditing] = useState<Driver | "new" | null>(null);

  function load() {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
  }
  useEffect(load, []);

  async function remove(id: number) {
    if (!confirm("¿Eliminar este chofer?")) return;
    await api.del(`/drivers/${id}`);
    load();
  }

  if (!drivers) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Choferes</h1>
        <Button onClick={() => setEditing("new")}>+ Nuevo chofer</Button>
      </div>

      {editing && (
        <DriverForm
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
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-slate-400">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Licencia</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-b border-white/5">
                <td className="px-4 py-3 font-medium text-white">{d.name}</td>
                <td className="px-4 py-3 text-slate-300">{d.document}</td>
                <td className="px-4 py-3 text-slate-300">
                  {d.license_number} {d.license_category && `(${d.license_category})`}
                </td>
                <td className="px-4 py-3 text-slate-400">{fmtDate(d.license_expiry)}</td>
                <td className="px-4 py-3">
                  <span className={d.status === DRIVER_STATUS.ACTIVO ? "text-emerald-300" : "text-slate-500"}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-3 text-brand-300 hover:underline" onClick={() => setEditing(d)}>
                    Editar
                  </button>
                  <button className="text-red-300 hover:underline" onClick={() => remove(d.id)}>
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

function DriverForm({
  initial,
  id,
  onClose,
  onSaved,
}: {
  initial: Omit<Driver, "id">;
  id: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (id) await api.put(`/drivers/${id}`, f);
      else await api.post("/drivers", f);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellido">
          <input className="input" value={f.name} onChange={set("name")} required />
        </Field>
        <Field label="Documento / cédula">
          <input className="input" value={f.document} onChange={set("document")} required />
        </Field>
        <Field label="N° de licencia">
          <input className="input" value={f.license_number} onChange={set("license_number")} />
        </Field>
        <Field label="Categoría">
          <input className="input" value={f.license_category} onChange={set("license_category")} placeholder="C, D…" />
        </Field>
        <Field label="Vencimiento licencia">
          <input type="date" className="input" value={f.license_expiry} onChange={set("license_expiry")} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Estado">
          <select className="input" value={f.status} onChange={set("status")}>
            <option value={DRIVER_STATUS.ACTIVO}>Activo</option>
            <option value={DRIVER_STATUS.INACTIVO}>Inactivo</option>
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
