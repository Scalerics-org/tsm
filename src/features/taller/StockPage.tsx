import { useSearchParams } from "react-router-dom";
import { Solapas } from "./Solapas";
import { StockConsumibles } from "./StockConsumibles";
import { StockCubiertas } from "./StockCubiertas";

type Pestana = "cubiertas" | "aceites" | "filtros";

const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: "cubiertas", nombre: "Cubiertas" },
  { id: "aceites", nombre: "Aceites" },
  { id: "filtros", nombre: "Filtros" },
];

/**
 * El depósito, con una pestaña por tipo de cosa: cubiertas, aceites (y líquidos) y filtros. La pestaña va en la URL
 * (`?tab=`), así el botón Atrás vuelve a la anterior. Cada pestaña muestra sólo lo suyo.
 */
export function StockPage() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("tab");
  const pestana: Pestana = pedida === "aceites" || pedida === "filtros" ? pedida : "cubiertas";
  const ir = (p: Pestana) => setParams(p === "cubiertas" ? {} : { tab: p });

  return (
    <div className="space-y-6">
      <div>
        <div className="kicker">Taller</div>
        <h1 className="font-cond text-3xl">Stock</h1>
        <p className="mt-1 max-w-prose text-sm text-ink/60">Lo que hay en el depósito: cubiertas, aceites y filtros.</p>
      </div>

      <Solapas etiqueta="Stock" opciones={PESTANAS} actual={pestana} onElegir={ir} />

      {pestana === "cubiertas" && <StockCubiertas />}
      {pestana === "aceites" && <StockConsumibles clase="aceite" />}
      {pestana === "filtros" && <StockConsumibles clase="filtro" />}
    </div>
  );
}
