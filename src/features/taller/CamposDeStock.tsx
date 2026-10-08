import type { ReactNode } from "react";

/** Un campo de formulario con su etiqueta arriba. */
export function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{titulo}</span>
      {children}
    </label>
  );
}

/** Lo que falta o está mal en el formulario, antes de guardar. Vacío = no se muestra nada. */
export function Errores({ errores }: { errores: string[] }) {
  if (errores.length === 0) return null;
  return (
    <ul role="alert" className="space-y-0.5 border border-st-redBd bg-st-redBg px-3 py-2 text-sm text-st-redTx">
      {errores.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** La confirmación de un borrado, en la misma fila: sin ventana emergente del navegador. */
export function ConfirmarBorrado({ texto, onConfirmar, onCancelar }: { texto: string; onConfirmar: () => void; onCancelar: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border border-st-redBd bg-st-redBg px-3 py-2">
      <span className="text-sm font-semibold text-st-redTx">{texto}</span>
      <button type="button" onClick={onConfirmar} className="min-h-[44px] border border-st-redDot bg-st-redDot px-3 font-cond text-[12px] font-semibold uppercase tracking-[0.06em] text-bg">
        Sí, eliminar
      </button>
      <button type="button" onClick={onCancelar} className="min-h-[44px] border border-ink/25 bg-white px-3 font-cond text-[12px] font-semibold uppercase tracking-[0.06em] text-ink/70">
        No
      </button>
    </div>
  );
}

/** Un botón de acción chico de una fila (Editar, Eliminar, Comprar…). */
export function AccionDeFila({ children, onClick, tipo = "normal" }: { children: ReactNode; onClick: () => void; tipo?: "normal" | "peligro" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] whitespace-nowrap px-2 font-cond text-sm font-semibold uppercase tracking-[0.06em] hover:underline ${
        tipo === "peligro" ? "text-st-redTx" : "text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}
