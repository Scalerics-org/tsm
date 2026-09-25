import { LIBRETA_ESTADO, LIBRETA_TIPO, TIPO_DEPARTAMENTO, type LibretaEntry } from "@shared/domain";
import { Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

/** Dónde cargó y dónde descargó una carga, como se escribe en la oficina. */
export interface Lugares {
  origen: string | null;
  lugar: string;
  destino: string | null;
  descarga: string;
}

export const LUGARES_VACIOS: Lugares = { origen: null, lugar: "", destino: null, descarga: "" };

/** El departamento como lo espera el selector: sólo el nombre importa. */
function departamento(nombre: string | null): LibretaEntry | null {
  const n = nombre?.trim();
  if (!n) return null;
  return {
    id: 0,
    tipo: LIBRETA_TIPO.LUGAR,
    nombre: n,
    provider_id: null,
    agrupador: false,
    estado: LIBRETA_ESTADO.CONFIRMADO,
    usos: 0,
    created_by: null,
  };
}

/**
 * Lo único que no puede quedar vacío: dónde cargó. Sin lugar de carga el servidor descarta el
 * renglón entero en silencio (ver docs/DECISIONES.md), y sin departamento el viaje queda con el
 * recorrido a medias. El destino y el lugar de descarga sí pueden faltar: "todavía no se sabe".
 */
export function errorDeLugares(v: Lugares): string | null {
  if (!v.lugar.trim()) return "Escribí el lugar de carga.";
  if (!v.origen) return "Elegí el departamento donde cargó.";
  return null;
}

/**
 * Los cuatro lugares de una carga de Otros Viajes: departamento y lugar de carga, departamento y
 * lugar de descarga. Lo usan "Agregar carga" y "Corregir lugares" de la oficina, así los dos piden
 * lo mismo y no vuelve a haber un viaje con cargas que dicen "origen a definir → destino a definir".
 */
export function CamposDeLugares({ value, onChange }: { value: Lugares; onChange: (v: Lugares) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <LibretaPicker
          tipo={TIPO_DEPARTAMENTO}
          label="Departamento de carga"
          value={departamento(value.origen)}
          onChange={(e) => onChange({ ...value, origen: e?.nombre ?? null })}
        />
        <Field label="Lugar de carga">
          <input
            className="input"
            value={value.lugar}
            onChange={(e) => onChange({ ...value, lugar: e.target.value })}
            autoCapitalize="words"
          />
        </Field>
        <LibretaPicker
          tipo={TIPO_DEPARTAMENTO}
          label="Departamento de destino"
          value={departamento(value.destino)}
          onChange={(e) => onChange({ ...value, destino: e?.nombre ?? null })}
        />
        <Field label="Lugar de descarga">
          <input
            className="input"
            value={value.descarga}
            onChange={(e) => onChange({ ...value, descarga: e.target.value })}
            placeholder="Todavía no se sabe"
            autoCapitalize="words"
          />
        </Field>
      </div>
      {value.destino && (
        <button
          type="button"
          onClick={() => onChange({ ...value, destino: null })}
          className="text-xs text-ink/55 hover:underline"
        >
          Todavía no se sabe el destino: dejarlo a definir
        </button>
      )}
    </div>
  );
}
