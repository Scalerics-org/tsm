import { useState } from "react";
import { TRIP_STATUS, nombreDePila, type Trip } from "@shared/domain";
import { clientesDelViaje, type FacturaDeCliente } from "@shared/facturacion-por-cliente";
import { api, ApiError } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { recordarFactura, ultimaFactura } from "./ultima-factura";

/** Lo que pide el diálogo: el campo es texto libre (factura, "S/F" o a quién se le cobra). */
const TEXTO_FACTURA = "N° de factura, S/F, o a quién se le cobra (por ejemplo SAMAN)";

type ViajePorCliente = Trip & { clientes_facturacion?: FacturaDeCliente[]; factura_quitada?: string | null };

interface Rechazo {
  motivo: string;
}

/**
 * Las cajitas de factura y de pago de cada cliente de un viaje.
 *
 * "Al lado de cada cliente, una cajita de facturado y otra de pagado": un viaje puede llevar carga para
 * varios clientes y a cada uno se le factura y se le cobra aparte. La unidad es el cliente dentro del
 * viaje (a quién se le cobra), no la carga suelta. Ver docs/FACTURACION-POR-CLIENTE.md.
 *
 * Sólo agrega información, como los tildes de siempre. Tocar una cajita de factura pide el número (con el
 * último usado de sugerencia) o, si ya está, pregunta antes de sacarla; la de pago sólo se enciende con
 * factura. Los dos enlaces de abajo aplican un solo número, o un solo pago, a todos los clientes que
 * faltan: sirve cuando se factura o se cobra junto.
 *
 * Para el lector las cajitas se ven pero no se tocan, igual que los tildes de la lista.
 */
export function FacturacionPorCliente({
  trip,
  soloMirar,
  onCambio,
}: {
  trip: ViajePorCliente;
  soloMirar: boolean;
  onCambio: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { clientes } = clientesDelViaje(trip.segments);
  // Sólo un viaje completado se factura. Con un solo cliente no hace falta duplicar la lista, pero las
  // cajitas son las mismas: facturar el viaje es facturar a ese cliente.
  if (trip.status !== TRIP_STATUS.COMPLETADO || clientes.length === 0) return null;

  const marcas = new Map((trip.clientes_facturacion ?? []).map((m) => [m.cliente_clave, m]));
  const facturado = (clave: string) => !!marcas.get(clave)?.factura_numero;
  const pago = (clave: string) => !!marcas.get(clave)?.pago_at;
  const pendientesDeFactura = clientes.filter((c) => !facturado(c.clave));
  const pendientesDePago = clientes.filter((c) => facturado(c.clave) && !pago(c.clave));

  const item = (clave: string) => ({ trip_id: trip.id, cliente_clave: clave });

  async function enviar(ruta: string, cuerpo: unknown, falla: string) {
    setError("");
    setBusy(true);
    try {
      const r = await api.post<{ marcados?: number; desmarcados?: number; rechazados?: Rechazo[] }>(ruta, cuerpo);
      // Un ítem que quedó afuera dice por qué: no se contesta "0 marcados" en silencio.
      const hechos = (r.marcados ?? 0) + (r.desmarcados ?? 0);
      if (hechos === 0 && r.rechazados?.length) setError(r.rechazados[0].motivo);
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : falla);
    } finally {
      setBusy(false);
    }
  }

  function alternarFactura(clave: string, nombre: string) {
    const marca = marcas.get(clave);
    if (marca?.factura_numero) {
      if (!confirm(`¿Sacarle la factura ${marca.factura_numero} a ${nombre}? Vuelve a quedar sin facturar.`)) return;
      return enviar("/facturacion/desmarcar-clientes", { items: [item(clave)] }, "No se pudo sacar la factura");
    }
    const numero = prompt(`${TEXTO_FACTURA}\n\nCliente: ${nombre}`, ultimaFactura() || marca?.factura_quitada || "")?.trim();
    if (!numero) return;
    recordarFactura(numero);
    return enviar(
      "/facturacion/marcar-clientes",
      { items: [item(clave)], factura_numero: numero },
      "No se pudo guardar la factura",
    );
  }

  function alternarPago(clave: string, nombre: string) {
    if (pago(clave)) {
      if (!confirm(`¿Sacarle el pago a ${nombre}? Sigue facturado, sin cobrar.`)) return;
      return enviar("/facturacion/desmarcar-pagos-clientes", { items: [item(clave)] }, "No se pudo sacar el pago");
    }
    return enviar("/facturacion/marcar-pagos-clientes", { items: [item(clave)] }, "No se pudo guardar el pago");
  }

  function facturarATodos() {
    const numero = prompt(`${TEXTO_FACTURA}\n\nSe le pone a: ${pendientesDeFactura.map((c) => c.nombre).join(", ")}`, ultimaFactura())?.trim();
    if (!numero) return;
    recordarFactura(numero);
    return enviar(
      "/facturacion/marcar-clientes",
      { items: pendientesDeFactura.map((c) => item(c.clave)), factura_numero: numero },
      "No se pudo guardar la factura",
    );
  }

  function pagaronTodos() {
    if (!confirm(`¿Marcar el pago de ${pendientesDePago.map((c) => c.nombre).join(", ")}?`)) return;
    return enviar("/facturacion/marcar-pagos-clientes", { items: pendientesDePago.map((c) => item(c.clave)) }, "No se pudo guardar el pago");
  }

  return (
    <div className="mt-2 border-t border-ink/10 pt-2">
      <ul className="space-y-1.5">
        {clientes.map((c) => {
          const marca = marcas.get(c.clave);
          const fact = facturado(c.clave);
          const pagado = pago(c.clave);
          const quien = nombreDePila(marca?.pago_by_name);
          return (
            <li key={c.clave} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="w-0 min-w-full truncate text-xs text-ink/80" title={c.nombre}>
                  {c.nombre}
                </div>
                {fact && (
                  <div className={`w-0 min-w-full truncate text-[10px] ${pagado ? "text-st-greenTx" : "text-st-redTx"}`} title={marca?.factura_numero ?? ""}>
                    {marca?.factura_numero}
                  </div>
                )}
              </div>
              <Cajita
                letra="F"
                activa={fact}
                apagada={busy || soloMirar}
                titulo={
                  fact
                    ? `Facturado a ${c.nombre}: ${marca?.factura_numero}.${soloMirar ? "" : " Tocá para sacarla."}`
                    : soloMirar
                      ? `${c.nombre}: sin facturar`
                      : `Marcar facturado a ${c.nombre}: número de factura, S/F o a quién se le cobra`
                }
                alTocar={() => alternarFactura(c.clave, c.nombre)}
              />
              <Cajita
                letra="P"
                activa={pagado}
                apagada={busy || soloMirar || !fact}
                titulo={
                  pagado
                    ? `Pago de ${c.nombre}${quien ? ` (marcado por ${marca?.pago_by_name}${marca?.pago_at ? ` el ${fmtDateTime(marca.pago_at)}` : ""})` : ""}.${soloMirar ? "" : " Tocá para sacarlo."}`
                    : !fact
                      ? `${c.nombre}: primero tiene que tener factura, sin eso no hay nada que cobrar`
                      : soloMirar
                        ? `${c.nombre}: sin pagar`
                        : `Marcar el pago de ${c.nombre}`
                }
                alTocar={() => alternarPago(c.clave, c.nombre)}
              />
            </li>
          );
        })}
      </ul>

      {!soloMirar && (pendientesDeFactura.length > 1 || pendientesDePago.length > 1) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
          {pendientesDeFactura.length > 1 && (
            <button type="button" onClick={facturarATodos} disabled={busy} className="text-brand-700 hover:underline disabled:opacity-40">
              facturar a todos
            </button>
          )}
          {pendientesDePago.length > 1 && (
            <button type="button" onClick={pagaronTodos} disabled={busy} className="text-brand-700 hover:underline disabled:opacity-40">
              pagaron todos
            </button>
          )}
        </div>
      )}
      {error && <div className="mt-1 max-w-[11rem] text-[11px] text-st-redTx">{error}</div>}
    </div>
  );
}

/** Una cajita de las dos: la letra mientras está vacía, el tilde cuando está marcada. */
function Cajita({
  letra,
  activa,
  apagada,
  titulo,
  alTocar,
}: {
  letra: "F" | "P";
  activa: boolean;
  apagada: boolean;
  titulo: string;
  alTocar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      disabled={apagada}
      aria-pressed={activa}
      aria-label={titulo}
      title={titulo}
      className={`flex h-6 w-6 flex-none items-center justify-center border text-[10px] font-semibold transition disabled:opacity-40 ${
        activa
          ? "border-st-greenDot bg-st-greenDot text-bg"
          : "border-ink/25 text-ink/35 enabled:hover:border-brand enabled:hover:text-ink/60"
      }`}
    >
      {activa ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        letra
      )}
    </button>
  );
}
