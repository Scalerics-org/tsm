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
import { Button, Card, Empty, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

export function OpsTripsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [f, setF] = useState({ provider: "", driver: "", truck: "", status: "", from: "", to: "" });

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
  }, [query]);

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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-ink/60">
              <tr className="border-b border-ink/15">
                <th className="px-4 py-3">Proveedor / Ruta</th>
                <th className="px-4 py-3">Chofer</th>
                <th className="px-4 py-3">Camión</th>
                <th className="px-4 py-3 text-right">Ton</th>
                <th className="px-4 py-3">Salida</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-ink/10 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link to={`/panel/viajes/${t.id}`} className="font-medium text-ink hover:text-brand-700">
                      {t.origin} → {t.destination}
                    </Link>
                    <div className="text-xs text-ink/50">{t.provider_name}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{t.driver_name}</td>
                  <td className="px-4 py-3 text-ink/70">{t.truck_plate}</td>
                  <td className="px-4 py-3 text-right text-ink/70">
                    {t.weight_tons != null ? `${t.weight_tons} t` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{fmtDateTime(t.started_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
