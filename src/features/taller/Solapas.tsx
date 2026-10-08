/**
 * Las solapas de una sección (Services · Mantenimiento · Historial, o Ejes · Motor… adentro de Mantenimiento). Quien las usa
 * decide qué pasa al elegir: cada solapa es un enlace de la URL, así el botón Atrás vuelve a la anterior.
 */
export function Solapas<T extends string>({
  etiqueta,
  opciones,
  actual,
  onElegir,
}: {
  etiqueta: string;
  opciones: { id: T; nombre: string }[];
  actual: T;
  onElegir: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="sin-barra -mx-5 flex overflow-x-auto border-b border-ink/15 px-5 sm:mx-0 sm:px-0">
      {opciones.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={actual === o.id}
          onClick={() => onElegir(o.id)}
          className={`min-h-[44px] flex-none border-b-[3px] px-4 font-cond text-[15px] font-semibold uppercase tracking-[0.08em] ${
            actual === o.id ? "border-brand text-ink" : "border-transparent text-ink/55 hover:text-ink"
          }`}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}
