import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TripTemplate } from "@shared/domain";
import { api } from "../../lib/api";
import { Corners, Spinner } from "../../components/ui";

export function ChoferClientePage() {
  const { providerId } = useParams();
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);
  // Un corte de señal no es "este cliente no tiene viajes": se dice distinto y se puede reintentar.
  const [falló, setFalló] = useState(false);
  const cargarPlantillas = () => {
    setFalló(false);
    api
      .get<TripTemplate[]>("/templates")
      .then(setTemplates)
      .catch(() => {
        setTemplates([]);
        setFalló(true);
      });
  };

  useEffect(cargarPlantillas, []);

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
          {falló ? (
            <span className="text-st-redTx">
              No se pudo cargar la lista de viajes. Puede ser la señal.{" "}
              <button type="button" onClick={cargarPlantillas} className="underline">
                Reintentar
              </button>
            </span>
          ) : (
            "Este cliente no tiene viajes activos."
          )}
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
                {/* El recorrido, sólo cuando dice algo que el nombre no diga ya. "Mdeo →
                    destino a elegir" debajo de "Viaje Mdeo - Bella Unión" no informaba nada:
                    el destino está en el título, y "a elegir" es lo que pasa en todos. */}
                {destinos && (
                  <div className="mt-1 text-sm text-ink/60">
                    {t.origin ? `${t.origin} → ${destinos}` : destinos}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
