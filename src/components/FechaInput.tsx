import { useEffect, useRef, useState } from "react";
import { aIso, aTexto, tipeando } from "../lib/fecha";

/**
 * Un campo de fecha que siempre se ve en día/mes/año.
 *
 * Reemplaza a `<input type="date">`, que no elige su formato: lo elige el navegador según el
 * idioma que tenga configurado cada uno. Con Chrome en inglés mostraba 08/03/2026 para el 3 de
 * agosto, al lado del texto que sí formateamos nosotros y que decía 03/08/2026. En un campo
 * que decide a qué mes va a parar un viaje —y con eso, a qué resumen de facturación— dos
 * formatos contradiciéndose no es un detalle estético.
 *
 * Hacia afuera habla ISO, igual que antes: `value` y `onChange` siguen siendo "YYYY-MM-DD", así
 * que las pantallas no cambian su lógica. Lo único que cambia es lo que se ve.
 *
 * Lo que se pierde: el calendarito nativo. Es un cambio aceptable acá, porque estas pantallas
 * son de oficina y se usan en computadora, donde tipear ocho números es más rápido que abrir
 * un calendario. La cámara y el resto del flujo del chofer no usan este campo.
 */
export function FechaInput({
  value,
  onChange,
  className = "input",
  ...rest
}: {
  /** "YYYY-MM-DD", o vacío. */
  value: string;
  /** Se llama con "YYYY-MM-DD" cuando la fecha está completa, y con "" mientras no lo esté. */
  onChange: (iso: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [texto, setTexto] = useState(() => aTexto(value));
  // Para no pisar lo que se está tipeando: sólo se re-sincroniza cuando el valor de afuera
  // cambió de verdad y no es el mismo que ya se está mostrando.
  const ultimoIso = useRef(value);
  useEffect(() => {
    if (value !== ultimoIso.current) {
      ultimoIso.current = value;
      setTexto(aTexto(value));
    }
  }, [value]);

  const borrandoRef = useRef(false);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={rest.placeholder ?? "dd/mm/aaaa"}
      maxLength={10}
      value={texto}
      onKeyDown={(e) => {
        borrandoRef.current = e.key === "Backspace" || e.key === "Delete";
        rest.onKeyDown?.(e);
      }}
      onChange={(e) => {
        const mostrado = tipeando(e.target.value, { borrando: borrandoRef.current });
        setTexto(mostrado);
        const iso = aIso(mostrado);
        ultimoIso.current = iso;
        onChange(iso);
      }}
    />
  );
}
