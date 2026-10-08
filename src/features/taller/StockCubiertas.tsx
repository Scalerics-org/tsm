import { useState } from "react";
import { Corners } from "../../components/ui";
import { useSoloMirar } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { MODELOS } from "./base";
import type { CubiertaEnStock } from "./datos-extra";
import { nombreDelModelo } from "./datos-extra";
import { FormularioDeAltaDeCubiertas, FormularioDeEdicionDeCubierta } from "./FormularioDeCubiertas";
import { AccionDeFila, ConfirmarBorrado } from "./CamposDeStock";
import { DialogoDeRecorrido, recorridoDeBaja, recorridoEnStock } from "./RecorridoDeCubierta";
import type { RecorridoDeCubierta } from "./movimientos";
import { uidDeStock } from "./movimientos";
import { altaDeCubiertasEnStock, editarCubiertaEnStock, eliminarCubiertaDeStock, useBajas, useStock } from "./servicio";

type Filtro = "todas" | "nueva" | "usada";

/**
 * Las cubiertas del depósito: las nuevas y las usadas, con el alta de lo comprado, la edición y la eliminación. Lo que no
 * está colocado en ningún vehículo es lo único que se puede eliminar, y eso ya es así porque acá sólo está el stock.
 */
export function StockCubiertas() {
  const soloMirar = useSoloMirar();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [viendo, setViendo] = useState<{ titulo: string; codigo?: string; modeloId: string; recorrido: RecorridoDeCubierta } | null>(null);
  const [alta, setAlta] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const bajas = useBajas();
  const stock = useStock();
  const lista = stock.filter((c) => filtro === "todas" || c.estado === filtro);
  const nuevas = stock.filter((c) => c.estado === "nueva").length;
  const usadas = stock.length - nuevas;
  const cubiertaEditada = stock.find((c) => uidDeStock(c) === editando);
  const cubiertaAEliminar = stock.find((c) => uidDeStock(c) === confirmando);
  const codigosEnStock = (salvo?: string) => stock.filter((c) => uidDeStock(c) !== salvo).map((c) => c.codigo);

  return (
    <div className="space-y-6">
      <section className="panel">
        <Corners />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <h2 className="font-cond text-xl">Cubiertas</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Qué cubiertas ver" className="flex">
              {(
                [
                  ["todas", `Todas (${stock.length})`],
                  ["nueva", `Nuevas (${nuevas})`],
                  ["usada", `Usadas (${usadas})`],
                ] as const
              ).map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                  className={`min-h-[44px] border px-3 font-cond text-sm font-semibold ${
                    filtro === id ? "border-navy bg-navy text-bg" : "-ml-px border-ink/[.22] bg-white text-ink/70 hover:bg-ink/[.05]"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
            {!soloMirar && !alta && (
              <button type="button" onClick={() => setAlta(true)} className="btn btn-navy min-h-[44px]">
                + Agregar
              </button>
            )}
          </div>
        </div>

        {alta && (
          <div className="border-b border-ink/10 p-4">
            <FormularioDeAltaDeCubiertas
              existentes={codigosEnStock()}
              onGuardar={(nuevas) => {
                altaDeCubiertasEnStock(nuevas);
                setAlta(false);
              }}
              onCancelar={() => setAlta(false)}
            />
          </div>
        )}
        {cubiertaEditada && (
          <div className="border-b border-ink/10 p-4">
            <FormularioDeEdicionDeCubierta
              c={cubiertaEditada}
              existentes={codigosEnStock(editando ?? undefined)}
              onGuardar={(cambios) => {
                editarCubiertaEnStock(uidDeStock(cubiertaEditada), cambios);
                setEditando(null);
              }}
              onCancelar={() => setEditando(null)}
            />
          </div>
        )}
        {cubiertaAEliminar && (
          <div className="border-b border-ink/10 p-4">
            <ConfirmarBorrado
              texto={`¿Sacar del stock la cubierta ${cubiertaAEliminar.codigo || "sin código"}? Su recorrido también se pierde.`}
              onConfirmar={() => {
                eliminarCubiertaDeStock(uidDeStock(cubiertaAEliminar));
                setConfirmando(null);
              }}
              onCancelar={() => setConfirmando(null)}
            />
          </div>
        )}

        <ModelosEnStock stock={stock} />

        <div className="hidden md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
                {["Código", "Modelo", "Medida", "Estado", "Compra", "Observaciones", ""].map((c) => (
                  <th key={c} className="px-4 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={uidDeStock(c)} className="border-t border-ink/10 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 font-cond text-base font-semibold">{c.codigo || <span className="font-normal text-ink/40">Sin código</span>}</td>
                  <td className="px-4 py-2.5">{nombreDelModelo(c.modeloId)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink/60">{MODELOS[c.modeloId]?.medida}</td>
                  <td className="px-4 py-2.5">
                    <EstadoStock estado={c.estado} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink/60">
                    {c.desde ? fmtDate(c.desde) : "—"}
                    {c.proveedor && <span className="block text-ink/50">{c.proveedor}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink/65">{c.obs}</td>
                  <td className="px-4 py-2.5 text-right">
                    <AccionesDeCubierta
                      soloMirar={soloMirar}
                      onRecorrido={() => setViendo({ titulo: "Recorrido de la cubierta", codigo: c.codigo, modeloId: c.modeloId, recorrido: recorridoEnStock(c) })}
                      onEditar={() => setEditando(uidDeStock(c))}
                      onEliminar={() => setConfirmando(uidDeStock(c))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-ink/10 md:hidden">
          {lista.map((c) => (
            <li key={uidDeStock(c)} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-cond text-lg font-semibold">{c.codigo || <span className="font-normal text-ink/40">Sin código</span>}</span>
                <EstadoStock estado={c.estado} />
              </div>
              <div className="text-sm text-ink/75">
                {nombreDelModelo(c.modeloId)} <span className="text-ink/50">· {MODELOS[c.modeloId]?.medida}</span>
              </div>
              {(c.desde || c.proveedor) && (
                <div className="text-xs text-ink/55">
                  {c.desde ? `Comprada el ${fmtDate(c.desde)}` : ""}
                  {c.proveedor ? ` · ${c.proveedor}` : ""}
                </div>
              )}
              {c.obs && <div className="text-xs text-ink/60">{c.obs}</div>}
              <div className="mt-1">
                <AccionesDeCubierta
                  soloMirar={soloMirar}
                  onRecorrido={() => setViendo({ titulo: "Recorrido de la cubierta", codigo: c.codigo, modeloId: c.modeloId, recorrido: recorridoEnStock(c) })}
                  onEditar={() => setEditando(uidDeStock(c))}
                  onEliminar={() => setConfirmando(uidDeStock(c))}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {bajas.length > 0 && (
        <section className="panel">
          <Corners />
          <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-xl">
            Bajas <span className="text-base text-ink/50">({bajas.length})</span>
          </h2>
          <ul className="divide-y divide-ink/10">
            {bajas.map((b) => (
              <li key={b.uid} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">
                    {b.codigo || <span className="font-normal text-ink/45">Sin código</span>} <span className="font-normal text-ink/55">· {nombreDelModelo(b.modeloId)}</span>
                  </div>
                  <div className="text-xs text-ink/60">
                    {b.motivo} · {fmtDate(b.fecha)} · salió de {b.patente} posición {b.posicion}
                    {b.obs ? ` · ${b.obs}` : ""}
                  </div>
                </div>
                <AccionDeFila onClick={() => setViendo({ titulo: "Recorrido de la cubierta dada de baja", codigo: b.codigo, modeloId: b.modeloId, recorrido: recorridoDeBaja(b) })}>
                  Ver recorrido
                </AccionDeFila>
              </li>
            ))}
          </ul>
        </section>
      )}

      {viendo && <DialogoDeRecorrido {...viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}

/** Las acciones de una cubierta. El lector sólo ve el recorrido: no agrega, edita ni elimina. */
function AccionesDeCubierta({
  soloMirar,
  onRecorrido,
  onEditar,
  onEliminar,
}: {
  soloMirar: boolean;
  onRecorrido: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <span className="flex flex-wrap justify-end gap-x-1">
      <AccionDeFila onClick={onRecorrido}>Ver recorrido</AccionDeFila>
      {!soloMirar && <AccionDeFila onClick={onEditar}>Editar</AccionDeFila>}
      {!soloMirar && (
        <AccionDeFila onClick={onEliminar} tipo="peligro">
          Eliminar
        </AccionDeFila>
      )}
    </span>
  );
}

/** Cuántas hay de cada modelo, para ver de un vistazo qué falta. */
function ModelosEnStock({ stock }: { stock: CubiertaEnStock[] }) {
  const cuenta = Object.values(MODELOS).map((m) => ({
    modelo: m,
    nuevas: stock.filter((c) => c.modeloId === m.id && c.estado === "nueva").length,
    usadas: stock.filter((c) => c.modeloId === m.id && c.estado === "usada").length,
  }));
  return (
    <ul className="grid gap-px border-b border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
      {cuenta.map(({ modelo, nuevas, usadas }) => (
        <li key={modelo.id} className="bg-white px-4 py-3">
          <div className="text-sm font-semibold text-ink">{modelo.nombre}</div>
          <div className="mt-1 flex gap-4 font-cond text-sm tabular-nums text-ink/60">
            <span>
              <b className="text-xl text-ink">{nuevas}</b> nuevas
            </span>
            <span>
              <b className="text-xl text-ink">{usadas}</b> usadas
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EstadoStock({ estado }: { estado: "nueva" | "usada" }) {
  return (
    <span
      className={`border px-2 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-[0.1em] ${
        estado === "nueva" ? "border-st-greenBd bg-st-greenBg text-st-greenTx" : "border-ink/25 bg-white text-ink/65"
      }`}
    >
      {estado === "nueva" ? "Nueva" : "Usada"}
    </span>
  );
}
