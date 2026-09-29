import { useEffect, useState } from "react";
import { EVENTO_REINTENTANDO, type Reintentando } from "../lib/reintentos";

/**
 * "Sin señal, reintentando…": una franja mientras la app vuelve a mandar un pedido que no obtuvo
 * respuesta. Avisa que no está trabada; no pide nada. Si fallan todos los intentos desaparece y
 * la pantalla muestra el error de siempre (`SIN_SENAL`).
 */
export function AvisoReintentando() {
  const [estado, setEstado] = useState<Reintentando | null>(null);

  useEffect(() => {
    const alCambiar = (e: Event) => setEstado((e as CustomEvent<Reintentando | null>).detail);
    window.addEventListener(EVENTO_REINTENTANDO, alCambiar);
    return () => window.removeEventListener(EVENTO_REINTENTANDO, alCambiar);
  }, []);

  if (!estado) return null;
  return (
    <div
      role="status"
      className="sticky top-14 z-[400] mb-3 border-l-4 border-brand bg-surface px-3 py-2 text-sm text-ink shadow-sm"
    >
      Sin señal. Reintentando… (intento {estado.intento} de {estado.de})
    </div>
  );
}
