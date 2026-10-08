import { useSearchParams } from "react-router-dom";
import { Corners } from "../../components/ui";
import { Solapas } from "./Solapas";
import { TabCubiertas } from "./TabCubiertas";
import { TablaDeRuedas } from "./TablaDeRuedas";
import { parteDeEjesDeLaUrl, type ParteDeEjes } from "./ubicacion";
import type { Vehiculo } from "./tipos";

const PARTES: { id: ParteDeEjes; nombre: string }[] = [
  { id: "cubiertas", nombre: "Cubiertas" },
  { id: "frenos", nombre: "Frenos" },
  { id: "rodaje", nombre: "Rodaje" },
];

/**
 * Los ejes: cubiertas (el dibujo y la ficha de cada una), frenos y rodaje por rueda. Frenos y rodaje salen de las mismas
 * piezas que la solapa de cada cubierta, así que el estado de una rueda se ve igual en los dos lados.
 */
export function TabEjes({ vehiculo }: { vehiculo: Vehiculo }) {
  const [params, setParams] = useSearchParams();
  const { disposicion } = vehiculo;
  if (!disposicion) {
    return (
      <div className="panel p-5 text-sm text-ink/65">
        <Corners />
        {vehiculo.patente} no tiene ejes ni cubiertas que dibujar: se mide en horas y no lleva ruedas en la planilla.
      </div>
    );
  }

  const parte = parteDeEjesDeLaUrl(params);
  const elegir = (p: ParteDeEjes) => setParams(p === "cubiertas" ? { tab: "mantenimiento", sec: "ejes" } : { tab: "mantenimiento", sec: "ejes", sub: p });

  return (
    <div className="space-y-5">
      <Solapas etiqueta="Partes de los ejes" opciones={PARTES} actual={parte} onElegir={elegir} />
      {parte === "cubiertas" ? (
        <TabCubiertas key={`${vehiculo.patente}-${disposicion.id}`} vehiculo={vehiculo} />
      ) : (
        <TablaDeRuedas vehiculo={vehiculo} disposicion={disposicion} grupo={parte} />
      )}
    </div>
  );
}
