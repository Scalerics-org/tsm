import { useAceites, useFiltros } from "./servicio";
import type { Marcas } from "./servicio";
import { existencia, numeroDeCantidad, type ItemDeStock } from "./stock-consumibles";

/**
 * Para un filtro o un líquido del service: de qué ítem del stock sale y cuánto. Es opcional: si no se elige nada, no se
 * descuenta nada. Si lo que se pide es más de lo que hay, se muestra en el momento; el stock queda en negativo al guardar.
 */
export function DescuentoDeStock({
  clase,
  marca,
  onCambio,
}: {
  clase: "aceite" | "filtro";
  marca: Marcas[string];
  onCambio: (p: Partial<Marcas[string]>) => void;
}) {
  const aceites = useAceites();
  const filtros = useFiltros();
  const opciones: ItemDeStock[] = clase === "filtro" ? filtros : aceites;
  const elegido = opciones.find((i) => i.id === marca.desdeStock);
  const cantidad = numeroDeCantidad(marca.cantidadStock) || 1;
  const unidad = clase === "filtro" ? "u" : "L";

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
        <label className="block">
          <span className="label">Sacar del stock (opcional)</span>
          <select className="input min-h-[44px]" value={marca.desdeStock} onChange={(e) => onCambio({ desdeStock: e.target.value })}>
            <option value="">No se descuenta nada</option>
            {opciones.map((i) => (
              <option key={i.id} value={i.id}>
                {clase === "filtro" ? `${i.nombre} · ${i.tipo}` : i.nombre} · quedan {existencia(i).toLocaleString("es-UY")} {i.unidad}
              </option>
            ))}
          </select>
        </label>
        {elegido && (
          <label className="block">
            <span className="label">Cuántos ({unidad})</span>
            <input
              inputMode="decimal"
              placeholder="1"
              className="input min-h-[44px] tabular-nums"
              value={marca.cantidadStock}
              onChange={(e) => onCambio({ cantidadStock: e.target.value.replace(/[^\d.,]/g, "") })}
            />
          </label>
        )}
      </div>
      {elegido && (
        <p className={`text-xs ${existencia(elegido) - cantidad < 0 ? "font-semibold text-st-redTx" : "text-st-greenTx"}`}>
          {existencia(elegido) - cantidad < 0
            ? `Quedan ${existencia(elegido).toLocaleString("es-UY")} ${unidad} y se piden ${cantidad.toLocaleString("es-UY")}: el stock va a quedar en negativo.`
            : `Se descuenta ${cantidad.toLocaleString("es-UY")} ${unidad} del stock al guardar el service.`}
        </p>
      )}
    </div>
  );
}
