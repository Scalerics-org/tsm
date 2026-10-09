import { LOCALIDADES_DE_SALIDA } from "@shared/salida";
import { Field } from "./ui";

/**
 * "¿Desde dónde salís a buscar la carga?" — para los km vacíos (ver `shared/salida.ts`).
 *
 * Siempre opcional: dejarlo en "Otra / no sé" no frena nada. Una lista cerrada y no un texto libre, porque un
 * lugar que la app no sabe medir deja el vacío sin km.
 */
export function SelectorDeSalida({
  value,
  onChange,
  label = "¿Desde dónde salís?",
  ayuda,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  ayuda?: string;
}) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Otra / no sé</option>
        {LOCALIDADES_DE_SALIDA.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      {ayuda && <p className="mt-1 text-xs text-ink/50">{ayuda}</p>}
    </Field>
  );
}
