import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LIBRETA_ESTADO,
  LIBRETA_TIPO,
  ROLES,
  type CobroRegla,
  type LibretaEntry,
  type LibretaTipo,
  type PendienteCobro,
  type Provider,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, Card, Empty, ErrorText, Spinner, Stat } from "../../components/ui";
import {
  filtrarEntradas,
  nombrePorId,
  ordenarEntradas,
  agruparPendientes,
  type AlcanceFiltro,
} from "../../lib/libreta-view";
import { LibretaEntryRow } from "./LibretaEntryRow";
import { PendientesCobroCard } from "./PendientesCobroCard";

const TABS: { tipo: LibretaTipo; label: string }[] = [
  { tipo: LIBRETA_TIPO.REMITENTE, label: "Remitentes" },
  { tipo: LIBRETA_TIPO.DESTINATARIO, label: "Destinatarios" },
  { tipo: LIBRETA_TIPO.LUGAR, label: "Lugares" },
];

/**
 * Curaduría de la libreta: revisar las altas del chofer, limpiar duplicados y definir
 * las reglas de facturación. Es la pantalla que evita que los reportes se fragmenten.
 */
export function LibretaPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;

  const [entries, setEntries] = useState<LibretaEntry[] | null>(null);
  const [reglas, setReglas] = useState<CobroRegla[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pendientes, setPendientes] = useState<PendienteCobro[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [tipo, setTipo] = useState<LibretaTipo>(LIBRETA_TIPO.REMITENTE);
  const [query, setQuery] = useState("");
  const [alcance, setAlcance] = useState<AlcanceFiltro>("todos");
  const [creando, setCreando] = useState(false);

  const load = useCallback(() => {
    api
      .get<LibretaEntry[]>("/libreta")
      .then(setEntries)
      .catch((e) => {
        setEntries([]);
        setError(e instanceof ApiError ? e.message : "No se pudo cargar la libreta.");
      });
    api.get<CobroRegla[]>("/libreta/reglas/all").then(setReglas).catch(() => setReglas([]));
    api.get<Provider[]>("/providers").then(setProviders).catch(() => setProviders([]));
    api
      .get<PendienteCobro[]>("/reports/pendientes-cobro")
      .then(setPendientes)
      .catch(() => setPendientes([]));
  }, []);
  useEffect(load, [load]);

  const todas = entries ?? [];
  const nombres = useMemo(() => nombrePorId(todas), [todas]);
  const destinatarios = useMemo(
    () => ordenarEntradas(todas.filter((e) => e.tipo === LIBRETA_TIPO.DESTINATARIO)),
    [todas],
  );
  const nuevas = todas.filter((e) => e.estado === LIBRETA_ESTADO.NUEVO).length;
  const combinaciones = useMemo(() => agruparPendientes(pendientes).length, [pendientes]);

  const delTipo = useMemo(() => todas.filter((e) => e.tipo === tipo), [todas, tipo]);
  const visibles = useMemo(
    () => ordenarEntradas(filtrarEntradas(delTipo, { query, alcance })),
    [delTipo, query, alcance],
  );

  const providerName = (id: number | null) => providers.find((p) => p.id === id)?.name ?? null;

  // Una regla nueva también resuelve lo ya cargado: conviene decir cuánto destrabó.
  const reglaCreada = (destrabadas: number) => {
    setAviso(
      destrabadas
        ? `Regla guardada: ${destrabadas} carga(s) que estaban pendientes quedaron asignadas.`
        : "Regla guardada. Se aplica a las cargas que se registren de acá en más.",
    );
    load();
  };

  if (!entries) return <Spinner size={28} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="kicker">Oficina</div>
          <h1 className="text-3xl text-ink">Libreta</h1>
        </div>
        <Button onClick={() => setCreando((c) => !c)}>+ Nueva entrada</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="A revisar"
          value={nuevas}
          hint="altas hechas por choferes"
          accent={nuevas ? "amber" : "green"}
        />
        <Stat
          label="Sin regla de cobro"
          value={combinaciones}
          hint="combinaciones a definir"
          accent={combinaciones ? "amber" : "green"}
        />
        <Stat label="Entradas" value={todas.length} hint={`${reglas.length} regla(s) de cobro`} />
      </div>

      <ErrorText>{error}</ErrorText>

      {aviso && (
        <p className="border-l-4 border-st-greenDot bg-st-greenBg px-3 py-2 text-sm text-st-greenTx">
          {aviso}
        </p>
      )}

      {creando && (
        <NuevaEntradaForm
          tipo={tipo}
          providers={providers}
          onClose={() => setCreando(false)}
          onSaved={() => {
            setCreando(false);
            load();
          }}
        />
      )}

      <PendientesCobroCard
        pendientes={pendientes}
        destinatarios={destinatarios}
        onReglaCreada={reglaCreada}
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const delTab = todas.filter((e) => e.tipo === t.tipo);
            // Lo que hay que revisar no puede quedar escondido detrás de una pestaña.
            const porRevisar = delTab.filter((e) => e.estado === LIBRETA_ESTADO.NUEVO).length;
            const activa = t.tipo === tipo;
            return (
              <button
                key={t.tipo}
                onClick={() => setTipo(t.tipo)}
                className={`flex items-center gap-2 px-3 py-1.5 font-cond text-sm font-semibold uppercase tracking-[0.06em] ${
                  activa ? "bg-navy text-bg" : "text-ink/60 hover:bg-ink/[.06]"
                }`}
              >
                {t.label} ({delTab.length})
                {porRevisar > 0 && (
                  <span className="bg-st-amberDot px-1.5 text-[11px] leading-5 text-bg">
                    {porRevisar}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
          />
          <select
            className="input max-w-xs"
            value={typeof alcance === "number" ? String(alcance) : alcance}
            onChange={(e) => {
              const v = e.target.value;
              setAlcance(v === "todos" || v === "globales" ? v : Number(v));
            }}
          >
            <option value="todos">Todos los clientes</option>
            <option value="globales">Solo globales</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {visibles.length === 0 ? (
        <Empty>No hay entradas que coincidan.</Empty>
      ) : (
        <div className="space-y-3">
          {visibles.map((e) => (
            <LibretaEntryRow
              key={e.id}
              entry={e}
              reglas={reglas}
              destinatarios={destinatarios}
              candidatasFusion={delTipo.filter((o) => o.id !== e.id)}
              nombres={nombres}
              providerName={providerName(e.provider_id)}
              isAdmin={isAdmin}
              onChanged={load}
              onReglaCreada={reglaCreada}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NuevaEntradaForm({
  tipo,
  providers,
  onClose,
  onSaved,
}: {
  tipo: LibretaTipo;
  providers: Provider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ tipo, nombre: "", provider_id: "", agrupador: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/libreta", {
        tipo: f.tipo,
        nombre: f.nombre.trim(),
        provider_id: f.provider_id ? Number(f.provider_id) : null,
        agrupador: f.agrupador,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la entrada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Tipo</span>
            <select
              className="input"
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value as LibretaTipo })}
            >
              {TABS.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Nombre</span>
            <input
              className="input"
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
              placeholder="Ej: Armco"
              required
            />
          </label>
          <label className="block">
            <span className="label">Alcance</span>
            <select
              className="input"
              value={f.provider_id}
              onChange={(e) => setF({ ...f, provider_id: e.target.value })}
            >
              <option value="">Todos los clientes</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {f.tipo !== LIBRETA_TIPO.LUGAR && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={f.agrupador}
              onChange={(e) => setF({ ...f, agrupador: e.target.checked })}
            />
            Agrupador (“Varios”): sirve para nombrar un viaje, no para decir dónde se cargó
          </label>
        )}

        <ErrorText>{error}</ErrorText>

        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            Crear entrada
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
