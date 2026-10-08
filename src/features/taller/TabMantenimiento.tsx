import { useSearchParams } from "react-router-dom";
import { SeccionDeComponente } from "./SeccionDeComponente";
import { Solapas } from "./Solapas";
import { TabEjes } from "./TabEjes";
import { seccionDeLaUrl, seccionesDelVehiculo, type Seccion } from "./ubicacion";
import type { Vehiculo } from "./tipos";

const NOMBRES: Record<Seccion, string> = {
  ejes: "Ejes",
  motor: "Motor",
  caja: "Caja de cambios",
  diferencial: "Diferencial",
  chasis: "Chasis",
  electricidad: "Electricidad",
};

/**
 * Mantenimiento: la planilla del vehículo por sección. Ejes (cubiertas, frenos y rodaje) y, por cada componente que lleva
 * el vehículo, su hoja. Lo que se elige va en la URL (`?sec=`), así cada cambio de sección queda en el historial.
 */
export function TabMantenimiento({ vehiculo }: { vehiculo: Vehiculo }) {
  const [params, setParams] = useSearchParams();
  const disponibles = seccionesDelVehiculo(vehiculo.componentes);
  const seccion = seccionDeLaUrl(params, disponibles);
  const elegir = (s: Seccion) => setParams({ tab: "mantenimiento", sec: s });
  const componente = vehiculo.componentes.find((c) => c.id === seccion);

  return (
    <div className="space-y-5">
      <Solapas
        etiqueta="Secciones de mantenimiento"
        opciones={disponibles.map((s) => ({ id: s, nombre: NOMBRES[s] }))}
        actual={seccion}
        onElegir={elegir}
      />
      {seccion === "ejes" ? <TabEjes vehiculo={vehiculo} /> : componente && <SeccionDeComponente vehiculo={vehiculo} componente={componente} />}
    </div>
  );
}
