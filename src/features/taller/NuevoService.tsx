import { createContext, useContext, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Corners } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { MODELOS } from "./base";
import { HOY, MECANICOS, enLaDireccion } from "./datos";
import { useFlota } from "./FlotaReal";
import { posiciones } from "./disposicion";
import type { CubiertaEnStock } from "./datos-extra";
import {
  TIPOS_DEL_EJEMPLO,
  cambiosDeCubiertas,
  claveDeItem,
  guardarService,
  idDeService,
  itemsDeMarcas,
  marcaNueva,
  marcadosEn,
  marcaDeCubierta,
  marcasDeEjemplo,
  marcasSegunTipos,
  seccionesDeService,
  useStock,
  type ItemCatalogo,
  type Marcas,
  type SeccionDeService,
} from "./servicio";
import { Accion, TEXTO_ACCION } from "./TabHistorial";
import { CodigoPill } from "./TabServices";
import type { AccionHecha, TipoService, Vehiculo } from "./tipos";
import { EXPLICACION_OTRO, NOMBRE_OTRO, contenidoDeTipo, descripcionDeTipo, flujoDeCubiertas, tiposDisponibles } from "./tipos-de-service";

const ACCIONES: AccionHecha[] = ["reparado", "nuevo", "revisado"];

/** Lo que el ítem de una cubierta necesita saber: qué hay en el stock, qué posiciones hay y qué modelo tenía cada una. */
interface ContextoDeCubiertas {
  stockNuevas: CubiertaEnStock[];
  posiciones: { numero: number; nombre: string }[];
  modeloActual: (numero: number) => string;
}
const CtxCubiertas = createContext<ContextoDeCubiertas>({ stockNuevas: [], posiciones: [], modeloActual: () => "multi" });

interface Datos {
  fecha: string;
  km: string;
  mecanico: string;
  chofer: string;
}

/**
 * "Nuevo service": Raúl marca lo que hizo, recorriendo las secciones, y en cada ítem carga lo que corresponde.
 * Al guardar, el service tiene SÓLO lo marcado. Son tres pasos: los datos, lo que se hizo y revisar.
 * En la maqueta no se guarda en ninguna base: el service queda mientras la página está abierta.
 */
export function NuevoService({ vehiculo }: { vehiculo: Vehiculo }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paso = Math.min(3, Math.max(1, Number(params.get("paso")) || 1));
  const irA = (p: number) => {
    const sig = new URLSearchParams(params);
    sig.set("paso", String(p));
    setParams(sig, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const secciones = useMemo(() => seccionesDeService(vehiculo), [vehiculo]);
  const stock = useStock();
  const contexto = useMemo<ContextoDeCubiertas>(
    () => ({
      stockNuevas: stock.filter((c) => c.estado === "nueva"),
      posiciones: vehiculo.disposicion ? posiciones(vehiculo.disposicion).map((p) => ({ numero: p.numero, nombre: p.nombre })) : [],
      modeloActual: (numero) => vehiculo.cubiertas.find((c) => c.numero === numero)?.modeloId ?? Object.keys(MODELOS)[0],
    }),
    [stock, vehiculo],
  );
  const [datos, setDatos] = useState<Datos>({
    fecha: HOY,
    km: String(vehiculo.km),
    mecanico: MECANICOS[0],
    chofer: vehiculo.choferAsignado,
  });
  const esDemo = params.get("demo") === "1";
  const [tipos, setTipos] = useState<TipoService[]>(() => (esDemo ? TIPOS_DEL_EJEMPLO.filter((t) => tiposDisponibles(vehiculo).some((d) => d.codigo === t)) : []));
  const [marcas, setMarcas] = useState<Marcas>(() => (esDemo ? marcasDeEjemplo(vehiculo, secciones) : {}));
  const [abierta, setAbierta] = useState<string | null>(params.get("seccion") ?? (esDemo ? "filtros" : secciones[0]?.id ?? null));

  /** Lo que se marca solo al elegir los tipos: sus ítems de filtros y líquidos. Los de cubiertas se marcan a mano, por posición. */
  const cambiarTipos = (nuevos: TipoService[]) => {
    setMarcas((m) => marcasSegunTipos(secciones, tipos, nuevos, m));
    setTipos(nuevos);
    const f = flujoDeCubiertas(nuevos);
    const cubiertas = secciones.find((s) => s.nombre === "Cubiertas");
    if (cubiertas && (f.rotacion || f.nueva) && !flujoDeCubiertas(tipos).rotacion && !flujoDeCubiertas(tipos).nueva) setAbierta(cubiertas.id);
  };
  const catalogo = useMemo(() => {
    const mapa = new Map<string, ItemCatalogo>();
    for (const s of secciones) for (const g of s.grupos) for (const it of g.items) mapa.set(claveDeItem(s.nombre, it), it);
    return mapa;
  }, [secciones]);

  const cambiarDato = (parcial: Partial<Datos>) => setDatos((d) => ({ ...d, ...parcial }));
  const kmNumero = Number(datos.km.replace(",", "."));
  const faltan = [
    tipos.length === 0 && "el tipo de service",
    !datos.fecha && "la fecha",
    !(kmNumero > 0) && (vehiculo.unidad === "h" ? "las horas" : "los km"),
    !datos.mecanico.trim() && "el mecánico",
    !datos.chofer.trim() && (vehiculo.unidad === "h" ? "el operador" : "el chofer"),
  ].filter(Boolean) as string[];

  const items = useMemo(() => itemsDeMarcas(secciones, marcas), [secciones, marcas]);
  const marcadas = items.length;

  const marcar = (clave: string, on: boolean) =>
    setMarcas((m) => {
      const { [clave]: _quitada, ...resto } = m;
      if (!on) return resto;
      const it = catalogo.get(clave);
      if (it?.conCodigo) return { ...resto, [clave]: marcaDeCubierta(tipos) };
      return { ...resto, [clave]: marcaNueva(it?.accionPorDefecto ? { accion: it.accionPorDefecto } : {}) };
    });
  const cambiarMarca = (clave: string, parcial: Partial<Marcas[string]>) => setMarcas((m) => ({ ...m, [clave]: { ...m[clave], ...parcial } }));

  function guardar() {
    const id = idDeService(vehiculo.patente);
    guardarService(
      vehiculo,
      {
        id,
        tipos,
        fecha: datos.fecha,
        km: kmNumero,
        chofer: datos.chofer.trim(),
        mecanico: datos.mecanico.trim(),
        obs: "",
        items,
      },
      cambiosDeCubiertas(secciones, marcas, contexto.modeloActual),
    );
    navigate(`/panel/taller/${enLaDireccion(vehiculo.patente)}/service/${id}?guardado=1`);
  }

  return (
    <CtxCubiertas.Provider value={contexto}>
    <div className="space-y-5 pb-24">
      <div>
        <Link to={`/panel/taller/${enLaDireccion(vehiculo.patente)}?tab=services`} className="font-cond text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
          ← Cancelar
        </Link>
        <h2 className="font-cond text-3xl leading-none">Nuevo service · {vehiculo.patente}</h2>
      </div>

      <ol className="grid grid-cols-3 gap-px bg-ink/10" aria-label="Pasos">
        {["Datos", "Qué se hizo", "Revisar y guardar"].map((t, i) => {
          const n = i + 1;
          const alcanzable = n === 1 || faltan.length === 0;
          return (
            <li key={t} className="bg-bg">
              <button
                type="button"
                onClick={() => alcanzable && irA(n)}
                aria-current={paso === n ? "step" : undefined}
                disabled={!alcanzable}
                className={`flex min-h-[44px] w-full items-center justify-center gap-2 border-b-[3px] px-2 py-2 font-cond text-[13px] font-semibold uppercase tracking-[0.08em] disabled:opacity-40 ${
                  paso === n ? "border-brand text-ink" : paso > n ? "border-st-greenDot text-st-greenTx" : "border-transparent text-ink/50"
                }`}
              >
                <span className={`grid h-5 w-5 place-items-center text-[11px] ${paso === n ? "bg-navy text-bg" : "border border-ink/30"}`}>{paso > n ? "✓" : n}</span>
                <span className="hidden sm:inline">{t}</span>
                <span className="sm:hidden">{n === 1 ? "Datos" : n === 2 ? "Hacer" : "Guardar"}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {paso === 1 && (
        <PasoDatos vehiculo={vehiculo} datos={datos} tipos={tipos} onTipos={cambiarTipos} onCambio={cambiarDato} faltan={faltan} onSiguiente={() => irA(2)} />
      )}

      {paso === 2 && (
        <PasoMarcar
          tipos={tipos}
          secciones={secciones}
          marcas={marcas}
          abierta={abierta}
          onAbrir={setAbierta}
          onMarcar={marcar}
          onCambio={cambiarMarca}
          marcadas={marcadas}
          onRevisar={() => irA(3)}
          onAtras={() => irA(1)}
        />
      )}

      {paso === 3 && (
        <section className="space-y-4">
          <div className="panel grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-5">
            <Corners />
            <Resumen titulo="Tipos" valor={<CodigoPill tipos={tipos} />} />
            <Resumen titulo="Fecha" valor={fmtDate(datos.fecha)} />
            <Resumen titulo={vehiculo.unidad === "h" ? "Horas" : "Km"} valor={`${kmNumero.toLocaleString("es-UY")} ${vehiculo.unidad}`} />
            <Resumen titulo="Mecánico" valor={datos.mecanico} />
            <Resumen titulo={vehiculo.unidad === "h" ? "Operador" : "Chofer"} valor={datos.chofer} />
          </div>

          <ul className="space-y-0.5 text-xs text-ink/60">
            {tipos.map((t) => {
              const def = tiposDisponibles(vehiculo).find((d) => d.codigo === t);
              return (
                <li key={t}>
                  <b className="text-ink/80">{t === "otro" ? "Otro" : t}</b> · {def ? descripcionDeTipo(def) : NOMBRE_OTRO}
                </li>
              );
            })}
          </ul>

          <h3 className="font-cond text-xl">
            Lo que se va a guardar <span className="text-base text-ink/50">({marcadas})</span>
          </h3>
          {marcadas === 0 ? (
            <p className="border border-st-amberBd bg-st-amberBg px-4 py-3 text-sm text-st-amberTx">
              No marcaste nada todavía. Un service guarda sólo lo que se marca: volvé y marcá lo que se hizo.
            </p>
          ) : (
            <ul className="panel divide-y divide-ink/10">
              {items.map((i, k) => (
                <li key={`${i.pieza}-${k}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">
                      {i.pieza}
                      <span className="font-normal text-ink/55"> · {i.seccion}{i.sujeto && !i.pieza.includes(i.sujeto.split(" ")[1] ?? "§") ? ` · ${i.sujeto}` : ""}</span>
                    </div>
                    {(i.medida || i.obs) && <div className="text-xs text-ink/60">{[i.medida, i.obs].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <Accion accion={i.accion} />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => irA(2)} className="btn btn-secondary min-h-[44px]">
              ← Seguir marcando
            </button>
            <button type="button" data-guardar onClick={guardar} disabled={marcadas === 0} className="btn btn-primary min-h-[44px]">
              Guardar service
            </button>
          </div>
        </section>
      )}
    </div>
    </CtxCubiertas.Provider>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">{titulo}</div>
      <div className="mt-0.5 font-cond text-lg font-semibold">{valor}</div>
    </div>
  );
}

// ── Paso 1: los datos obligatorios ──
function PasoDatos({
  vehiculo,
  datos,
  tipos,
  onTipos,
  onCambio,
  faltan,
  onSiguiente,
}: {
  vehiculo: Vehiculo;
  datos: Datos;
  tipos: TipoService[];
  onTipos: (t: TipoService[]) => void;
  onCambio: (p: Partial<Datos>) => void;
  faltan: string[];
  onSiguiente: () => void;
}) {
  const { choferes } = useFlota();
  const esHoras = vehiculo.unidad === "h";
  const disponibles = tiposDisponibles(vehiculo);
  const alternar = (codigo: TipoService, on: boolean) => onTipos(on ? [...tipos, codigo] : tipos.filter((t) => t !== codigo));
  return (
    <section className="panel space-y-5 p-4">
      <Corners />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Fecha</span>
          <input type="date" className="input min-h-[44px]" value={datos.fecha} onChange={(e) => onCambio({ fecha: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">{esHoras ? "Horas" : "Km"}</span>
          <input
            inputMode="decimal"
            className="input min-h-[44px] tabular-nums"
            value={datos.km}
            onChange={(e) => onCambio({ km: e.target.value.replace(/[^\d.,]/g, "") })}
          />
          <span className="mt-1 block text-xs text-ink/55">
            {esHoras ? "Horímetro" : "Del tacógrafo"}: {vehiculo.km.toLocaleString("es-UY")} · lectura del {fmtDate(vehiculo.lectura)}. Se puede
            corregir.
          </span>
        </label>
      </div>

      <fieldset>
        <legend className="label">Tipos de service</legend>
        <p className="mb-2 text-xs text-ink/55">Se pueden elegir varios a la vez (por ejemplo A + D + R). En el paso siguiente vienen marcados sus ítems.</p>
        {(["motor", "cubiertas"] as const).map((grupo) => {
          const lista = disponibles.filter((t) => t.grupo === grupo);
          if (lista.length === 0) return null;
          return (
            <div key={grupo} className="mb-3">
              <div className="mb-1 font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">{grupo === "motor" ? "Motor" : "Cubiertas"}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {lista.map((t) => (
                  <OpcionDeTipo key={t.codigo} codigo={t.codigo} nombre={t.nombre} detalle={contenidoDeTipo(t)} activo={tipos.includes(t.codigo)} onCambio={alternar} />
                ))}
              </div>
            </div>
          );
        })}
        <div className="grid gap-2 sm:grid-cols-2">
          <OpcionDeTipo codigo="otro" nombre={NOMBRE_OTRO} detalle={EXPLICACION_OTRO} activo={tipos.includes("otro")} onCambio={alternar} />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Mecánico</span>
          <input list="mecanicos" className="input min-h-[44px]" value={datos.mecanico} onChange={(e) => onCambio({ mecanico: e.target.value })} />
          <datalist id="mecanicos">
            {MECANICOS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">{esHoras ? "Operador" : "Chofer que anda en el camión"}</span>
          <input list="choferes" className="input min-h-[44px]" value={datos.chofer} onChange={(e) => onCambio({ chofer: e.target.value })} />
          <datalist id="choferes">
            {choferes.map((c) => (
              <option key={c} value={c}>
                {c === vehiculo.choferAsignado ? "(asignado)" : ""}
              </option>
            ))}
          </datalist>
          <span className="mt-1 block text-xs text-ink/55">Se elige de los choferes cargados, o se escribe el nombre si no está.</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSiguiente} disabled={faltan.length > 0} className="btn btn-primary min-h-[44px]">
          Siguiente: qué se hizo →
        </button>
        {faltan.length > 0 && <span className="text-sm text-st-redTx">Falta {faltan.join(", ")}.</span>}
      </div>
    </section>
  );
}

function OpcionDeTipo({
  codigo,
  nombre,
  detalle,
  activo,
  onCambio,
}: {
  codigo: TipoService;
  nombre: string;
  detalle: string;
  activo: boolean;
  onCambio: (codigo: TipoService, on: boolean) => void;
}) {
  return (
    <label
      data-tipo-opcion={codigo}
      className={`flex min-h-[44px] cursor-pointer items-start gap-3 border px-3 py-2.5 ${activo ? "border-navy bg-brand-100" : "border-ink/[.2] bg-white hover:bg-ink/[.04]"}`}
    >
      <input type="checkbox" className="mt-1 h-5 w-5 flex-none" checked={activo} onChange={(e) => onCambio(codigo, e.target.checked)} />
      <span className="min-w-0">
        <span className="block font-semibold text-ink">
          {codigo !== "otro" && <span className="mr-2 font-cond font-bold tracking-[0.06em]">{codigo}</span>}
          {nombre}
        </span>
        <span className="block text-xs text-ink/55">{detalle}</span>
      </span>
    </label>
  );
}

// ── Paso 2: marcar lo que se hizo, por secciones ──
function PasoMarcar({
  tipos,
  secciones,
  marcas,
  abierta,
  onAbrir,
  onMarcar,
  onCambio,
  marcadas,
  onRevisar,
  onAtras,
}: {
  tipos: TipoService[];
  secciones: SeccionDeService[];
  marcas: Marcas;
  abierta: string | null;
  onAbrir: (id: string | null) => void;
  onMarcar: (clave: string, on: boolean) => void;
  onCambio: (clave: string, p: Partial<Marcas[string]>) => void;
  marcadas: number;
  onRevisar: () => void;
  onAtras: () => void;
}) {
  return (
    <section className="space-y-3">
      <p className="max-w-prose text-sm text-ink/60">
        Abrí cada sección y marcá sólo lo que se hizo. En cada ítem elegí si se reparó, se cambió por uno nuevo o sólo se revisó.
        {tipos.length > 0 && " Lo de los tipos elegidos ya viene marcado: desmarcá lo que no se hizo."}
      </p>
      {flujoDeCubiertas(tipos).rotacion && (
        <p data-ayuda-rotacion className="border border-ink/15 bg-surface/60 px-4 py-2 text-sm text-ink/70">
          Rotación: en <b>Cubiertas</b>, marcá cada cubierta que rotaste y elegí a qué posición pasó.
        </p>
      )}
      {flujoDeCubiertas(tipos).nueva && (
        <p data-ayuda-nueva className="border border-ink/15 bg-surface/60 px-4 py-2 text-sm text-ink/70">
          Cubiertas nuevas: en <b>Cubiertas</b>, marcá cada posición y elegí la cubierta nueva del stock o cargala a mano.
        </p>
      )}
      {flujoDeCubiertas(tipos).balanceo && (
        <p data-ayuda-balanceo className="border border-ink/15 bg-surface/60 px-4 py-2 text-sm text-ink/70">
          Balanceo: cada cubierta que marques queda balanceada, con la fecha de hoy en su historial. Se puede destildar en cada una.
        </p>
      )}
      {secciones.map((s) => {
        const n = marcadosEn(s, marcas);
        const abierto = abierta === s.id;
        return (
          <div key={s.id} className="panel">
            <button
              type="button"
              aria-expanded={abierto}
              onClick={() => onAbrir(abierto ? null : s.id)}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2 text-left"
            >
              <span className="font-cond text-lg font-semibold">{s.nombre}</span>
              <span className="flex items-center gap-3">
                {n > 0 && <span className="bg-navy px-2 py-0.5 font-cond text-xs font-semibold tabular-nums text-bg">{n} {n === 1 ? "marcado" : "marcados"}</span>}
                <span aria-hidden className="font-cond text-xl text-ink/50">{abierto ? "−" : "+"}</span>
              </span>
            </button>
            {abierto && (
              <div className="border-t border-ink/10">
                {s.grupos.map((g, gi) => (
                  <GrupoDeItems key={`${s.id}-${gi}`} seccion={s} grupo={g} marcas={marcas} onMarcar={onMarcar} onCambio={onCambio} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-[400] border-t-[3px] border-navy md:left-60 bg-white px-4 py-3 shadow-elev-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <button type="button" onClick={onAtras} className="btn btn-secondary min-h-[44px] whitespace-nowrap px-3">
            ← Datos
          </button>
          <span className="whitespace-nowrap font-cond text-base font-semibold tabular-nums sm:text-lg">{marcadas} {marcadas === 1 ? "marcado" : "marcados"}</span>
          <button type="button" onClick={onRevisar} className="btn btn-primary min-h-[44px] whitespace-nowrap px-3">
            Revisar →
          </button>
        </div>
      </div>
    </section>
  );
}

function GrupoDeItems({
  seccion,
  grupo,
  marcas,
  onMarcar,
  onCambio,
}: {
  seccion: SeccionDeService;
  grupo: SeccionDeService["grupos"][number];
  marcas: Marcas;
  onMarcar: (clave: string, on: boolean) => void;
  onCambio: (clave: string, p: Partial<Marcas[string]>) => void;
}) {
  const marcados = grupo.items.filter((it) => marcas[claveDeItem(seccion.nombre, it)]).length;
  // Una rueda se abre sola si ya tiene algo marcado: si no, 16 piezas por rueda serían una pared.
  const [abierto, setAbierto] = useState(marcados > 0);
  const lista = (
    <ul className="divide-y divide-ink/10">
      {grupo.items.map((it) => (
        <ItemMarcable key={claveDeItem(seccion.nombre, it)} seccion={seccion.nombre} it={it} marca={marcas[claveDeItem(seccion.nombre, it)]} onMarcar={onMarcar} onCambio={onCambio} />
      ))}
    </ul>
  );
  if (!grupo.titulo) return lista;
  return (
    <div className="border-b border-ink/10 last:border-b-0">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 bg-surface/60 px-4 py-2 text-left"
      >
        <span className="text-sm font-semibold text-ink">{grupo.titulo}</span>
        <span className="flex items-center gap-2">
          {marcados > 0 && <span className="bg-navy px-1.5 py-0.5 font-cond text-xs font-semibold tabular-nums text-bg">{marcados}</span>}
          <span aria-hidden className="font-cond text-lg text-ink/50">{abierto ? "−" : "+"}</span>
        </span>
      </button>
      {abierto && lista}
    </div>
  );
}

function ItemMarcable({
  seccion,
  it,
  marca,
  onMarcar,
  onCambio,
}: {
  seccion: string;
  it: ItemCatalogo;
  marca: Marcas[string] | undefined;
  onMarcar: (clave: string, on: boolean) => void;
  onCambio: (clave: string, p: Partial<Marcas[string]>) => void;
}) {
  const clave = claveDeItem(seccion, it);
  return (
    <li className={marca ? "bg-brand-100/60" : undefined}>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-2">
        <input type="checkbox" className="h-5 w-5 flex-none" checked={!!marca} onChange={(e) => onMarcar(clave, e.target.checked)} />
        <span className="text-[15px] text-ink">{it.pieza}</span>
      </label>
      {marca && (
        <div className="space-y-3 px-4 pb-3 pl-12">
          <div role="radiogroup" aria-label={`Qué se hizo con ${it.pieza}`} className="flex">
            {(it.acciones ?? ACCIONES).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={marca.accion === a}
                onClick={() => onCambio(clave, { accion: a })}
                className={`min-h-[44px] flex-1 border px-2 font-cond text-sm font-semibold uppercase tracking-[0.06em] ${
                  marca.accion === a ? "border-navy bg-navy text-bg" : "-ml-px border-ink/[.25] bg-white text-ink/70 hover:bg-ink/[.05]"
                }`}
              >
                {TEXTO_ACCION[a]}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {it.medida && (
              <label className="block">
                <span className="label">Medida ({it.medida.unidad})</span>
                <input inputMode="decimal" className="input min-h-[44px]" value={marca.medida} onChange={(e) => onCambio(clave, { medida: e.target.value.replace(/[^\d.,]/g, "") })} />
                <span className="mt-0.5 block text-xs text-ink/50">{it.medida.ayuda}</span>
              </label>
            )}
            {it.conCodigo && <DatosDeCubierta it={it} marca={marca} onCambio={(p) => onCambio(clave, p)} />}
            <label className={`block ${it.medida || it.conCodigo ? "" : "sm:col-span-2"}`}>
              <span className="label">Observaciones</span>
              <input className="input min-h-[44px]" value={marca.obs} onChange={(e) => onCambio(clave, { obs: e.target.value })} />
            </label>
          </div>
        </div>
      )}
    </li>
  );
}

/** Lo propio de una cubierta: si es nueva, de dónde sale (stock o a mano); si no, si se rotó. */
function DatosDeCubierta({ it, marca, onCambio }: { it: ItemCatalogo; marca: Marcas[string]; onCambio: (p: Partial<Marcas[string]>) => void }) {
  const ctx = useContext(CtxCubiertas);
  const numero = Number(it.sujeto.replace(/\D+/g, ""));
  const balanceo = (
    <label className="flex min-h-[44px] items-center gap-2 sm:col-span-2">
      <input type="checkbox" className="h-5 w-5" checked={marca.balanceada} onChange={(e) => onCambio({ balanceada: e.target.checked })} />
      <span className="text-sm text-ink">Balanceada (queda anotado en su historial)</span>
    </label>
  );
  if (marca.accion === "nuevo") {
    const delStock = ctx.stockNuevas.find((c) => c.codigo === marca.delStock);
    return (
      <>
        <label className="block sm:col-span-2">
          <span className="label">Sacar del stock (opcional)</span>
          <select
            className="input min-h-[44px]"
            value={marca.delStock}
            onChange={(e) => onCambio({ delStock: e.target.value })}
          >
            <option value="">No: es una cubierta cargada a mano</option>
            {ctx.stockNuevas.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.codigo} · {MODELOS[c.modeloId]?.nombre}
              </option>
            ))}
          </select>
          {delStock && (
            <span className="mt-1 block text-xs text-st-greenTx">
              Se pone la {delStock.codigo} ({MODELOS[delStock.modeloId]?.nombre}) y se descuenta del stock.
            </span>
          )}
        </label>
        {!delStock && (
          <>
            <label className="block">
              <span className="label">Modelo</span>
              <select className="input min-h-[44px]" value={marca.modelo || ctx.modeloActual(numero)} onChange={(e) => onCambio({ modelo: e.target.value })}>
                {Object.values(MODELOS).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {m.medida}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Código (opcional)</span>
              <input className="input min-h-[44px]" value={marca.codigo} onChange={(e) => onCambio({ codigo: e.target.value })} placeholder="Se puede dejar vacío" />
            </label>
          </>
        )}
        <p className="text-xs text-ink/55 sm:col-span-2">
          La cubierta que estaba pasa al historial de esta posición y entra al stock como usada. La nueva arranca en 0 km.
        </p>
        {balanceo}
      </>
    );
  }
  return (
    <>
    {balanceo}
    <label className="block sm:col-span-2">
      <span className="label">Rotada a la posición (opcional)</span>
      <select className="input min-h-[44px]" value={marca.rotaA} onChange={(e) => onCambio({ rotaA: e.target.value })}>
        <option value="">No se rotó</option>
        {ctx.posiciones
          .filter((p) => p.numero !== numero)
          .map((p) => (
            <option key={p.numero} value={p.numero}>
              {p.numero} · {p.nombre}
            </option>
          ))}
      </select>
      {marca.rotaA && <span className="mt-1 block text-xs text-ink/55">Las dos posiciones intercambian sus cubiertas.</span>}
    </label>
    </>
  );
}
