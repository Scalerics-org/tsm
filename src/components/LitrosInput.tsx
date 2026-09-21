import { litrosTipeados } from "@shared/litros";

/**
 * Un campo de litros que funciona con cualquier teclado.
 *
 * Es de texto con teclado numérico (`inputMode="numeric"`, que en todos los celulares trae los
 * diez dígitos) y la coma la pone el campo después de la tercera cifra: "29044" se ve y se
 * guarda como 290,44. Ver `shared/litros.ts`. `value` es lo que se muestra; el número sale de
 * `litrosTipeados(value).valor`.
 */
export function LitrosInput({
  value,
  onChange,
  placeholder,
  className = "input",
}: {
  value: string;
  onChange: (mostrado: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(litrosTipeados(e.target.value).mostrado)}
      placeholder={placeholder}
    />
  );
}
