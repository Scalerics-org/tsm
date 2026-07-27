import { useEffect, useState } from "react";
import { ROLES, type AuthUser, type Driver, type Role } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
import { useAuth } from "../../lib/auth";

const ROLE_LABEL: Record<Role, string> = {
  chofer: "Chofer",
  encargado: "Encargado",
  admin: "Administrador",
};

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [creating, setCreating] = useState(false);

  function load() {
    api.get<AuthUser[]>("/users").then(setUsers).catch(() => setUsers([]));
  }
  useEffect(() => {
    load();
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => {});
  }, []);

  async function remove(id: number) {
    if (!confirm("¿Eliminar este usuario?")) return;
    await api.del(`/users/${id}`);
    load();
  }

  if (!users) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Usuarios</h1>
        <Button onClick={() => setCreating(true)}>+ Nuevo usuario</Button>
      </div>

      {creating && (
        <UserForm
          drivers={drivers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink/10">
                <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-4 py-3 text-ink/70">{u.email}</td>
                <td className="px-4 py-3 text-ink/70">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== me?.id && (
                    <button className="text-st-redTx hover:underline" onClick={() => remove(u.id)}>
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function UserForm({
  drivers,
  onClose,
  onSaved,
}: {
  drivers: Driver[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: ROLES.CHOFER as Role, driver_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/users", {
        name: f.name,
        email: f.email,
        password: f.password,
        role: f.role,
        driver_id: f.role === ROLES.CHOFER && f.driver_id ? Number(f.driver_id) : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Email">
          <input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </Field>
        <Field label="Contraseña">
          <input type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} />
        </Field>
        <Field label="Rol">
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.values(ROLES).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {f.role === ROLES.CHOFER && (
          <Field label="Chofer vinculado">
            <select className="input" value={f.driver_id} onChange={(e) => setF({ ...f, driver_id: e.target.value })}>
              <option value="">Sin vincular</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="col-span-full">
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Crear usuario
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
