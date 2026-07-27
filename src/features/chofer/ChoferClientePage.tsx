import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TripTemplate } from "@shared/domain";
import { api } from "../../lib/api";
import { Corners, Spinner } from "../../components/ui";

export function ChoferClientePage() {
  const { providerId } = useParams();
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);

  useEffect(() => {
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  if (!templates) return <Spinner size={28} />;

  const viajes = templates.filter((t) => t.provider_id === Number(providerId));
  const cliente = viajes[0]?.provider_name ?? "Cliente";

  return (
    <div className="space-y-5">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">
        ← Clientes
      </Link>
      <div>
        <div className="kicker">{cliente}</div>
        <h1 className="text-3xl text-ink">Elegí el viaje</h1>
      </div>

      {viajes.length === 0 ? (
        <div className="panel p-6 text-center text-ink/50">
          <Corners />
          Este cliente no tiene viajes activos.
        </div>
      ) : (
        <div className="space-y-3">
          {viajes.map((t) => {
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
      )}
    </div>
  );
}
