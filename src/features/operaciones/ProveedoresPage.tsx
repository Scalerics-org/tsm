import { useCallback, useEffect, useState } from "react";
import { ROLES } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Empty, ErrorText, Spinner, Stat } from "../../components/ui";

/**
 * Proveedores: las empresas para las que TSM hace viajes.
 *
 * "Vamos a hacer dos páginas, una de clientes y otra de proveedores." Ésta nunca existió. El
 * backend estaba entero desde el primer día —crear, renombrar, borrar— pero sin pantalla que
 * lo llamara, así que la lista sólo crecía por migraciones y nadie la miraba nunca junta. Por
 * eso convivieron meses "Viaje VACIO" y "Viaje vacío", que son el mismo proveedor escrito de
 * dos formas, y un "Combinados Varios" sin un solo viaje.
 *
 * La palabra importa: acá "proveedor" es para QUIÉN se hace el viaje (Casarone, UAM, Nayna).
 * A quién va la carga son los CLIENTES, y viven en la otra pantalla.
 */
interface ProveedorConUso {
  id: number;
  name: string;
  viajes: number;
  plantillas: number;
}

export function ProveedoresPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;

  const [lista, setLista] = useState<ProveedorConUso[] | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);

  const load = useCallback(() => {
    api
      .get<ProveedorConUso[]>("/providers/uso")
      .then((r) => {
        setLista(r);
        setError("");
      })
      .catch((e) => {
        setLista([]);
        setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista.");
      });
  }, []);
  useEffect(load, [load]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const name = nuevo.trim();
    if (!name) return;
    setCreando(true);
    setError("");
    try {
      await api.post("/providers", { name });
      setNuevo("");
      setAviso(`"${name}" quedó en la lista. Para que el chofer pueda salir necesita además una plantilla.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear.");
    } finally {
      setCreando(false);
    }
  }

  if (!lista) return <Spinner size={28} />;

  const sinUsar = lista.filter((p) => p.viajes === 0 && p.plantillas === 0).length;
  const totalViajes = lista.reduce((s, p) => s + p.viajes, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="kicker">Oficina</div>
        <h1 className="text-3xl text-ink">Proveedores</h1>
        <p className="mt-1 max-w-prose text-sm text-ink/60">
          Para quién hacés los viajes. Es lo que el chofer elige al arrancar. A quién va la
          carga son los clientes, y están en su propia pantalla.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Proveedores" value={lista.length} hint={`${totalViajes} viaje(s) en total`} />
        <Stat
          label="Sin usar"
          value={sinUsar}
          hint="sin viajes ni plantillas"
          accent={sinUsar ? "amber" : "green"}
        />
        <Stat label="Con viajes" value={lista.filter((p) => p.viajes > 0).length} hint="trabajás con ellos" />
      </div>

      <ErrorText>{error}</ErrorText>
      {aviso && (
        <p className="border-l-4 border-st-greenDot bg-st-greenBg px-3 py-2 text-sm text-st-greenTx">
          {aviso}
        </p>
      )}

      <Card>
        <form onSubmit={crear} className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[14rem]">
            <span className="label">Agregar un proveedor</span>
            <input
              className="input"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="Ej: Molino Cañuelas"
            />
          </label>
          <Button type="submit" loading={creando}>
            Agregar
          </Button>
        </form>
      </Card>

      {lista.length === 0 ? (
        <Empty>Todavía no hay proveedores.</Empty>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <FilaProveedor key={p.id} p={p} isAdmin={isAdmin} onChanged={load} onAviso={setAviso} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaProveedor({
  p,
  isAdmin,
  onChanged,
  onAviso,
}: {
  p: ProveedorConUso;
  isAdmin: boolean;
  onChanged: () => void;
  onAviso: (s: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seUsa = p.viajes > 0 || p.plantillas > 0;

  async function guardar() {
    const name = nombre.trim();
    if (!name || name === p.name) return setEditando(false);
    setBusy(true);
    setError("");
    try {
      await api.put(`/providers/${p.id}`, { name });
      // El backend arrastra `trips.provider_name`: sin eso los viajes viejos se quedaban con
      // el nombre anterior y salían del resumen para facturar.
      onAviso(
        p.viajes > 0
          ? `Ahora se llama "${name}". Sus ${p.viajes} viaje(s) pasaron al nombre nuevo.`
          : `Ahora se llama "${name}".`,
      );
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function borrar() {
    if (!confirm(`¿Borrar "${p.name}"? No se puede deshacer.`)) return;
    setBusy(true);
    setError("");
    try {
      await api.del(`/providers/${p.id}`);
      onAviso(`"${p.name}" salió de la lista.`);
      onChanged();
    } catch (e) {
      // El 409 del backend explica qué tiene colgando: se muestra tal cual, es la respuesta.
      setError(e instanceof ApiError ? e.message : "No se pudo borrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[12rem] flex-1">
          {editando ? (
            <input
              className="input max-w-sm"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-label={`Nombre de ${p.name}`}
              autoFocus
            />
          ) : (
            <div className="text-lg text-ink">{p.name}</div>
          )}
          <div className="font-cond text-xs uppercase tracking-[0.06em] text-ink/45">
            <span className="tabular-nums">{p.viajes}</span> viaje{p.viajes === 1 ? "" : "s"} ·{" "}
            <span className="tabular-nums">{p.plantillas}</span> plantilla
            {p.plantillas === 1 ? "" : "s"}
            {!seUsa && <span className="ml-2 text-st-amberTx">nunca se usó</span>}
          </div>
        </div>

        <div className="flex gap-2">
          {editando ? (
            <>
              <Button onClick={guardar} loading={busy}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNombre(p.name);
                  setError("");
                  setEditando(false);
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setEditando(true)}>
                Renombrar
              </Button>
              {/* Borrar es sólo de admin, y el backend igual lo frena si tiene algo colgando:
                  las plantillas se van con el proveedor y el chofer se queda sin poder salir. */}
              {isAdmin && (
                <Button variant="ghost" onClick={borrar} loading={busy} disabled={seUsa}>
                  Borrar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {editando && p.viajes > 0 && (
        <p className="text-xs text-ink/55">
          Sus {p.viajes} viaje(s) pasan al nombre nuevo, así que siguen apareciendo en el
          resumen para facturar.
        </p>
      )}
      {!editando && isAdmin && seUsa && (
        <p className="text-xs text-ink/45">
          No se puede borrar mientras tenga viajes o plantillas: borrarlo se llevaría las
          plantillas puestas.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
