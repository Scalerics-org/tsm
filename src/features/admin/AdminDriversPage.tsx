import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DRIVER_STATUS, type Driver, type Truck } from "@shared/domain";
import { api } from "../../lib/api";
import { Button, Card, Field, Spinner } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { FechaInput } from "../../components/FechaInput";

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [editing, setEditing] = useState<Driver | "new" | null>(null);

  function load() {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
  }
  useEffect(() => {
    load();
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => {});
  }, []);

  async function remove(id: number) {
    if (!confirm("¿Eliminar este chofer?")) return;
    await api.del(`/drivers/${id}`);
    load();
  }

  if (!drivers) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-ink">Choferes</h1>
        <Button onClick={() => setEditing("new")}>+ Nuevo chofer</Button>
      </div>

      {editing && (
        <DriverForm
          trucks={trucks}
          driver={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Camión habitual</th>
              <th className="px-4 py-3">Licencia vence</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-b border-ink/10">
                <td className="px-4 py-3 font-medium text-ink">{d.name}</td>
                <td className="px-4 py-3 text-ink/70">{d.document}</td>
                <td className="px-4 py-3 text-ink/70">{d.default_truck_plate ?? "—"}</td>
                <td className="px-4 py-3 text-ink/60">{fmtDate(d.license_expiry)}</td>
                <td className="px-4 py-3">
                  <span className={d.status === DRIVER_STATUS.ACTIVO ? "text-st-greenTx" : "text-ink/45"}>
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/panel/chofer/${d.id}`} className="mr-3 text-brand-700 hover:underline">
                    Ver
                  </Link>
                  <button className="mr-3 text-brand-700 hover:underline" onClick={() => setEditing(d)}>
                    Editar
                  </button>
                  <button className="text-st-redTx hover:underline" onClick={() => remove(d.id)}>
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
  trucks,
  driver,
  onClose,
  onSaved,
}: {
  trucks: Truck[];
  driver: Driver | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: driver?.name ?? "",
    document: driver?.document ?? "",
    license_number: driver?.license_number ?? "",
    license_category: driver?.license_category ?? "",
    license_expiry: driver?.license_expiry ?? "",
    phone: driver?.phone ?? "",
    status: driver?.status ?? DRIVER_STATUS.ACTIVO,
    default_truck_id: driver?.default_truck_id ? String(driver.default_truck_id) : "",
    pin: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: f.name,
      document: f.document,
      license_number: f.license_number,
      license_category: f.license_category,
      license_expiry: f.license_expiry,
      phone: f.phone,
      status: f.status,
      default_truck_id: f.default_truck_id ? Number(f.default_truck_id) : null,
      pin: f.pin || undefined,
    };
    try {
      if (driver) await api.put(`/drivers/${driver.id}`, payload);
      else await api.post("/drivers", payload);
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
        <Field label="Camión habitual (patente para login)">
          <select className="input" value={f.default_truck_id} onChange={set("default_truck_id")}>
            <option value="">Sin asignar</option>
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.plate} · {t.brand} {t.model}
              </option>
            ))}
          </select>
        </Field>
        <Field label={driver ? "PIN nuevo (dejar vacío para no cambiar)" : "PIN (4+ dígitos)"}>
          <input className="input" type="text" inputMode="numeric" value={f.pin} onChange={set("pin")} placeholder="1234" />
        </Field>
        <Field label="N° de licencia">
          <input className="input" value={f.license_number} onChange={set("license_number")} />
        </Field>
        <Field label="Categoría">
          <input className="input" value={f.license_category} onChange={set("license_category")} placeholder="C, D…" />
        </Field>
        <Field label="Vencimiento licencia">
          <FechaInput value={f.license_expiry} onChange={(iso) => setF({ ...f, license_expiry: iso })} />
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
