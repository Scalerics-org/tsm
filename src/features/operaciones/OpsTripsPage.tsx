import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TRIP_STATUS,
  TRIP_STATUS_LABEL,
  type Driver,
  type Trip,
  type TripStatus,
  type Truck,
} from "@shared/domain";
import { api } from "../../lib/api";
import { Card, Empty, Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime, fmtKm } from "../../lib/format";

export function OpsTripsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [f, setF] = useState({ driver: "", truck: "", status: "", date: "" });

  useEffect(() => {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => {});
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (f.driver) p.set("driver", f.driver);
    if (f.truck) p.set("truck", f.truck);
    if (f.status) p.set("status", f.status);
    if (f.date) p.set("date", f.date);
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
        <h1 className="text-xl font-bold text-white">Viajes</h1>
        <Link
          to="/panel/viajes/nuevo"
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
        >
          + Nuevo viaje
        </Link>
      </div>

      <Card className="grid gap-3 sm:grid-cols-4">
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
        <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Card>

      {!trips ? (
        <Spinner size={24} />
      ) : trips.length === 0 ? (
        <Empty>No hay viajes con esos filtros.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-slate-400">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3">Ruta</th>
                <th className="px-4 py-3">Chofer</th>
                <th className="px-4 py-3">Camión</th>
                <th className="px-4 py-3">Programado</th>
                <th className="px-4 py-3 text-right">Km</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link to={`/panel/viajes/${t.id}`} className="font-medium text-white hover:text-brand-300">
                      {t.origin} → {t.destination}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{t.driver_name}</td>
                  <td className="px-4 py-3 text-slate-300">{t.truck_plate}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtDateTime(t.scheduled_at)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmtKm(t.distance_km)}</td>
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
