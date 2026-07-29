import { useEffect, useState } from "react";
import {
  FIELD_STAGE,
  FIELD_TYPE,
  type DestOption,
  type Provider,
  type TemplateField,
  type TripTemplate,
} from "@shared/domain";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ROLES } from "@shared/domain";
import { Button, Card, Field, Spinner } from "../../components/ui";

export function TemplatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
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
  async function renameProvider(p: Provider) {
    const name = prompt("Nuevo nombre del cliente:", p.name);
    if (!name || !name.trim() || name.trim() === p.name) return;
    await api.put(`/providers/${p.id}`, { name: name.trim() });
    load();
  }
  async function removeProvider(p: Provider) {
    const count = (templates ?? []).filter((t) => t.provider_id === p.id).length;
    const msg =
      count > 0
        ? `Al eliminar "${p.name}" se borran también sus ${count} viaje(s) precargado(s). ¿Eliminar?`
        : `¿Eliminar el cliente "${p.name}"?`;
    if (!confirm(msg)) return;
    await api.del(`/providers/${p.id}`);
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

      <Card className="space-y-3">
        <h2 className="font-cond text-lg font-semibold text-ink">Clientes / Proveedores</h2>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 border border-ink/15 bg-surface px-3 py-1 text-sm text-ink"
            >
              {p.name}
              <button
                type="button"
                onClick={() => renameProvider(p)}
                className="text-ink/45 hover:text-brand-700"
                title="Renombrar"
              >
                ✎
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeProvider(p)}
                  className="text-ink/45 hover:text-st-redTx"
                  title="Eliminar cliente"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {providers.length === 0 && <span className="text-sm text-ink/50">Agregá un cliente primero.</span>}
        </div>
        <div className="flex gap-2">
          <input className="input max-w-xs" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} placeholder="Nuevo cliente" />
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
                  {t.origin} → {[...new Set(t.dest_options.map((o) => o.destino))].join(" · ")}
                </div>
                <div className="mt-1 text-xs text-ink/50">
                  {t.dest_options.length} destino(s) · {t.fields.length} campo(s)
                  {t.arrival_photo_label ? ` · foto: ${t.arrival_photo_label}` : ""}
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
    provider_id: String(initial?.provider_id ?? providers[0]?.id ?? ""),
    name: initial?.name ?? "",
    origin: initial?.origin ?? "",
    remite: initial?.remite ?? "",
    cargo_type: initial?.cargo_type ?? "",
    arrival_photo_label: initial?.arrival_photo_label ?? "",
    active: initial?.active ?? true,
  });
  const [dests, setDests] = useState<DestOption[]>(initial?.dest_options ?? [{ destino: "", destinatario: "" }]);
  const [fields, setFields] = useState<TemplateField[]>(
    initial?.fields ?? [{ key: "", label: "", type: FIELD_TYPE.TEXTO, required: false, stage: FIELD_STAGE.CARGA }],
  );
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      provider_id: Number(f.provider_id),
      name: f.name,
      origin: f.origin,
      remite: f.remite || null,
      cargo_type: f.cargo_type,
      arrival_photo_label: f.arrival_photo_label || null,
      active: f.active,
      dest_options: dests.filter((d) => d.destino.trim()),
      fields: fields.filter((x) => x.label.trim()),
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
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente / Proveedor">
            <select className="input" value={f.provider_id} onChange={(e) => setF({ ...f, provider_id: e.target.value })}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre del viaje">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Carga Casarone" />
          </Field>
          <Field label="Origen">
            <input className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} required />
          </Field>
          <Field label="Remite (opcional)">
            <input className="input" value={f.remite} onChange={(e) => setF({ ...f, remite: e.target.value })} placeholder="Ej: Saman" />
          </Field>
          <Field label="Tipo de carga">
            <input className="input" value={f.cargo_type} onChange={(e) => setF({ ...f, cargo_type: e.target.value })} />
          </Field>
          <Field label="Foto que se pide al descargar (opcional)">
            <input className="input" value={f.arrival_photo_label} onChange={(e) => setF({ ...f, arrival_photo_label: e.target.value })} placeholder="Hoja rosada firmada" />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Activa (visible para choferes)
          </label>
        </div>

        {/* Destinos + destinatarios */}
        <div>
          <div className="mb-2 font-cond text-[13px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            Destinos que puede elegir el chofer
          </div>
          <div className="space-y-2">
            {dests.map((d, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" placeholder="Destino (ej. Salto)" value={d.destino} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, destino: e.target.value } : x)))} />
                <input className="input" placeholder="Destinatario (ej. Roig)" value={d.destinatario} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, destinatario: e.target.value } : x)))} />
                <button type="button" onClick={() => setDests(dests.filter((_, j) => j !== i))} className="px-2 text-st-redTx">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDests([...dests, { destino: "", destinatario: "" }])} className="mt-2 text-sm text-brand-700 hover:underline">
            + Agregar destino
          </button>
        </div>

        {/* Campos configurables */}
        <div>
          <div className="mb-2 font-cond text-[13px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            Campos que completa el chofer
          </div>
          <div className="space-y-2">
            {fields.map((fld, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 border border-ink/10 p-2 sm:grid-cols-12">
                <input className="input sm:col-span-4" placeholder="Etiqueta (ej. Remito)" value={fld.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <select className="input sm:col-span-2" value={fld.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as TemplateField["type"] } : x)))}>
                  <option value={FIELD_TYPE.TEXTO}>Texto</option>
                  <option value={FIELD_TYPE.NUMERO}>Número</option>
                </select>
                <select className="input sm:col-span-2" value={fld.stage} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, stage: e.target.value as TemplateField["stage"] } : x)))}>
                  <option value={FIELD_STAGE.CARGA}>En carga</option>
                  <option value={FIELD_STAGE.DESCARGA}>En descarga</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-ink sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4 accent-brand" checked={fld.required} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />
                  Oblig.
                </label>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <label className="flex items-center gap-1 text-xs text-ink">
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={!!fld.is_weight} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, is_weight: e.target.checked } : x)))} />
                    Peso
                  </label>
                  <button type="button" onClick={() => setFields(fields.filter((_, j) => j !== i))} className="ml-auto px-2 text-st-redTx">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFields([...fields, { key: "", label: "", type: FIELD_TYPE.TEXTO, required: false, stage: FIELD_STAGE.CARGA }])}
            className="mt-2 text-sm text-brand-700 hover:underline"
          >
            + Agregar campo
          </button>
          <p className="mt-1 text-xs text-ink/45">
            "Peso" marca el campo de toneladas para los reportes. "En descarga" = se pide al registrar la llegada.
          </p>
        </div>

        <div className="flex gap-2">
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
