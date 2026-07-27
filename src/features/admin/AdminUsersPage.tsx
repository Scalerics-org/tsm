import { useEffect, useState } from "react";
import { ROLES, type AuthUser, type Role } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
import { useAuth } from "../../lib/auth";

const ROLE_LABEL: Record<string, string> = {
  encargado: "Encargado",
  admin: "Administrador",
  chofer: "Chofer",
};

const OFFICE_ROLES: Role[] = [ROLES.ENCARGADO, ROLES.ADMIN];

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[] | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api.get<AuthUser[]>("/users").then(setUsers).catch(() => setUsers([]));
  }
  useEffect(load, []);

  async function remove(id: number) {
    if (!confirm("¿Eliminar este usuario?")) return;
    await api.del(`/users/${id}`);
    load();
  }

  if (!users) return <Spinner size={28} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-ink">Usuarios de oficina</h1>
          <p className="text-sm text-ink/60">Los choferes se gestionan en la sección Choferes (con PIN).</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Nuevo usuario</Button>
      </div>

      {creating && (
        <UserForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-sm">
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

function UserForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: ROLES.ENCARGADO as Role });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/users", { name: f.name, email: f.email, password: f.password, role: f.role });
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
            {OFFICE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
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
