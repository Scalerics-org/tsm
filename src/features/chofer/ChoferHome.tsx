import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Trip, TripTemplate } from "@shared/domain";
import { api } from "../../lib/api";
import { Corners, Spinner, StatusBadge } from "../../components/ui";
import { estimateTravel, fmtDuration } from "../../lib/eta";

interface Cliente {
  provider_id: number;
  provider_name: string;
  count: number;
}

export function ChoferHome() {
  const [active, setActive] = useState<Trip | null>(null);
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);

  useEffect(() => {
    api.get<Trip | null>("/trips/active").then(setActive).catch(() => setActive(null));
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Un card por cliente (proveedor).
  const clientes = useMemo<Cliente[]>(() => {
    const map = new Map<number, Cliente>();
    for (const t of templates ?? []) {
      const c = map.get(t.provider_id) ?? {
        provider_id: t.provider_id,
        provider_name: t.provider_name ?? "",
        count: 0,
      };
      c.count += 1;
      map.set(t.provider_id, c);
    }
    return [...map.values()].sort((a, b) => a.provider_name.localeCompare(b.provider_name));
  }, [templates]);

  if (!templates) return <Spinner size={28} />;

  return (
    <div className="space-y-5">
      {active && (
        <Link to={`/viaje/${active.id}`} className="panel block border-l-4 border-l-st-blueDot p-4">
          <Corners />
          <div className="flex items-center justify-between">
            <StatusBadge status={active.status} />
            <span className="font-cond text-sm font-semibold text-brand-700">Continuar →</span>
          </div>
          <div className="mt-2 font-cond text-2xl font-semibold leading-tight text-ink">
            {active.origin} → {active.destination}
            {active.destinatario ? ` (${active.destinatario})` : ""}
          </div>
          <div className="mt-1 text-sm text-ink/60">
            {active.provider_name} · 🚛 {active.truck_plate}
          </div>
          {(() => {
            const e = estimateTravel(active.origin, active.destination);
            if (!e) return null;
            const llegada = new Date(
              (Date.parse(active.started_at.replace(" ", "T") + "Z") || Date.now()) + e.hours * 3_600_000,
            ).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
            return (
              <div className="mt-1 font-cond text-sm font-semibold tracking-[0.04em] text-brand-700">
                🕒 {fmtDuration(e.hours)} · llegada aprox. {llegada}
              </div>
            );
          })()}
        </Link>
      )}

      <div>
        <div className="kicker">{active ? "Otro viaje" : "Elegí el cliente"}</div>
        <h1 className="text-3xl text-ink">Clientes</h1>
      </div>

      {clientes.length === 0 ? (
        <div className="panel p-6 text-center text-ink/50">
          <Corners />
          No hay viajes precargados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {clientes.map((c) => (
            <Link
              key={c.provider_id}
              to={`/cliente/${c.provider_id}`}
              className="panel flex items-center justify-between p-4 transition hover:bg-surface"
            >
              <Corners />
              <div>
                <div className="font-cond text-2xl font-semibold leading-tight text-ink">
                  {c.provider_name}
                </div>
                <div className="mt-0.5 text-sm text-ink/55">
                  {c.count} viaje{c.count === 1 ? "" : "s"}
                </div>
              </div>
              <span className="font-cond text-2xl text-brand-700">→</span>
            </Link>
          ))}
        </div>
      )}

      <Link to="/surtida" className="btn btn-navy w-full py-4 text-lg">
        ⛽ Registrar surtida
      </Link>
    </div>
  );
}
