import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MODELOS } from "./datos";
import type { Disposicion } from "./disposicion";
import { PanelCubierta, type VistaDeRueda } from "./PanelCubierta";
import { COLOR_ESTADO, VistaSuperior } from "./VistaSuperior";
import {
  UMBRAL_AMBAR,
  UMBRAL_ROJO,
  VIDA_UTIL_KM,
  cubiertasPorPosicion,
  fmtKm,
  pctDeUso,
  type Estado,
  type Vehiculo,
} from "./tipos";

const LEYENDA: { estado: Estado; titulo: string; rango: string }[] = [
  { estado: "verde", titulo: "En buen estado", rango: `hasta ${fmtKm(VIDA_UTIL_KM * UMBRAL_AMBAR)}` },
  { estado: "ambar", titulo: "Para ir mirando", rango: `de ${fmtKm(VIDA_UTIL_KM * UMBRAL_AMBAR)} a ${fmtKm(VIDA_UTIL_KM * UMBRAL_ROJO)}` },
  { estado: "rojo", titulo: "Para cambiar", rango: `desde ${fmtKm(VIDA_UTIL_KM * UMBRAL_ROJO)}` },
];

export function TabCubiertas({ vehiculo }: { vehiculo: Vehiculo }) {
  // Sin disposición (el montacargas) no hay cubiertas: la solapa ni se ofrece, pero por las dudas no se rompe.
  const disposicion = vehiculo.disposicion;
  if (!disposicion) return null;
  return <CubiertasDe vehiculo={vehiculo} disposicion={disposicion} />;
}

function CubiertasDe({ vehiculo, disposicion }: { vehiculo: Vehiculo; disposicion: Disposicion }) {
  const [params, setParams] = useSearchParams();
  const [modeloResaltado, setModeloResaltado] = useState<string | null>(null);
  const items = useMemo(() => cubiertasPorPosicion(vehiculo), [vehiculo]);

  const pedida = Number(params.get("cubierta"));
  const elegida = items.find((i) => i.posicion.numero === pedida) ?? null;
  const elegir = (numero: number | null) => {
    const siguiente = new URLSearchParams(params);
    if (numero == null || numero === pedida) siguiente.delete("cubierta");
    else siguiente.set("cubierta", String(numero));
    setParams(siguiente, { replace: true });
  };

  const vista: VistaDeRueda = params.get("rueda") === "frenos" ? "frenos" : "cubierta";
  const verEsto = (v: VistaDeRueda) => {
    const siguiente = new URLSearchParams(params);
    if (v === "frenos") siguiente.set("rueda", "frenos");
    else siguiente.delete("rueda");
    setParams(siguiente, { replace: true });
  };

  // En el celular la ficha tapa la parte de abajo: se sube el dibujo para que la cubierta elegida quede a la vista.
  const numeroElegido = elegida?.posicion.numero;
  useEffect(() => {
    if (numeroElegido == null || !window.matchMedia("(max-width: 767px)").matches) return;
    const el = document.querySelector(`[data-cubierta="${numeroElegido}"]`);
    if (!el) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { top, height } = el.getBoundingClientRect();
    window.scrollBy({ top: top + height / 2 - window.innerHeight * 0.27, behavior: quieto ? "auto" : "smooth" });
  }, [numeroElegido]);

  // Los modelos que hay en este vehículo y cuántas cubiertas lleva cada uno.
  const modelos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const i of items) if (i.cubierta) cuenta.set(i.cubierta.modeloId, (cuenta.get(i.cubierta.modeloId) ?? 0) + 1);
    return [...cuenta].map(([id, cantidad]) => ({ modelo: MODELOS[id], cantidad }));
  }, [items]);

  const aCambiar = items.filter((i) => i.estado === "rojo").length;
  const aMirar = items.filter((i) => i.estado === "ambar").length;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,1fr)_380px] md:items-start ${
        elegida ? (vista === "frenos" ? "pb-[12vh] md:pb-0" : "pb-[48vh] md:pb-0") : ""
      }`}
    >
      <div className="space-y-4">
        <div className="papel-de-plano panel -mx-5 border-x-0 px-0 pb-4 pt-5 sm:mx-0 sm:border-x sm:px-6">
          <span className="kicker block px-4 pb-3 sm:px-2">
            {disposicion.nombre} · vista desde arriba
          </span>
          {disposicion.aConfirmar && <p className="px-4 pb-2 text-xs text-st-amberTx sm:px-2">{disposicion.aConfirmar}</p>}
          <VistaSuperior
            disposicion={disposicion}
            posiciones={items}
            seleccionada={elegida?.posicion.numero ?? null}
            onSeleccionar={elegir}
            modeloResaltado={modeloResaltado}
          />
        </div>

        <div className="panel space-y-4 p-4">
          <div>
            <h3 className="kicker mb-2">Cómo leer los colores</h3>
            <ul className="grid gap-2 sm:grid-cols-3">
              {LEYENDA.map((l) => (
                <li key={l.estado} className="flex items-start gap-2.5">
                  <i className="mt-1 block h-4 w-4 flex-none" style={{ background: COLOR_ESTADO[l.estado] }} />
                  <span className="text-sm leading-tight">
                    <span className="block font-semibold text-ink">{l.titulo}</span>
                    <span className="block text-xs tabular-nums text-ink/55">{l.rango}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink/55">
              Cada cubierta muestra sus km recorridos en miles (los km del tacógrafo menos los que tenía el vehículo al colocarla). El
              color sale de comparar esos km con una vida útil de ejemplo de {fmtKm(VIDA_UTIL_KM)}, igual para todas. La real se
              define con Rodrigo.
            </p>
          </div>

          <div>
            <h3 className="kicker mb-2">Resaltar por modelo</h3>
            <div className="flex flex-wrap gap-2">
              {modelos.map(({ modelo, cantidad }) => {
                const activo = modeloResaltado === modelo.id;
                return (
                  <button
                    key={modelo.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setModeloResaltado(activo ? null : modelo.id)}
                    className={`min-h-[44px] border px-3 py-1.5 text-left font-cond text-sm font-semibold transition ${
                      activo ? "border-navy bg-navy text-bg" : "border-ink/[.22] bg-white text-ink hover:bg-ink/[.05]"
                    }`}
                  >
                    {modelo.nombre}
                    <span className={`ml-2 text-xs ${activo ? "text-bg/70" : "text-ink/50"}`}>
                      {cantidad} {cantidad === 1 ? "cubierta" : "cubiertas"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <section className="panel">
          <h3 className="border-b border-ink/10 px-4 py-3 font-cond text-lg">Qué cubierta hay en cada posición</h3>
          <ul className="divide-y divide-ink/10">
            {items.map((i) => {
              const modelo = i.cubierta ? MODELOS[i.cubierta.modeloId] : undefined;
              const activa = elegida?.posicion.numero === i.posicion.numero;
              return (
                <li key={i.posicion.numero}>
                  <button
                    type="button"
                    onClick={() => elegir(i.posicion.numero)}
                    aria-pressed={activa}
                    className={`flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left ${activa ? "bg-brand-100" : "hover:bg-ink/[.04]"}`}
                  >
                    <span
                      className="grid h-8 w-8 flex-none place-items-center font-cond text-base font-bold text-white"
                      style={{ background: i.estado ? COLOR_ESTADO[i.estado] : "#8d9296" }}
                    >
                      {i.posicion.numero}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">
                        {i.cubierta ? modelo?.nombre : "Sin cubierta cargada"}
                        {i.cubierta && (
                          <span className={`ml-2 font-cond text-sm ${i.cubierta.codigo ? "text-ink/60" : "font-normal text-ink/40"}`}>
                            {i.cubierta.codigo || "sin código"}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-ink/55">{i.posicion.nombre}</span>
                    </span>
                    <span className="flex-none text-right font-cond tabular-nums">
                      <span className="block text-base font-semibold">{i.cubierta ? fmtKm(i.km) : "—"}</span>
                      {i.cubierta && (
                        <span className="block text-xs text-ink/60">
                          {pctDeUso(i.km)}% de {fmtKm(VIDA_UTIL_KM)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="space-y-4 md:sticky md:top-4">
        {elegida ? (
          <PanelCubierta vehiculo={vehiculo} item={elegida} vista={vista} onVista={verEsto} onCerrar={() => elegir(null)} />
        ) : (
          <div className="panel p-5">
            <div className="kicker">Tocá una cubierta</div>
            <p className="mt-2 text-sm leading-relaxed text-ink/65">
              En el dibujo, cada cubierta es un botón. Al tocarla se abre su ficha: dónde está, qué modelo es, cuándo se la
              colocó, cuántos km lleva y qué otras cubiertas estuvieron en esa posición.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4">
              <Resumen titulo="Para cambiar" valor={aCambiar} color={COLOR_ESTADO.rojo} />
              <Resumen titulo="Para ir mirando" valor={aMirar} color={COLOR_ESTADO.ambar} />
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Resumen({ titulo, valor, color }: { titulo: string; valor: number; color: string }) {
  return (
    <div className="border-l-4 pl-3" style={{ borderColor: color }}>
      <div className="font-cond text-3xl font-semibold leading-none tabular-nums">{valor}</div>
      <div className="mt-1 text-xs text-ink/55">{titulo}</div>
    </div>
  );
}
