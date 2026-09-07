import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TRIP_STATUS,
  TRIP_STATUS_LABEL,
  type Driver,
  type Provider,
  type Trip,
  type TripStatus,
  type Truck,
} from "@shared/domain";
import { api, downloadFile } from "../../lib/api";
import { Button, Card, Empty, Spinner } from "../../components/ui";
import { FilaViaje } from "./FilaViaje";

export function OpsTripsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [f, setF] = useState({ provider: "", driver: "", truck: "", status: "", from: "", to: "" });
  // Se incrementa cuando una fila cambia algo, para volver a pedir la lista: corregir una
  // fecha puede sacar al viaje del filtro que está puesto, y dejarlo ahí sería mentira.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => {});
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => {});
    api.get<Provider[]>("/providers").then(setProviders).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (f.provider) p.set("provider", f.provider);
    if (f.driver) p.set("driver", f.driver);
    if (f.truck) p.set("truck", f.truck);
    if (f.status) p.set("status", f.status);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [f]);

  useEffect(() => {
    setTrips(null);
    api.get<Trip[]>(`/trips${query}`).then(setTrips).catch(() => setTrips([]));
  }, [query, version]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-ink">Viajes</h1>
        <div className="flex items-center gap-2">
        <Link
          to="/panel/viajes/nuevo"
          className="btn btn-primary"
        >
          + Cargar viaje
        </Link>
        <Button
          variant="secondary"
          onClick={() =>
            downloadFile(`/reports/trips.csv${query}`, f.provider ? `viajes-${f.provider}.csv` : "viajes.csv")
          }
        >
          ⬇ Exportar Excel
        </Button>
        </div>
      </div>

      <Card className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <select className="input" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>
          <option value="">Todos los clientes</option>
          {providers.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}>
          <option value="">Todos los choferes</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
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
        <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </Card>

      {!trips ? (
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
