import { useEffect, useRef, useState } from "react";
import { aIso, aTexto, tipeando } from "../lib/fecha";

/**
 * Un campo de fecha que se ve en día/mes/año y abre el calendario del sistema.
 *
 * Reemplaza a `<input type="date">`, que no elige su formato: lo elige el navegador según el
 * idioma que tenga configurado cada uno. Con Chrome en inglés mostraba 08/03/2026 para el 3 de
 * agosto, al lado del texto que sí formateamos nosotros y que decía 03/08/2026. En un campo
 * que decide a qué mes va a parar un viaje —y con eso, a qué resumen de facturación— dos
 * formatos contradiciéndose no es un detalle estético.
 *
 * Se escribe en un campo de texto nuestro, y el calendario nativo sigue estando: vive en un
 * `type="date"` escondido que abre el botón de al lado. Así se puede tipear ocho números
 * —más rápido en computadora— o elegir del calendario, que es lo cómodo en el celular.
 *
 * Hacia afuera habla ISO, igual que antes: `value` y `onChange` son "YYYY-MM-DD", así que
 * ninguna pantalla cambió su lógica.
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
  // cambió de verdad y no es el que ya se está mostrando.
  const ultimoIso = useRef(value);
  useEffect(() => {
    if (value !== ultimoIso.current) {
      ultimoIso.current = value;
      setTexto(aTexto(value));
    }
  }, [value]);

  const borrandoRef = useRef(false);
  const calendario = useRef<HTMLInputElement>(null);

  /** El ancho lo pone quien nos usa y tiene que ir al contenedor, o el botón del calendario
   *  queda flotando lejos del campo. El resto de las clases son del input. */
  const clases = className.split(/\s+/).filter(Boolean);
  const ancho = clases.filter((c) => /^w-/.test(c));
  const delInput = clases.filter((c) => !/^w-/.test(c));

  const aplicar = (iso: string) => {
    ultimoIso.current = iso;
    setTexto(aTexto(iso));
    onChange(iso);
  };

  return (
    <span className={`relative inline-block align-top ${ancho.join(" ") || "w-full"}`}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        className={`${delInput.join(" ")} w-full pr-9`}
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

      {/* El calendario del sistema. `showPicker()` lo abre sin que el campo escondido tenga
          que verse; donde no exista, se hace foco y al menos queda navegable con el teclado. */}
      <button
        type="button"
        tabIndex={-1}
        disabled={rest.disabled}
        aria-label="Abrir el calendario"
        onClick={() => {
          const el = calendario.current;
          if (!el) return;
          if (typeof el.showPicker === "function") el.showPicker();
          else el.focus();
        }}
        className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-ink/40 hover:text-brand-700 disabled:opacity-40"
      >
        <CalendarioIcono />
      </button>
      <input
        ref={calendario}
        type="date"
        // Escondido pero presente: `showPicker()` necesita el elemento en el documento.
        className="pointer-events-none absolute bottom-0 right-4 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => aplicar(e.target.value)}
      />
    </span>
  );
}

function CalendarioIcono() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.75" y="4.25" width="14.5" height="13" rx="1" />
      <path d="M2.75 8.25h14.5M6.75 2.75v3M13.25 2.75v3" strokeLinecap="round" />
    </svg>
  );
}
