import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fmtConsumo, fmtKilos, type FuelLog, type Trip, type Truck } from "@shared/domain";
import { api } from "../../lib/api";
import { Card, Corners, Spinner, Stat, StatusBadge } from "../../components/ui";
import { SurtidaRow } from "./SurtidaRow";
import { LecturasDelCamion } from "./LecturasDelCamion";
import { fmtDateTime } from "../../lib/format";

interface MonthRow {
  month: string;
  km: number;
  liters: number;
  kml: number | null;
  closed: boolean;
}
interface Ficha {
  truck: Truck;
  trips: Trip[];
  monthly: MonthRow[];
  fuel: FuelLog[];
  tons: number;
}

export function TruckDetailPage() {
  const { id } = useParams();
  const [d, setD] = useState<Ficha | null>(null);

  // Se recarga entera al corregir o borrar una surtida: el consumo y el odómetro del camión
  // se recalculan del lado del servidor, así que refrescar sólo la fila mostraría números
  // viejos justo en la pantalla donde se fue a arreglar un número.
  const load = () => {
    api.get<Ficha>(`/reports/truck/${id}`).then(setD).catch(() => setD(null));
  };
  useEffect(load, [id]);

  if (!d) return <Spinner size={28} />;
  const { truck } = d;

  return (
    <div className="space-y-5">
      <Link to="/panel" className="text-sm text-ink/60 hover:text-ink">
        ← Resumen
      </Link>
      <div>
        <div className="kicker">Camión</div>
        <h1 className="text-3xl text-ink">{truck.plate}</h1>
        <p className="text-sm text-ink/60">
          {truck.brand} {truck.model} · {truck.year} · {truck.type}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Odómetro" value={`${truck.odometer_km.toLocaleString("es-UY")} km`} />
        <Stat label="Rendimiento" value={`${fmtConsumo(truck.avg_km_litro)} km/L`} hint="esperado" />
        <Stat label="Viajes" value={d.trips.length} accent="blue" />
        <Stat label="Kilos" value={fmtKilos(d.tons)} accent="green" />
      </div>

      {d.monthly.length > 0 && (
        <Card>
          <Corners />
          <h2 className="mb-2 font-cond text-lg font-semibold text-ink">Consumo mensual</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {d.monthly.map((m) => (
              <div key={m.month} className="border-l-4 border-l-st-blueDot bg-surface px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                    {m.month}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase ${m.closed ? "text-st-greenTx" : "text-st-amberTx"}`}>
                    {m.closed ? "cerrado" : "en curso"}
                  </span>
                </div>
                <div className="font-cond text-2xl font-semibold text-ink">
                  {m.kml != null ? `${fmtConsumo(m.kml)} km/L` : "—"}
                </div>
                <div className="text-xs text-ink/55">
                  {m.liters} L · {m.km} km
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <Corners />
        <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Últimos viajes</div>
        <table className="w-full min-w-[560px] text-sm">
          <tbody>
            {d.trips.map((t) => (
              <tr key={t.id} className="border-b border-ink/10">
                <td className="px-4 py-2">
                  <Link to={`/panel/viajes/${t.id}`} className="text-ink hover:text-brand-700">
                    {t.origin} → {t.destination}
                  </Link>
                  <div className="text-xs text-ink/50">{t.provider_name} · {t.driver_name}</div>
                </td>
                <td className="px-4 py-2 text-ink/60">{fmtDateTime(t.started_at)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
            {d.trips.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink/50">Sin viajes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <Corners />
        <div className="border-b border-ink/15 px-4 py-3 font-cond text-lg font-semibold text-ink">Surtidas</div>
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-ink/60">
            <tr className="border-b border-ink/15">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Odómetro</th>
              <th className="px-4 py-2 text-right">Litros</th>
              <th className="px-4 py-2">Llenó</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {d.fuel.map((f) => (
              <SurtidaRow key={f.id} f={f} onChanged={load} />
            ))}
            {d.fuel.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-ink/50">Sin surtidas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <LecturasDelCamion truckId={Number(id)} />
    </div>
  );
}
