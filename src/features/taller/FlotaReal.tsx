import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Driver, Truck } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Spinner } from "../../components/ui";
import { VEHICULOS } from "./datos";
import { vehiculoDeCamion } from "./flota-real";
import type { Vehiculo } from "./tipos";

/**
 * La flota del Taller: los camiones y acoplados que Rodrigo carga en Camiones, y los choferes de la base.
 *
 * Antes eran 13 vehículos de ejemplo escritos a mano. Lo que no está en la base (cubiertas, services) sigue
 * guardándose en este navegador, por patente. El montacargas no es un camión de la base: queda el de ejemplo.
 */
interface EstadoDeLaFlota {
  flota: Vehiculo[];
  /** Los nombres de los choferes activos, para elegir al cargar un service. */
  choferes: string[];
}

const Contexto = createContext<EstadoDeLaFlota | null>(null);

export function useFlota(): EstadoDeLaFlota {
  const e = useContext(Contexto);
  if (!e) throw new Error("useFlota debe usarse dentro de FlotaProvider");
  return e;
}

export function FlotaProvider({ children }: { children: ReactNode }) {
  const [camiones, setCamiones] = useState<Truck[] | null>(null);
  const [choferes, setChoferes] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setError("");
    // Los choferes son un agregado: si no llegan, se puede escribir el nombre a mano. Los camiones no: sin ellos no hay flota.
    api.get<Driver[]>("/drivers").then((d) => vigente && setChoferes(d)).catch(() => vigente && setChoferes([]));
    api
      .get<Truck[]>("/trucks")
      .then((t) => vigente && setCamiones(t))
      .catch((e) => vigente && setError(mensajeDe(e, "No se pudieron cargar los camiones.")));
    return () => {
      vigente = false;
    };
  }, [intento]);

  const estado = useMemo<EstadoDeLaFlota | null>(() => {
    if (!camiones) return null;
    const asignado = new Map(choferes.filter((d) => d.default_truck_id != null).map((d) => [d.default_truck_id as number, d.name]));
    const reales = camiones.map((c) => vehiculoDeCamion(c, asignado.get(c.id) ?? ""));
    const montacargas = VEHICULOS.filter((v) => v.tipo === "montacargas");
    return {
      flota: [...reales, ...montacargas],
      choferes: choferes.filter((d) => d.status === "activo").map((d) => d.name),
    };
  }, [camiones, choferes]);

  if (error)
    return (
      <p className="border-l-4 border-l-st-redDot bg-st-redBg px-3 py-3 text-sm text-st-redTx">
        {error}{" "}
        <button type="button" onClick={reintentar} className="underline">
          Reintentar
        </button>
      </p>
    );
  if (!estado) return <Spinner size={28} />;
  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}
