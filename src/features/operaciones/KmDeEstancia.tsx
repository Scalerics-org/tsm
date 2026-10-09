import { useState } from "react";
import { VECES_QUE_SE_RECORRE_LA_ESTANCIA } from "@shared/estancias";
import { Button } from "../../components/ui";

/**
 * Cuántos km queda este lugar de la ciudad de su departamento, para las estancias donde se descarga fuera de la
 * ruta. Si el chofer escribe este nombre al decir dónde descargó, el viaje suma el desvío a sus km.
 *
 * Vacío = no es una estancia con desvío. Sólo lo edita el admin, como el resto de la libreta.
 */
export function KmDeEstancia({
  kmActual,
  disabled,
  onGuardar,
}: {
  kmActual: number | null | undefined;
  disabled: boolean;
  onGuardar: (km: number | null) => void;
}) {
  const [texto, setTexto] = useState(kmActual == null ? "" : String(kmActual));
  const nuevo = texto.trim() === "" ? null : Number(texto);
  const valido = nuevo === null || (Number.isInteger(nuevo) && nuevo >= 0 && nuevo <= 2000);
  const cambio = nuevo !== (kmActual ?? null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
      <label className="flex items-center gap-2">
        Estancia fuera de la ruta: km desde la ciudad
        <input
          className="input w-24 py-1"
          type="number"
          inputMode="numeric"
          min={0}
          max={2000}
          value={texto}
          disabled={disabled}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Vacío"
        />
      </label>
      <Button variant="secondary" disabled={disabled || !cambio || !valido} onClick={() => onGuardar(nuevo)}>
        Guardar
      </Button>
      {kmActual ? (
        <span>
          Suma {kmActual * VECES_QUE_SE_RECORRE_LA_ESTANCIA} km (ida y vuelta) a los viajes que descargan acá.
        </span>
      ) : null}
    </div>
  );
}
