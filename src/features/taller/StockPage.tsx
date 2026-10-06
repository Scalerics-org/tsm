import { useState } from "react";
import { Corners } from "../../components/ui";
import { ACEITE, FILTROS, nombreDelModelo, type CubiertaEnStock } from "./datos-extra";
import { useStock } from "./servicio";
import { MODELOS } from "./base";

type Filtro = "todas" | "nueva" | "usada";

/** El depósito: cubiertas nuevas y usadas por código y modelo, aceite y filtros. */
export function StockPage() {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const stock = useStock();
  const lista = stock.filter((c) => filtro === "todas" || c.estado === filtro);
  const nuevas = stock.filter((c) => c.estado === "nueva").length;
  const usadas = stock.length - nuevas;

  return (
    <div className="space-y-6">
      <div>
        <div className="kicker">Taller</div>
        <h1 className="font-cond text-3xl">Stock</h1>
        <p className="mt-1 max-w-prose text-sm text-ink/60">Lo que hay en el depósito: cubiertas, aceite y filtros.</p>
      </div>

      <section className="panel">
        <Corners />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <h2 className="font-cond text-xl">Cubiertas</h2>
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
        </div>

        <ModelosEnStock stock={stock} />

        <div className="hidden md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-cond text-[11px] uppercase tracking-[0.12em] text-ink/50">
                {["Código", "Modelo", "Medida", "Estado", "Observaciones"].map((c) => (
                  <th key={c} className="px-4 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.codigo} className="border-t border-ink/10 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 font-cond text-base font-semibold">{c.codigo || <span className="font-normal text-ink/40">Sin código</span>}</td>
                  <td className="px-4 py-2.5">{nombreDelModelo(c.modeloId)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink/60">{MODELOS[c.modeloId]?.medida}</td>
                  <td className="px-4 py-2.5">
                    <EstadoStock estado={c.estado} />
                  </td>
                  <td className="px-4 py-2.5 text-ink/65">{c.obs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-ink/10 md:hidden">
          {lista.map((c) => (
            <li key={c.codigo} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-cond text-lg font-semibold">{c.codigo || <span className="font-normal text-ink/40">Sin código</span>}</span>
                <EstadoStock estado={c.estado} />
              </div>
              <div className="text-sm text-ink/75">
                {nombreDelModelo(c.modeloId)} <span className="text-ink/50">· {MODELOS[c.modeloId]?.medida}</span>
              </div>
              {c.obs && <div className="text-xs text-ink/60">{c.obs}</div>}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <Corners />
          <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-xl">Aceite</h2>
          <dl className="grid grid-cols-3 gap-3 px-4 py-4">
            <Cifra titulo="Cantidad" valor={ACEITE.cantidadL} sub="en el tambor" />
            <Cifra titulo="Consumo" valor={ACEITE.consumoL} sub="en el mes" />
            <Cifra titulo="Tanque" valor={ACEITE.contenidoTanqueL} sub="lo que lleva" />
          </dl>
        </section>

        <section className="panel">
          <Corners />
          <h2 className="border-b border-ink/10 px-4 py-3 font-cond text-xl">Filtros</h2>
          <ul className="divide-y divide-ink/10">
            {FILTROS.map((f) => (
              <li key={f.modelo} className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-cond text-lg font-semibold">{f.modelo}</span>
                  <span className="ml-2 text-sm text-ink/55">{f.para}</span>
                </span>
                <span className="font-cond text-2xl font-semibold tabular-nums">{f.cantidad}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
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

function Cifra({ titulo, valor, sub }: { titulo: string; valor: number; sub: string }) {
  return (
    <div className="border-l-4 border-l-st-blueDot pl-3">
      <dt className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/50">{titulo}</dt>
      <dd className="font-cond text-3xl font-semibold leading-none tabular-nums">
        {valor}
        <span className="ml-1 text-base text-ink/50">L</span>
      </dd>
      <dd className="mt-1 text-xs text-ink/50">{sub}</dd>
    </div>
  );
}
