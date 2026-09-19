import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  DRIVER_STATUS,
  TRIP_STATUS,
  TRIP_STATUS_LABEL,
  type Driver,
  type Provider,
  type TripTemplate,
  type TripStatus,
  type Truck,
} from "@shared/domain";
import { api, downloadFile, mensajeDe } from "../../lib/api";
import { Button, Card, Empty, ErrorDeCarga, ErrorText, Spinner } from "../../components/ui";
import { FilaViaje, type ViajeDeOficina } from "./FilaViaje";
import { FechaInput } from "../../components/FechaInput";
import { useSoloMirar } from "../../lib/auth";
import { AvisosCard } from "./AvisosCard";

export function OpsTripsPage() {
  // El "solo mirar" no carga viajes ni corrige nada: acá sólo se le sacan los botones. El
  // freno de verdad está en el servidor (`api/lib/permisos-lector.ts`).
  const soloMirar = useSoloMirar();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [clientes, setClientes] = useState<{ nombre: string; cobra: boolean; soloCarga: boolean }[]>([]);
  const [plantillas, setPlantillas] = useState<TripTemplate[]>([]);
  const [trips, setTrips] = useState<ViajeDeOficina[] | null>(null);
  /**
   * Los filtros viven en la dirección de la página, no en memoria.
   *
   * "Cuando aplicás un filtro, entrás a mirar un viaje y salís para atrás, vuelve todo para
   * atrás. Estaría bueno que te deje donde estabas trabajando." — Rodrigo, 16/9. En memoria se
   * perdían al entrar al viaje; en la dirección, volver atrás los trae tal cual, y además una
   * lista filtrada se puede recargar o mandar por link.
   */
  const [params, setParams] = useSearchParams();
  const f = useMemo(() => {
    const leer = (k: string) => params.get(k) ?? "";
    return {
      provider: leer("provider"),
      cliente: leer("cliente"),
      plantilla: leer("plantilla"),
      facturado: leer("facturado"),
      driver: leer("driver"),
      truck: leer("truck"),
      status: leer("status"),
      from: leer("from"),
      to: leer("to"),
    };
  }, [params]);
  // `replace`: cambiar un filtro no suma una entrada al historial, así "atrás" sale de Viajes
  // en vez de ir deshaciendo filtro por filtro.
  const setF = (nuevo: typeof f) =>
    setParams(
      Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== "")),
      { replace: true },
    );
  // Se incrementa cuando una fila cambia algo, para volver a pedir la lista: corregir una
  // fecha puede sacar al viaje del filtro que está puesto, y dejarlo ahí sería mentira.
  const [version, setVersion] = useState(0);

  // Los tres desplegables de filtros. Si no llegan quedan vacíos, y un filtro vacío se lee
  // como "no hay choferes" en vez de "no cargó".
  const [filtrosFalló, setFiltrosFalló] = useState("");
  useEffect(() => {
    const falla = (e: unknown) =>
      setFiltrosFalló(mensajeDe(e, "No se pudieron cargar las opciones de los filtros."));
    api.get<Driver[]>("/drivers").then(setDrivers).catch(falla);
    api.get<Truck[]>("/trucks").then(setTrucks).catch(falla);
    api.get<Provider[]>("/providers").then(setProviders).catch(falla);
    api.get<{ nombre: string; cobra: boolean; soloCarga: boolean }[]>("/trips/clientes").then(setClientes).catch(falla);
    api.get<TripTemplate[]>("/templates").then(setPlantillas).catch(falla);
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (f.provider) p.set("provider", f.provider);
    if (f.cliente) p.set("cliente", f.cliente);
    if (f.plantilla) p.set("plantilla", f.plantilla);
    if (f.facturado) p.set("facturado", f.facturado);
    if (f.driver) p.set("driver", f.driver);
    if (f.truck) p.set("truck", f.truck);
    if (f.status) p.set("status", f.status);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [f]);

  const [falló, setFalló] = useState<string | null>(null);
  useEffect(() => {
    // `vigente`: al tocar varios filtros seguidos, la respuesta de uno viejo puede llegar
    // después que la del último y pisarla, y la tabla mostraría viajes de otro filtro.
    let vigente = true;
    setTrips(null);
    setFalló(null);
    api
      .get<ViajeDeOficina[]>(`/trips${query}`)
      .then((t) => vigente && setTrips(t))
      .catch((e) => vigente && setFalló(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, [query, version]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-ink">Viajes</h1>
        <div className="flex items-center gap-2">
        {!soloMirar && (
          <Link
            to="/panel/viajes/nuevo"
            className="btn btn-primary"
          >
            + Cargar viaje
          </Link>
        )}
        {/* Exportar queda: bajarse el Excel de lo que está mirando no cambia ningún dato. */}
        <Button
          variant="secondary"
          onClick={() =>
            downloadFile(
              `/reports/trips.csv${query}`,
              f.cliente ? `viajes-${f.cliente}.csv` : f.provider ? `viajes-${f.provider}.csv` : "viajes.csv",
            )
          }
        >
          ⬇ Exportar Excel
        </Button>
        </div>
      </div>

      <Card className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {/* Éste lista los VIAJES ("Montevideo - BU", "UAM"). Decía "Todos los clientes" y por
            eso Rodrigo buscaba ahí a Armco o a Agronorte, que van adentro de un viaje. */}
        {/* Cambiar de viaje borra el tipo: un TYCSUR elegido no tiene sentido en UAM. */}
        <select className="input" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value, plantilla: "" })}>
          <option value="">Todos los viajes</option>
          {providers.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        {/* "Los internacionales son 3 clientes diferentes y tengo que entrar a cada viaje para ver
            cuál es" (Rodrigo, 18/9). El tipo de viaje adentro del elegido, si tiene más de uno. */}
        {plantillas.filter((t) => t.provider_name === f.provider).length > 1 && (
          <select className="input" value={f.plantilla} onChange={(e) => setF({ ...f, plantilla: e.target.value })}>
            <option value="">Todos los tipos</option>
            {plantillas
              .filter((t) => t.provider_name === f.provider)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.active ? "" : " (desactivado)"}
                </option>
              ))}
          </select>
        )}
        {/* "Todos los clientes que están en el viaje Mdeo–Bella Unión, esos son clientes a
            cobrar, y no puedo filtrarlos." Busca adentro de las cargas: para quién va y a quién
            se le cobra. */}
        <select className="input" value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })}>
          <option value="">Todos los clientes</option>
          <optgroup label="Se les cobra">
            {clientes.filter((c) => c.cobra).map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </optgroup>
          <optgroup label="Clientes de las cargas">
            {clientes.filter((c) => !c.cobra && !c.soloCarga).map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </optgroup>
          {/* Dónde cargó: en "Otros Viajes" es lo único que distingue un viaje de otro. */}
          <optgroup label="Lugares de carga">
            {clientes.filter((c) => c.soloCarga).map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </optgroup>
        </select>
        <select className="input" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}>
          <option value="">Todos los choferes</option>
          {/* Los inactivos siguen acá: sus viejos viajes se filtran por chofer igual que los
              demás. Sólo se los marca, para saber a quién se está filtrando. */}
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.status === DRIVER_STATUS.INACTIVO ? " (inactivo)" : ""}
            </option>
          ))}
        </select>
        <select className="input" value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value })}>
          <option value="">Todos los camiones</option>
          {trucks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.plate}
            </option>
          ))}
        </select>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Todos los estados</option>
          {Object.values(TRIP_STATUS).map((s) => (
            <option key={s} value={s}>
              {TRIP_STATUS_LABEL[s as TripStatus]}
            </option>
          ))}
        </select>
        <select className="input" value={f.facturado} onChange={(e) => setF({ ...f, facturado: e.target.value })}>
          <option value="">Facturados y no</option>
          <option value="si">Facturados</option>
          <option value="no">Sin facturar</option>
        </select>
        <FechaInput value={f.from} onChange={(iso) => setF({ ...f, from: iso })} />
        <FechaInput value={f.to} onChange={(iso) => setF({ ...f, to: iso })} />
      </Card>

      {/* "Para que le llegue la notificación y listo": el interruptor de los avisos vive en
          Resumen, que el lector no ve. Si no estuviera acá no tendría dónde prenderlos, que es
          la mitad de lo que Rodrigo pidió. Los demás lo siguen teniendo en Resumen, uno solo. */}
      {soloMirar && <AvisosCard />}

      <ErrorText>{filtrosFalló}</ErrorText>

      {falló ? (
        <ErrorDeCarga
          titulo="No se pudieron cargar los viajes."
          mensaje={falló}
          onReintentar={() => setVersion((v) => v + 1)}
        />
      ) : !trips ? (
        <Spinner size={24} />
      ) : trips.length === 0 ? (
        <Empty>No hay viajes con esos filtros.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-ink/60">
              <tr className="border-b border-ink/15">
                {/* El N° es del mes: reinicia en 1 cada mes. Va primero y angosto porque es
                    para leerlo de un vistazo y para nombrar un viaje por teléfono. */}
                <th className="px-3 py-3 text-right">N°</th>
                <th className="px-4 py-3">Proveedor / Ruta</th>
                <th className="px-4 py-3">Chofer</th>
                <th className="px-4 py-3">Camión</th>
                {/* Decía "Ton" y la celda muestra kilos desde la migración 0039. */}
                <th className="px-4 py-3 text-right">Kilos</th>
                <th className="px-4 py-3">Salida</th>
                <th className="px-4 py-3">Descarga</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Facturado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <FilaViaje key={t.id} t={t} onCambio={() => setVersion((v) => v + 1)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
