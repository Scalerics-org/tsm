import { useEffect, useRef, useState } from "react";

/**
 * Elegir una o varias facturas para filtrar la lista y el Excel.
 *
 * "Quiero poder seleccionar más de una factura para exportar y no puedo" — Rodrigo. Un `<select>`
 * sólo deja una, así que es un desplegable con casillas: queda marcado lo elegido y se puede
 * limpiar de una.
 */
export function SelectorDeFacturas({
  facturas,
  elegidas,
  onChange,
}: {
  facturas: string[];
  elegidas: string[];
  onChange: (elegidas: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const marcada = (n: string) => elegidas.some((e) => e.toLowerCase() === n.toLowerCase());
  const alternar = (n: string) =>
    onChange(marcada(n) ? elegidas.filter((e) => e.toLowerCase() !== n.toLowerCase()) : [...elegidas, n]);
  // Las elegidas que ya no figuran en la lista (otra pestaña, un viaje desmarcado) siguen visibles para poder sacarlas.
  const todas = [...elegidas.filter((e) => !facturas.some((n) => n.toLowerCase() === e.toLowerCase())), ...facturas];
  const resumen =
    elegidas.length === 0 ? "Todas las facturas" : elegidas.length === 1 ? elegidas[0] : `${elegidas.length} facturas`;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        className="input flex w-full items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="truncate">{resumen}</span>
        <span className="ml-2 flex-none text-ink/40">{abierto ? "▲" : "▼"}</span>
      </button>
      {abierto && (
        <div className="absolute left-0 z-20 mt-1 w-full min-w-[12rem] border border-ink/20 bg-bg shadow-lg">
          <button
            type="button"
            className="w-full border-b border-ink/15 px-3 py-2 text-left text-sm font-semibold text-brand-700 disabled:text-ink/30"
            disabled={elegidas.length === 0}
            onClick={() => onChange([])}
          >
            Limpiar selección
          </button>
          <ul className="max-h-60 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {todas.map((n) => (
              <li key={n}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface">
                  <input type="checkbox" checked={marcada(n)} onChange={() => alternar(n)} />
                  <span className="truncate">{n}</span>
                </label>
              </li>
            ))}
            {todas.length === 0 && <li className="px-3 py-2 text-sm text-ink/50">No hay facturas cargadas.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
