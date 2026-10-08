import { useState, type FormEvent } from "react";
import { Corners } from "../../components/ui";
import { useSoloMirar } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { HOY } from "./datos";
import { AccionDeFila, Campo, ConfirmarBorrado, Errores } from "./CamposDeStock";
import { cambiarConsumibles, useAceites, useFiltros } from "./servicio";
import {
  TIPOS_DE_FILTRO,
  agregarItem,
  comprar,
  editarItem,
  eliminarItem,
  erroresDeCompra,
  erroresDeItem,
  existencia,
  nuevoIdDeStock,
  numeroDeCantidad,
  type ItemDeStock,
  type UnidadDeStock,
} from "./stock-consumibles";

/** Los aceites y líquidos de cada tipo, o los filtros de cada modelo: cuánto hay, cuánto entró y en qué se usó. */
type Clase = "aceite" | "filtro";
type Accion = { tipo: "comprar" | "editar" | "movimientos" | "eliminar"; id: string };

const SUGERENCIAS_DE_ACEITE = ["Aceite de motor", "Líquido de caja y diferencial", "Agua del motor"];

const TEXTO = {
  aceite: { titulo: "Aceites y líquidos", ayuda: "Cada tipo con los litros que hay. Una compra suma litros; cada service que los usa los resta.", unidad: "L" as UnidadDeStock },
  filtro: { titulo: "Filtros", ayuda: "Cada modelo con las unidades que hay. Una compra suma unidades; cada service que lo cambia lo resta.", unidad: "u" as UnidadDeStock },
};

export function StockConsumibles({ clase }: { clase: Clase }) {
  const soloMirar = useSoloMirar();
  const aceites = useAceites();
  const filtros = useFiltros();
  const items = clase === "aceite" ? aceites : filtros;
  const guardar = (nuevos: ItemDeStock[]) => cambiarConsumibles(clase === "aceite" ? { aceites: nuevos } : { filtros: nuevos });
  const [alta, setAlta] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const sobre = items.find((i) => i.id === accion?.id);
  const { titulo, ayuda, unidad } = TEXTO[clase];

  return (
    <section className="panel">
      <Corners />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div>
          <h2 className="font-cond text-xl">{titulo}</h2>
          <p className="text-xs text-ink/55">{ayuda}</p>
        </div>
        {!soloMirar && !alta && (
          <button type="button" onClick={() => setAlta(true)} className="btn btn-navy min-h-[44px]">
            + Agregar
          </button>
        )}
      </div>

      {alta && (
        <div className="border-b border-ink/10 p-4">
          <FormularioDeAlta
            clase={clase}
            items={items}
            onGuardar={(nuevos) => {
              guardar(nuevos);
              setAlta(false);
            }}
            onCancelar={() => setAlta(false)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink/60">No hay nada cargado todavía.</p>
      ) : (
        <ul className="divide-y divide-ink/10">
          {items.map((item) => {
            const total = existencia(item);
            const abierto = accion?.id === item.id ? accion.tipo : null;
            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-cond text-lg font-semibold">{item.nombre}</div>
                    {clase === "filtro" && <div className="text-xs text-ink/55">{item.tipo}</div>}
                  </div>
                  <div className="text-right">
                    <span className={`font-cond text-3xl font-semibold tabular-nums ${total < 0 ? "text-st-redTx" : ""}`}>{total.toLocaleString("es-UY")}</span>
                    <span className="ml-1 text-sm text-ink/55">{item.unidad}</span>
                    {total < 0 && <span className="block text-xs font-semibold text-st-redTx">En negativo: se usó más de lo que se cargó</span>}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap">
                  {!soloMirar && <AccionDeFila onClick={() => setAccion({ tipo: "comprar", id: item.id })}>Comprar</AccionDeFila>}
                  <AccionDeFila onClick={() => setAccion(abierto === "movimientos" ? null : { tipo: "movimientos", id: item.id })}>
                    {abierto === "movimientos" ? "Ocultar movimientos" : "Movimientos"}
                  </AccionDeFila>
                  {!soloMirar && <AccionDeFila onClick={() => setAccion({ tipo: "editar", id: item.id })}>Editar</AccionDeFila>}
                  {!soloMirar && (
                    <AccionDeFila onClick={() => setAccion({ tipo: "eliminar", id: item.id })} tipo="peligro">
                      Eliminar
                    </AccionDeFila>
                  )}
                </div>

                {abierto === "comprar" && (
                  <div className="mt-3">
                    <FormularioDeCompra
                      unidad={item.unidad}
                      onGuardar={(compra) => {
                        guardar(comprar(items, item.id, compra));
                        setAccion(null);
                      }}
                      onCancelar={() => setAccion(null)}
                    />
                  </div>
                )}
                {abierto === "editar" && (
                  <div className="mt-3">
                    <FormularioDeEdicion
                      clase={clase}
                      item={item}
                      items={items}
                      onGuardar={(cambios) => {
                        guardar(editarItem(items, item.id, cambios));
                        setAccion(null);
                      }}
                      onCancelar={() => setAccion(null)}
                    />
                  </div>
                )}
                {abierto === "eliminar" && sobre && (
                  <div className="mt-3">
                    <ConfirmarBorrado
                      texto={`¿Eliminar ${item.nombre}? Se pierden sus ${item.movimientos.length} movimientos.`}
                      onConfirmar={() => {
                        guardar(eliminarItem(items, item.id));
                        setAccion(null);
                      }}
                      onCancelar={() => setAccion(null)}
                    />
                  </div>
                )}
                {abierto === "movimientos" && <Movimientos item={item} />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-ink/10 px-4 py-2 text-[11px] text-ink/45">Unidad: {unidad === "L" ? "litros" : "unidades"}.</p>
    </section>
  );
}

/** El historial de un ítem: las compras y los usos, del más reciente al más viejo. Cada uso dice en qué service salió. */
function Movimientos({ item }: { item: ItemDeStock }) {
  const orden = [...item.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (orden.length === 0) return <p className="mt-3 text-sm text-ink/55">Sin movimientos.</p>;
  return (
    <ol className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
      {orden.map((m) => (
        <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-sm">
          <span className="min-w-0">
            <span className="font-semibold">{m.uso ? `Usado en ${m.uso.pieza}` : "Compra"}</span>
            <span className="block text-xs text-ink/60">
              {fmtDate(m.fecha)}
              {m.uso && ` · service de ${m.uso.patente}`}
              {m.obs && ` · ${m.obs}`}
            </span>
          </span>
          <span className={`font-cond text-base font-semibold tabular-nums ${m.cantidad < 0 ? "text-st-redTx" : "text-st-greenTx"}`}>
            {m.cantidad > 0 ? "+" : ""}
            {m.cantidad.toLocaleString("es-UY")} {item.unidad}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** El alta de un tipo de aceite (con sus litros) o de un modelo de filtro (con sus unidades): cada uno nace con su compra. */
function FormularioDeAlta({ clase, items, onGuardar, onCancelar }: { clase: Clase; items: ItemDeStock[]; onGuardar: (nuevos: ItemDeStock[]) => void; onCancelar: () => void }) {
  const unidad = TEXTO[clase].unidad;
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState(TIPOS_DE_FILTRO[0]);
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState(HOY);
  const [obs, setObs] = useState("");
  const [errores, setErrores] = useState<string[]>([]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { nombre, tipo: clase === "filtro" ? tipo : "" };
    const cuanto = numeroDeCantidad(cantidad);
    const hallados = [...erroresDeItem(clase, datos, items), ...erroresDeCompra({ fecha, cantidad: cuanto }, unidad)];
    setErrores(hallados);
    if (hallados.length > 0) return;
    onGuardar(
      agregarItem(items, {
        id: nuevoIdDeStock(clase === "aceite" ? "ac" : "fi"),
        nombre: datos.nombre,
        tipo: datos.tipo,
        unidad,
        compra: { id: nuevoIdDeStock("m"), fecha, cantidad: cuanto, obs },
      }),
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-4" aria-label={clase === "aceite" ? "Alta de aceite" : "Alta de filtro"}>
      <div className="grid gap-4 sm:grid-cols-2">
        {clase === "aceite" ? (
          <Campo titulo="Tipo">
            <input list="tipos-de-aceite" className="input min-h-[44px]" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Aceite de motor" />
            <datalist id="tipos-de-aceite">
              {SUGERENCIAS_DE_ACEITE.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Campo>
        ) : (
          <>
            <Campo titulo="Modelo">
              <input className="input min-h-[44px]" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="LF3000" />
            </Campo>
            <Campo titulo="Tipo de filtro">
              <select className="input min-h-[44px]" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_DE_FILTRO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Campo>
          </>
        )}
        <Campo titulo={clase === "aceite" ? "Litros de la compra" : "Unidades de la compra"}>
          <input inputMode="decimal" className="input min-h-[44px] tabular-nums" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,]/g, ""))} />
        </Campo>
        <Campo titulo="Fecha de compra">
          <input type="date" className="input min-h-[44px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo titulo="Observaciones">
          <input className="input min-h-[44px]" value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
      <Errores errores={errores} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Agregar
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary min-h-[44px]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Una compra más de un ítem que ya existe. */
function FormularioDeCompra({ unidad, onGuardar, onCancelar }: { unidad: UnidadDeStock; onGuardar: (c: { id: string; fecha: string; cantidad: number; obs: string }) => void; onCancelar: () => void }) {
  const [fecha, setFecha] = useState(HOY);
  const [cantidad, setCantidad] = useState("");
  const [obs, setObs] = useState("");
  const [errores, setErrores] = useState<string[]>([]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const cuanto = numeroDeCantidad(cantidad);
    const hallados = erroresDeCompra({ fecha, cantidad: cuanto }, unidad);
    setErrores(hallados);
    if (hallados.length > 0) return;
    onGuardar({ id: nuevoIdDeStock("m"), fecha, cantidad: cuanto, obs });
  }

  return (
    <form onSubmit={guardar} className="grid gap-3 border border-ink/10 bg-surface/50 p-3 sm:grid-cols-2" aria-label="Compra">
      <Campo titulo={unidad === "L" ? "Litros comprados" : "Unidades compradas"}>
        <input inputMode="decimal" autoFocus className="input min-h-[44px] tabular-nums" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,]/g, ""))} />
      </Campo>
      <Campo titulo="Fecha">
        <input type="date" className="input min-h-[44px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo titulo="Observaciones">
        <input className="input min-h-[44px]" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      <div className="flex items-end gap-3">
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Sumar al stock
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary min-h-[44px]">
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-2">
        <Errores errores={errores} />
      </div>
    </form>
  );
}

/** Cambiar el nombre (o el modelo) y, en los filtros, el tipo. Los movimientos quedan como están. */
function FormularioDeEdicion({
  clase,
  item,
  items,
  onGuardar,
  onCancelar,
}: {
  clase: Clase;
  item: ItemDeStock;
  items: ItemDeStock[];
  onGuardar: (cambios: { nombre: string; tipo: string }) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(item.nombre);
  const [tipo, setTipo] = useState(item.tipo || TIPOS_DE_FILTRO[0]);
  const [errores, setErrores] = useState<string[]>([]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { nombre, tipo: clase === "filtro" ? tipo : "" };
    const hallados = erroresDeItem(clase, datos, items, item.id);
    setErrores(hallados);
    if (hallados.length > 0) return;
    onGuardar(datos);
  }

  return (
    <form onSubmit={guardar} className="grid gap-3 border border-ink/10 bg-surface/50 p-3 sm:grid-cols-2" aria-label="Editar">
      <Campo titulo={clase === "aceite" ? "Tipo" : "Modelo"}>
        <input className="input min-h-[44px]" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      {clase === "filtro" && (
        <Campo titulo="Tipo de filtro">
          <select className="input min-h-[44px]" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DE_FILTRO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <div className="flex items-end gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary min-h-[44px]">
          Guardar cambios
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary min-h-[44px]">
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-2">
        <Errores errores={errores} />
      </div>
    </form>
  );
}
