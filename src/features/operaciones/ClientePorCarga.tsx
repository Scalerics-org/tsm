import { useState } from "react";
import { COBRO_TIPO, TRIP_STATUS, cobroPorCarga, type Trip } from "@shared/domain";
import { CobroDeCargaDialog } from "./CobroDeCargaDialog";

/**
 * Cuántos ticks se ven de entrada. Rodrigo habla de dos o tres cargas por viaje y en Otros Viajes
 * ya hubo uno de cuatro: hasta ahí entran sin esconder nada. Del quinto en adelante queda detrás
 * de "+N más", que se abre en la misma fila —las cargas escondidas siguen siendo asignables— y
 * avisa si alguna de las escondidas está sin asignar, para que no se pierda una en silencio.
 */
const TICKS_VISIBLES = 4;

/**
 * La columna Cliente de la lista de Viajes: un tick por carga, uno debajo del otro.
 *
 * "Sería en los viajes de Otros Viajes y Mdeo - BU" (Rodrigo, 25/9): la regla no es una lista de
 * plantillas sino "el viaje tiene cargas", que da exactamente esos dos casos; el que agregue
 * mañana otra plantilla con cargas la tiene sin tocar nada. Los viajes clásicos no tienen cargas
 * y se dibujan como antes, en `FilaViaje`.
 *
 * Tick lleno = ya tiene a quién cobrarle; vacío = sin asignar. Tocarlo abre el diálogo. Está
 * apagado, con la razón en el tooltip, cuando el viaje ya está facturado o cancelado; y para el
 * lector no se puede tocar (la ruta ya lo frena, esto es para que no parezca que anda).
 */
export function ClientePorCarga({
  trip,
  soloMirar,
  onCambio,
}: {
  trip: Trip & { factura_numero?: string | null };
  soloMirar: boolean;
  onCambio: () => void;
}) {
  const cargas = cobroPorCarga(trip);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const motivoApagado = trip.factura_numero
    ? `Ya está en la factura ${trip.factura_numero}. Sacala desde el tick de Factura para cambiar a quién se le cobra.`
    : trip.status === TRIP_STATUS.CANCELADO
      ? "Un viaje cancelado no se factura."
      : soloMirar
        ? "Sólo lectura."
        : null;

  const ocultas = verTodas ? [] : cargas.slice(TICKS_VISIBLES);
  const visibles = verTodas ? cargas : cargas.slice(0, TICKS_VISIBLES);
  const ocultasSinAsignar = ocultas.filter((c) => !c.nombre).length;
  const enDialogo = abierta ? cargas.find((c) => c.sid === abierta) : undefined;
  const segmento = enDialogo ? trip.segments.find((s) => s.sid === enDialogo.sid) : undefined;

  return (
    <>
      <ul className="space-y-1">
        {visibles.map((c) => {
          const asignada = !!c.nombre;
          const detalle = `Carga ${c.numero}: ${c.titulo}. ${
            asignada ? `Se le cobra a ${c.nombre} (${c.tipo ?? COBRO_TIPO.CLIENTE}).` : "Todavía no tiene a quién cobrarle."
          }`;
          return (
            <li key={c.sid}>
              <button
                type="button"
                onClick={() => setAbierta(c.sid)}
                disabled={!!motivoApagado}
                title={motivoApagado ? `${detalle} ${motivoApagado}` : `${detalle} Tocá para cambiarlo.`}
                aria-label={`Carga ${c.numero}, ${asignada ? `se le cobra a ${c.nombre}` : "sin asignar"}`}
                className="flex w-full items-start gap-2 text-left disabled:cursor-default"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center border ${
                    asignada ? "border-brand bg-brand text-bg" : "border-ink/30 text-transparent"
                  } ${motivoApagado ? "" : "hover:border-brand"}`}
                  aria-hidden
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {asignada ? (
                  <span className="min-w-0 max-w-[9rem] text-ink/80">
                    {c.nombre}
                    {c.tipo === COBRO_TIPO.PROVEEDOR && (
                      <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-st-blueTx">prov.</span>
                    )}
                  </span>
                ) : (
                  <span className="whitespace-nowrap italic text-ink/40">Sin asignar</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {ocultas.length > 0 && (
        <button
          type="button"
          onClick={() => setVerTodas(true)}
          className={`mt-1 text-xs hover:underline ${ocultasSinAsignar ? "font-semibold text-st-amberTx" : "text-brand-700"}`}
        >
          +{ocultas.length} más{ocultasSinAsignar ? ` (${ocultasSinAsignar} sin asignar)` : ""}
        </button>
      )}
      {verTodas && cargas.length > TICKS_VISIBLES && (
        <button type="button" onClick={() => setVerTodas(false)} className="mt-1 text-xs text-ink/50 hover:underline">
          ver menos
        </button>
      )}

      {enDialogo && segmento && (
        <CobroDeCargaDialog
          tripId={trip.id}
          cobro={enDialogo}
          carga={segmento}
          onClose={() => setAbierta(null)}
          onGuardado={() => {
            setAbierta(null);
            onCambio();
          }}
        />
      )}
    </>
  );
}
