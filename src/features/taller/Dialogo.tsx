import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Una ventana por encima de todo: en el celular ocupa la pantalla entera, en la compu queda centrada. Se cierra con la
 * cruz o con Escape. Va por un portal al <body>, para que ni la hoja de la cubierta ni el menú la tapen.
 */
export function Dialogo({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[900] flex items-stretch justify-center bg-ink/55 md:items-center md:p-6">
      <div className="flex h-full max-h-full w-full flex-col bg-bg md:h-auto md:max-h-[92vh] md:max-w-3xl md:border md:border-ink/20 md:shadow-elev-lg">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-ink/15 bg-white px-4 py-2">
          <h2 className="font-cond text-xl">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-11 w-11 flex-none place-items-center font-cond text-3xl leading-none text-ink/55 hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
