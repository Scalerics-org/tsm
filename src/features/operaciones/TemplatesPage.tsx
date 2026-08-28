import { useEffect, useState } from "react";
import {
  CAMPO_MODO,
  FIELD_STAGE,
  FIELD_TYPE,
  LIBRETA_TIPO,
  TIPO_DEPARTAMENTO,
  type CampoModo,
  type CampoUbicacion,
  type CamposUbicacion,
  type DestOption,
  type PickerTipo,
  type Provider,
  type TemplateField,
  type TripTemplate,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ROLES } from "@shared/domain";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";

/** Lo que devuelve /trucks/options: alcanza con la patente para elegir. */
interface TruckOption {
  id: number;
  plate: string;
}

/** Las listas de las que puede elegir el chofer, como se las nombra en la oficina. */
const LISTAS: Record<PickerTipo, string> = {
  [TIPO_DEPARTAMENTO]: "Los 19 departamentos",
  [LIBRETA_TIPO.LUGAR]: "Lugares de la libreta",
  [LIBRETA_TIPO.REMITENTE]: "Remitentes de la libreta",
  [LIBRETA_TIPO.DESTINATARIO]: "Destinatarios de la libreta",
};

/**
 * Cómo se resuelve una punta del viaje, en una línea.
 *
 * Rodrigo terminó con dos plantillas iguales llamadas RECORRIDO VACIO y no había forma de
 * distinguirlas desde la lista: las dos decían " → ". Lo que está configurado tiene que verse.
 */
function punta(campo: CampoUbicacion | undefined, clasico: string): string {
  if (!campo) return clasico || "—";
  if (campo.modo === CAMPO_MODO.FIJO) return campo.valor || clasico || "—";
  if (campo.modo === CAMPO_MODO.TEXTO) return "lo escribe el chofer";
  return `lo elige el chofer · ${LISTAS[(campo.libreta_tipo ?? LIBRETA_TIPO.LUGAR) as PickerTipo]}`;
}

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
                  {punta(t.campos_ubicacion?.origen, t.origin)} →{" "}
                  {punta(
                    t.campos_ubicacion?.destino,
                    [...new Set(t.dest_options.map((o) => o.destino))].join(" · "),
                  )}
                </div>
                <div className="mt-1 text-xs text-ink/50">
                  {t.dest_options.length} destino(s) · {t.fields.length} campo(s)
                  {t.arrival_photo_label ? ` · foto: ${t.arrival_photo_label}` : ""}
                  {t.viaje_vacio ? " · sin carga" : ""}
                  {t.pide_kilometros ? " · pide kilómetros" : ""}
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
    foto_carga_requerida: initial?.foto_carga_requerida ?? true,
    pide_kilometros: initial?.pide_kilometros ?? false,
    viaje_vacio: initial?.viaje_vacio ?? false,
    multi_renglon: initial?.multi_renglon ?? false,
    renglon_pide_ubicacion: initial?.renglon_pide_ubicacion ?? false,
    renglon_pide_departamento: initial?.renglon_pide_departamento ?? false,
    active: initial?.active ?? true,
  });
  const [origen, setOrigen] = useState(aFormulario(initial?.campos_ubicacion?.origen));
  const [destino, setDestino] = useState(aFormulario(initial?.campos_ubicacion?.destino));
  const [dests, setDests] = useState<DestOption[]>(initial?.dest_options ?? [{ destino: "", destinatario: "" }]);
  const [fields, setFields] = useState<TemplateField[]>(
    initial?.fields ?? [{ key: "", label: "", type: FIELD_TYPE.TEXTO, required: false, stage: FIELD_STAGE.CARGA }],
  );
  const [truckIds, setTruckIds] = useState<number[]>(initial?.truck_ids ?? []);
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TruckOption[]>("/trucks/options").then(setTrucks).catch(() => setTrucks([]));
  }, []);

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
      foto_carga_requerida: f.foto_carga_requerida,
      active: f.active,
      dest_options: dests.filter((d) => d.destino.trim()),
      fields: fields.filter((x) => x.label.trim()),
      truck_ids: truckIds,
      pide_kilometros: f.pide_kilometros,
      viaje_vacio: f.viaje_vacio,
      renglon_pide_departamento: f.renglon_pide_departamento,
      campos_ubicacion: armarCampos(initial?.campos_ubicacion ?? null, origen, destino),
      multi_renglon: f.multi_renglon,
      // Sin varias cargas, la ubicación por carga no significa nada: se apaga sola para que
      // no queden plantillas con una combinación imposible.
      renglon_pide_ubicacion: f.multi_renglon && f.renglon_pide_ubicacion,
      renglones_fijos: initial?.renglones_fijos ?? null,
      carga_photo_label: initial?.carga_photo_label ?? null,
    };
    try {
      if (initial) await api.put(`/templates/${initial.id}`, payload);
      else await api.post("/templates", payload);
      onSaved();
    } catch (e) {
      // Sin este catch el error se perdía: la oficina apretaba Guardar, no pasaba nada y
      // tampoco aparecía un mensaje. Un guardado que falla en silencio es peor que uno que
      // falla: el que lo usa se va convencido de que quedó.
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el viaje.");
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
            {/* Deja de ser obligatorio cuando el origen lo resuelve la configuración de abajo:
                en el viaje que va surgiendo, de dónde sale lo elige el chofer. Exigirlo acá
                dejaba esa plantilla imposible de guardar y no se entendía por qué. */}
            <input
              className="input"
              value={f.origin}
              onChange={(e) => setF({ ...f, origin: e.target.value })}
              required={!origen.modo}
            />
            {!!origen.modo && (
              <p className="mt-1 text-xs text-ink/50">Lo resuelve “De dónde sale”: podés dejarlo vacío.</p>
            )}
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
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Casilla
            titulo="Activa (visible para choferes)"
            ayuda="Destildala y deja de aparecer en el celular, pero no se borra."
            checked={f.active}
            onChange={(v) => setF({ ...f, active: v })}
          />
          {/* En los combinados carga en varios lugares: pedir foto por cada uno es documentación
              excesiva y el respaldo pasa a ser el N° de remito del renglón. */}
          <Casilla
            titulo="Exigir foto de la carga para cerrar"
            ayuda="Sin la foto el viaje queda abierto. En los combinados se pide una por cada lugar de carga."
            checked={f.foto_carga_requerida}
            onChange={(v) => setF({ ...f, foto_carga_requerida: v })}
          />
          <Casilla
            titulo="Pedir kilómetros al cerrar"
            ayuda="El chofer anota cuántos kilómetros hizo. Sin eso no puede cerrar el viaje."
            checked={f.pide_kilometros}
            onChange={(v) => setF({ ...f, pide_kilometros: v })}
          />
          {/* "El viaje vacío": el camión que vuelve sin carga. Ojo que vacío acá significa que
              NO LLEVA NADA — si lleva envases de vuelta, no va marcado: es una carga y hay que
              registrarla. */}
          <Casilla
            titulo="Viaje sin carga (vuelta vacía)"
            ayuda="No se piden cargas ni foto de la carga. Si el camión lleva algo de vuelta, no lo marques."
            checked={f.viaje_vacio}
            onChange={(v) => setF({ ...f, viaje_vacio: v })}
          />
          {/* Sólo tiene sentido donde el viaje lleva varias cargas: si el viaje es de una sola,
              el departamento ya es el del viaje y preguntarlo es una pregunta de más. */}
          {/* Las dos casillas que definen un combinado. Faltaban, y por eso el cliente creó
              una plantilla de combinado desde esta pantalla y le quedó como viaje simple:
              armó lo que podía y no tenía con qué terminarla. */}
          <Casilla
            titulo="El viaje lleva varias cargas"
            ayuda="Para los combinados: el chofer va sumando cada carga durante el viaje, y cada una se factura por separado."
            checked={f.multi_renglon}
            onChange={(v) => setF({ ...f, multi_renglon: v })}
          />
          {f.multi_renglon && (
            <Casilla
              titulo="Cada carga elige su propio origen y destino"
              ayuda="El chofer indica en cada carga de qué departamento salió y a cuál va, y escribe el lugar. El recorrido del viaje se arma solo con la primera y la última. Dejalo apagado si el viaje siempre hace el mismo recorrido."
              checked={f.renglon_pide_ubicacion}
              onChange={(v) => setF({ ...f, renglon_pide_ubicacion: v })}
            />
          )}
          {f.multi_renglon && !f.renglon_pide_ubicacion && (
            <Casilla
              titulo="Preguntar el departamento en cada carga"
              ayuda="Para los viajes con origen fijo donde las cargas igual salen de varios lados, como el combinado. La lista de lugares no cambia."
              checked={f.renglon_pide_departamento}
              onChange={(v) => setF({ ...f, renglon_pide_departamento: v })}
            />
          )}
        </div>

        {/* Sin ningún camión marcado la ve toda la flota, que es lo que conviene para los
            viajes de todos los días. Se marcan camiones sólo cuando el viaje es de uno
            puntual, como el Azul con la UAM. */}
        <div>
          <span className="label">¿Qué camiones ven este viaje?</span>
          <div className="flex flex-wrap gap-2">
            {trucks.map((t) => {
              const marcado = truckIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTruckIds((prev) =>
                      marcado ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                    )
                  }
                  className={`border px-3 py-2 text-sm ${
                    marcado ? "border-brand bg-brand font-semibold text-bg" : "border-ink/20 bg-bg text-ink/75"
                  }`}
                >
                  {t.plate} {marcado && "✓"}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-ink/50">
            {truckIds.length === 0
              ? "Sin marcar ninguno: lo ven todos los camiones."
              : `Sólo ${truckIds.length} camión(es) lo van a ver. Al resto no le aparece.`}
          </p>
        </div>

        {/* "Me ato un poco, estaba medio fijo ese formato... no supe mucho como hacerlo."
            Hasta acá el origen y el destino sólo se podían configurar por migración, y la
            oficina, sin manera de pedir el origen por departamento, terminó escribiendo los
            19 departamentos a mano en la lista de destinos. */}
        <div>
          <div className="mb-2 font-cond text-[13px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            De dónde sale y a dónde va
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ParteUbicacion
              titulo="De dónde sale"
              clasico="Siempre el Origen de arriba"
              campo={origen}
              onChange={setOrigen}
            />
            <ParteUbicacion
              titulo="A dónde va"
              clasico="Los destinos de la lista de abajo"
              campo={destino}
              onChange={setDestino}
            />
          </div>
        </div>

        {/* Destinos + destinatarios. Con el destino configurado arriba, el chofer nunca ve
            esta lista: la pantalla del viaje usa una cosa o la otra. Lo cargado no se borra,
            sigue viajando en el payload por si se vuelve atrás. */}
        {destino.modo ? (
          <div className="text-xs text-ink/50">
            El destino ya lo resuelve “A dónde va”: no hace falta cargar los destinos uno por uno.
            {/* Los que ya estaban quedan guardados y el chofer no los ve, pero no se borran
                solos: acá nadie tira configuración sin que se la pidan. El botón está porque
                si no, sacar los 19 departamentos escritos a mano volvía a depender de nosotros. */}
            {dests.some((d) => d.destino.trim()) && (
              <>
                {" "}
                Quedan {dests.filter((d) => d.destino.trim()).length} guardado(s) sin usar.{" "}
                <button
                  type="button"
                  onClick={() => setDests([])}
                  className="text-brand-700 hover:underline"
                >
                  Quitarlos
                </button>
              </>
            )}
          </div>
        ) : (
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
            {/* Una plantilla sin destinos y sin “A dónde va” se guarda igual, pero el chofer
                abre el viaje, no tiene nada para elegir y no puede salir. Que se vea acá y no
                en el muelle. */}
            {!dests.some((d) => d.destino.trim()) && (
              <p className="mt-1 text-xs text-st-amberTx">
                Sin destinos, el chofer no va a tener a dónde elegir. Poné al menos uno, o
                configurá “A dónde va” acá arriba.
              </p>
            )}
          </div>
        )}

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

        <ErrorText>{error}</ErrorText>

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

// ── Origen y destino configurables desde la oficina ──

/**
 * Igual que CamposUbicacion, pero admitiendo "departamento" como lista.
 *
 * El backend ya lo acepta y es lo que usan el combinado genérico y los internacionales; el
 * chofer lo elige con el mismo selector. El tipo compartido todavía nombra sólo la libreta.
 */
type CampoSalida = Omit<CampoUbicacion, "libreta_tipo"> & { libreta_tipo?: PickerTipo };

/** Lo que edita la pantalla. Aplanado: un solo select decide qué se muestra abajo. */
interface CampoForm {
  modo: "" | CampoModo;
  valor: string;
  label: string;
  libreta_tipo: PickerTipo;
  permite_alta: boolean;
  /** Sin control en pantalla: viaja como vino para no apagar lo que dejó una migración. */
  requerido?: boolean;
}

function aFormulario(c: CampoUbicacion | undefined): CampoForm {
  return {
    modo: c?.modo ?? "",
    valor: c?.valor ?? "",
    label: c?.label ?? "",
    // Por departamento arranca: es justo lo que se pidió y no había forma de configurar.
    libreta_tipo: (c?.libreta_tipo as PickerTipo) ?? TIPO_DEPARTAMENTO,
    permite_alta: c?.permite_alta !== false,
    requerido: c?.requerido,
  };
}

function aCampo(cf: CampoForm): CampoSalida | null {
  if (!cf.modo) return null;
  const base = {
    ...(cf.label.trim() ? { label: cf.label.trim() } : {}),
    ...(cf.requerido === undefined ? {} : { requerido: cf.requerido }),
  };
  if (cf.modo === CAMPO_MODO.FIJO) {
    // Un fijo sin texto no configura nada; el backend lo descarta igual.
    return cf.valor.trim() ? { ...base, modo: CAMPO_MODO.FIJO, valor: cf.valor.trim() } : null;
  }
  if (cf.modo === CAMPO_MODO.LIBRETA) {
    return {
      ...base,
      modo: CAMPO_MODO.LIBRETA,
      libreta_tipo: cf.libreta_tipo,
      permite_alta: cf.permite_alta,
    };
  }
  return { ...base, modo: CAMPO_MODO.TEXTO };
}

/**
 * Arma campos_ubicacion para el payload.
 *
 * El remitente y el destinatario NO tienen control en esta pantalla, así que se copian tal
 * como estaban: el backend guarda lo que llega y borra lo que falta, y sin esto abrir un
 * internacional y apretar Guardar se llevaba puesto el lugar de carga y el de descarga.
 */
function armarCampos(
  previo: CamposUbicacion | null,
  origen: CampoForm,
  destino: CampoForm,
): Record<string, CampoSalida> | null {
  const o = aCampo(origen);
  const d = aCampo(destino);
  const out: Record<string, CampoSalida> = {
    ...(previo?.remitente ? { remitente: previo.remitente } : {}),
    ...(previo?.destinatario ? { destinatario: previo.destinatario } : {}),
    ...(o ? { origen: o } : {}),
    ...(d ? { destino: d } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/** Casilla con la línea que explica qué hace: el que la marca tiene que saber qué prendió. */
function Casilla({
  titulo,
  ayuda,
  checked,
  onChange,
}: {
  titulo: string;
  ayuda: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 flex-none accent-brand"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {titulo}
        <span className="mt-0.5 block text-xs text-ink/50">{ayuda}</span>
      </span>
    </label>
  );
}

/** Una punta del viaje: fija, elegida de una lista, o escrita por el chofer. */
function ParteUbicacion({
  titulo,
  clasico,
  campo,
  onChange,
}: {
  titulo: string;
  clasico: string;
  campo: CampoForm;
  onChange: (c: CampoForm) => void;
}) {
  const set = (cambio: Partial<CampoForm>) => onChange({ ...campo, ...cambio });
  const esLibreta = campo.modo === CAMPO_MODO.LIBRETA;
  return (
    <div className="border border-ink/10 p-3">
      <span className="label">{titulo}</span>
      <select
        className="input"
        value={campo.modo}
        onChange={(e) => set({ modo: e.target.value as CampoForm["modo"] })}
      >
        <option value="">{clasico}</option>
        <option value={CAMPO_MODO.FIJO}>Siempre el mismo (lo pone la oficina)</option>
        <option value={CAMPO_MODO.LIBRETA}>Lo elige el chofer de una lista</option>
        <option value={CAMPO_MODO.TEXTO}>Lo escribe el chofer</option>
      </select>

      {campo.modo === CAMPO_MODO.FIJO && (
        <input
          className="input mt-2"
          placeholder="Ej: Bella Unión"
          value={campo.valor}
          onChange={(e) => set({ valor: e.target.value })}
        />
      )}

      {esLibreta && (
        <select
          className="input mt-2"
          value={campo.libreta_tipo}
          onChange={(e) => set({ libreta_tipo: e.target.value as PickerTipo })}
        >
          {Object.entries(LISTAS).map(([tipo, texto]) => (
            <option key={tipo} value={tipo}>
              {texto}
            </option>
          ))}
        </select>
      )}

      {!!campo.modo && campo.modo !== CAMPO_MODO.FIJO && (
        <input
          className="input mt-2"
          placeholder="Cómo se lo pide al chofer (ej. Departamento de carga)"
          value={campo.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      )}

      {/* Los 19 son lista cerrada: ahí el alta no existe y marcarlo no cambia nada. */}
      {esLibreta && campo.libreta_tipo !== TIPO_DEPARTAMENTO && (
        <label className="mt-2 flex gap-2 text-xs text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 flex-none accent-brand"
            checked={campo.permite_alta}
            onChange={(e) => set({ permite_alta: e.target.checked })}
          />
          El chofer puede agregar uno nuevo si no está en la lista
        </label>
      )}
    </div>
  );
}
