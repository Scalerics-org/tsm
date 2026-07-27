import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Trip, TripTemplate } from "@shared/domain";
import { api } from "../../lib/api";
import { Corners, Spinner, StatusBadge } from "../../components/ui";

export function ChoferHome() {
  const [active, setActive] = useState<Trip | null>(null);
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);

  useEffect(() => {
    api.get<Trip | null>("/trips/active").then(setActive).catch(() => setActive(null));
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Agrupar por cliente (proveedor).
  const byProvider = useMemo(() => {
    const map = new Map<string, TripTemplate[]>();
    for (const t of templates ?? []) {
      const list = map.get(t.provider_name ?? "") ?? [];
      list.push(t);
      map.set(t.provider_name ?? "", list);
    }
    return [...map.entries()];
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
        </Link>
      )}

      <div>
        <div className="kicker">{active ? "Otro viaje" : "Elegí tu viaje"}</div>
        <h1 className="text-3xl text-ink">¿Qué viaje vas a hacer?</h1>
      </div>

      {byProvider.length === 0 ? (
        <div className="panel p-6 text-center text-ink/50">
          <Corners />
          No hay viajes precargados todavía.
        </div>
      ) : (
        <div className="space-y-5">
          {byProvider.map(([provider, list]) => (
            <div key={provider} className="space-y-2">
              <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                {provider}
              </div>
              {list.map((t) => {
                const destinos = [...new Set(t.dest_options.map((o) => o.destino))].join(" · ");
                return (
                  <Link
                    key={t.id}
                    to={`/viaje/nuevo/${t.id}`}
                    className="panel block p-4 transition hover:bg-surface"
                  >
                    <Corners />
                    <div className="font-cond text-xl font-semibold leading-tight text-ink">{t.name}</div>
                    <div className="mt-1 text-sm text-ink/60">
                      {t.origin} → {destinos || "destino a elegir"}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Link to="/surtida" className="btn btn-navy w-full py-4 text-lg">
        ⛽ Registrar surtida
      </Link>
    </div>
  );
}
