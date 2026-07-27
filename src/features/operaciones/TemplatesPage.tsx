import { useEffect, useState } from "react";
import { EXTRA_TYPE, type ExtraType, type Provider, type TripTemplate } from "@shared/domain";
import { api } from "../../lib/api";
import { Button, Card, Field, Spinner } from "../../components/ui";

export function TemplatesPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);
  const [editing, setEditing] = useState<TripTemplate | "new" | null>(null);
  const [newProvider, setNewProvider] = useState("");

  function load() {
    api.get<Provider[]>("/providers").then(setProviders).catch(() => {});
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, []);

  async function addProvider() {
    if (!newProvider.trim()) return;
    await api.post("/providers", { name: newProvider.trim() });
    setNewProvider("");
    load();
  }

  async function removeTemplate(id: number) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await api.del(`/templates/${id}`);
    load();
  }

  if (!templates) return <Spinner size={28} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="kicker">Precargados</div>
          <h1 className="text-3xl text-ink">Plantillas de viaje</h1>
        </div>
        <Button onClick={() => setEditing("new")} disabled={providers.length === 0}>
          + Nueva plantilla
        </Button>
      </div>

      {/* Proveedores */}
      <Card className="space-y-3">
        <h2 className="font-cond text-lg font-semibold text-ink">Proveedores</h2>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span key={p.id} className="border border-ink/15 bg-surface px-3 py-1 text-sm text-ink">
              {p.name}
            </span>
          ))}
          {providers.length === 0 && <span className="text-sm text-ink/50">Agregá un proveedor primero.</span>}
        </div>
        <div className="flex gap-2">
          <input
            className="input max-w-xs"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            placeholder="Nuevo proveedor"
          />
          <Button variant="secondary" onClick={addProvider}>
            Agregar
          </Button>
        </div>
      </Card>

      {editing && (
        <TemplateForm
          providers={providers}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {/* Plantillas */}
      <div className="space-y-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                  {t.provider_name} {!t.active && "· inactiva"}
                </div>
                <div className="font-cond text-xl font-semibold text-ink">{t.name}</div>
                <div className="mt-1 text-sm text-ink/60">
                  {t.origin} → {t.destinations.join(" · ")}
                </div>
                <div className="mt-1 text-xs text-ink/50">
                  {t.cargo_type}
                  {t.requires_kilos && " · pide kilos"}
                  {t.extra_type !== "none" && ` · pide "${t.extra_label}"`}
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                <button className="text-brand-700 hover:underline" onClick={() => setEditing(t)}>
                  Editar
                </button>
                <button className="text-st-redTx hover:underline" onClick={() => removeTemplate(t.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TemplateForm({
  providers,
  initial,
  onClose,
  onSaved,
}: {
  providers: Provider[];
  initial: TripTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    provider_id: initial?.provider_id ? String(initial.provider_id) : String(providers[0]?.id ?? ""),
    name: initial?.name ?? "",
    origin: initial?.origin ?? "",
    destinations: (initial?.destinations ?? []).join(", "),
    cargo_type: initial?.cargo_type ?? "",
    requires_kilos: initial?.requires_kilos ?? false,
    extra_type: (initial?.extra_type ?? EXTRA_TYPE.NONE) as ExtraType,
    extra_label: initial?.extra_label ?? "",
    extra_required: initial?.extra_required ?? false,
    active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      provider_id: Number(f.provider_id),
      name: f.name,
      origin: f.origin,
      destinations: f.destinations
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      cargo_type: f.cargo_type,
      requires_kilos: f.requires_kilos,
      extra_type: f.extra_type,
      extra_label: f.extra_label,
      extra_required: f.extra_required,
      active: f.active,
    };
    try {
      if (initial) await api.put(`/templates/${initial.id}`, payload);
      else await api.post("/templates", payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor">
          <select className="input" value={f.provider_id} onChange={(e) => setF({ ...f, provider_id: e.target.value })}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre del viaje">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Harina desde molino" />
        </Field>
        <Field label="Origen">
          <input className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} required />
        </Field>
        <Field label="Tipo de carga">
          <input className="input" value={f.cargo_type} onChange={(e) => setF({ ...f, cargo_type: e.target.value })} placeholder="Harina" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Destinos posibles (separados por coma)">
            <input className="input" value={f.destinations} onChange={(e) => setF({ ...f, destinations: e.target.value })} placeholder="Paysandú, Trinidad, Rivera" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={f.requires_kilos} onChange={(e) => setF({ ...f, requires_kilos: e.target.checked })} />
          Pide kilos de carga
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Activa (visible para choferes)
        </label>

        <Field label="Campo extra">
          <select className="input" value={f.extra_type} onChange={(e) => setF({ ...f, extra_type: e.target.value as ExtraType })}>
            <option value={EXTRA_TYPE.NONE}>Ninguno</option>
            <option value={EXTRA_TYPE.TEXTO}>Texto (ej. Número MIC)</option>
            <option value={EXTRA_TYPE.NUMERO}>Número</option>
          </select>
        </Field>
        {f.extra_type !== EXTRA_TYPE.NONE && (
          <>
            <Field label="Etiqueta del campo extra">
              <input className="input" value={f.extra_label} onChange={(e) => setF({ ...f, extra_label: e.target.value })} placeholder="Número MIC" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={f.extra_required} onChange={(e) => setF({ ...f, extra_required: e.target.checked })} />
              El campo extra es obligatorio
            </label>
          </>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={busy}>
            Guardar plantilla
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
