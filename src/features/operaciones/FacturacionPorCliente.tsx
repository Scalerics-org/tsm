import { useState, type ReactNode } from "react";
import { TRIP_STATUS, nombreDePila, type Trip } from "@shared/domain";
import { clientesDelViaje, estadoPorCliente, type FacturaDeCliente } from "@shared/facturacion-por-cliente";
import { api, ApiError } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { recordarFactura, ultimaFactura } from "./ultima-factura";

/** Lo que pide el diálogo: el campo es texto libre (factura, "S/F" o a quién se le cobra). */
export const TEXTO_FACTURA = "N° de factura, S/F, o a quién se le cobra (por ejemplo SAMAN)";

type ViajePorCliente = Trip & { clientes_facturacion?: FacturaDeCliente[]; factura_quitada?: string | null };

interface Rechazo {
  motivo: string;
}

/** Lo que `ClientePorCarga` dibuja a la derecha de cada renglón: la cajita de Factura y la de Pago. */
export interface Cajitas {
  f: (sid: string) => ReactNode;
  p: (sid: string) => ReactNode;
}

/**
 * La factura y el pago de cada cliente de un viaje, renglón por renglón de la columna Cliente.
 *
 * "Una cajita de Factura y una de Pago AL LADO DE CADA CLIENTE" (Rodrigo, dibujo del 30/9): un viaje puede llevar
 * carga para varios clientes y a cada uno se le factura y se le cobra aparte. La unidad es a quién se le cobra
 * (`cobro_a`): tres cargas de un mismo cliente son una factura y las cajitas van en la primera de ellas. Un
 * renglón "Sin asignar" tiene las cajitas apagadas: sin saber a quién, no hay a quién facturar. Ver
 * docs/FACTURACION-POR-CLIENTE.md.
 *
 * Sólo agrega información, como los tildes de siempre. Tocar la cajita de Factura pide el número (con el último
 * usado de sugerencia) o, si ya está, pregunta antes de sacarla; la de Pago sólo se enciende con factura. Los dos
 * enlaces de abajo ponen un solo número, o un solo pago, a todos los clientes que faltan: sirve cuando se factura
 * o se cobra junto. Para el lector las cajitas se ven pero no se tocan.
 */
export function useFacturacionPorCliente({
  trip,
  soloMirar,
  onCambio,
}: {
  trip: ViajePorCliente;
  soloMirar: boolean;
  onCambio: () => void;
}): { cajitas: Cajitas; pie: ReactNode } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { clientes } = clientesDelViaje(trip.segments);
  const completado = trip.status === TRIP_STATUS.COMPLETADO;
  const marcas = new Map((trip.clientes_facturacion ?? []).map((m) => [m.cliente_clave, m]));
  const facturado = (clave: string) => !!marcas.get(clave)?.factura_numero;
  const pago = (clave: string) => !!marcas.get(clave)?.pago_at;
  const pendientesDeFactura = clientes.filter((c) => !facturado(c.clave));
  const pendientesDePago = clientes.filter((c) => facturado(c.clave) && !pago(c.clave));
  const deLaCarga = new Map(clientes.flatMap((c) => c.sids.map((sid) => [sid, c] as const)));
  const item = (clave: string) => ({ trip_id: trip.id, cliente_clave: clave });

  async function enviar(ruta: string, cuerpo: unknown, falla: string) {
    setError("");
    setBusy(true);
    try {
      const r = await api.post<{ marcados?: number; desmarcados?: number; rechazados?: Rechazo[] }>(ruta, cuerpo);
      // Los que quedaron afuera dicen por qué: no se contesta "0 marcados" en silencio ni se calla el resto.
      const rechazados = r.rechazados ?? [];
      if (rechazados.length) {
        const motivos = [...new Set(rechazados.map((x) => x.motivo))];
        setError(`${rechazados.length} no se ${rechazados.length === 1 ? "marcó" : "marcaron"}: ${motivos.join(" · ")}`);
      }
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
    return enviar("/facturacion/marcar-clientes", { items: [item(clave)], factura_numero: numero }, "No se pudo guardar la factura");
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

  const cajitas: Cajitas = {
    f: (sid) => {
      if (!completado) return null;
      const c = deLaCarga.get(sid);
      if (!c) return <Apagada titulo="Sin asignar: asignale a quién se le cobra para poder facturarla" />;
      if (c.sids[0] !== sid) return null; // las cajitas del cliente van en su primer renglón
      const marca = marcas.get(c.clave);
      const fact = facturado(c.clave);
      return (
        <div>
          <Cajita
            letra="F"
            activa={fact}
            apagada={busy || soloMirar}
            etiqueta={`Factura de ${c.nombre}`}
            titulo={
              fact
                ? `Facturado a ${c.nombre}: ${marca?.factura_numero}.${soloMirar ? "" : " Tocá para sacarla."}`
                : soloMirar
                  ? `${c.nombre}: sin facturar`
                  : `Marcar facturado a ${c.nombre}: número de factura, S/F o a quién se le cobra`
            }
            alTocar={() => alternarFactura(c.clave, c.nombre)}
          />
          {fact && (
            <div
              className={`mt-0.5 w-0 min-w-full truncate text-[11px] ${pago(c.clave) ? "text-st-greenTx" : "text-st-redTx"}`}
              title={marca?.factura_numero ?? ""}
            >
              {marca?.factura_numero}
            </div>
          )}
        </div>
      );
    },
    p: (sid) => {
      if (!completado) return null;
      const c = deLaCarga.get(sid);
      if (!c) return <Apagada titulo="Sin asignar: sin a quién cobrarle no hay nada que cobrar" />;
      if (c.sids[0] !== sid) return null;
      const marca = marcas.get(c.clave);
      const fact = facturado(c.clave);
      const pagado = pago(c.clave);
      const quien = nombreDePila(marca?.pago_by_name);
      return (
        <div>
          <Cajita
            letra="P"
            activa={pagado}
            apagada={busy || soloMirar || !fact}
            etiqueta={`Pago de ${c.nombre}`}
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
          {pagado && quien && (
            <div className="mt-0.5 w-0 min-w-full truncate text-[11px] text-st-greenTx" title={`Marcado por ${marca?.pago_by_name}`}>
              {quien}
            </div>
          )}
        </div>
      );
    },
  };

  const cuentas = estadoPorCliente(trip.segments, trip.clientes_facturacion ?? []);
  const pie = completado ? (
    <div className="mt-1.5 space-y-0.5 px-2 text-[11px]">
      <div className="text-ink/55" title="Cuántos de los clientes de este viaje ya tienen su factura y su pago">
        Factura {cuentas.facturados}/{cuentas.clientes} · Pago {cuentas.pagados}/{cuentas.facturados}
        {cuentas.sinAsignar > 0 && (
          <span className="font-semibold text-st-amberTx">
            {" "}
            · {cuentas.sinAsignar === 1 ? "falta asignar una carga" : `faltan asignar ${cuentas.sinAsignar} cargas`}
          </span>
        )}
      </div>
      {!soloMirar && (pendientesDeFactura.length > 1 || pendientesDePago.length > 1) && (
        <div className="flex flex-wrap gap-x-3">
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
      {error && <div className="max-w-[16rem] text-st-redTx">{error}</div>}
    </div>
  ) : null;

  return { cajitas, pie };
}

/** Una cajita de las dos: la letra mientras está vacía, el tilde cuando está marcada. */
function Cajita({
  letra,
  activa,
  apagada,
  etiqueta,
  titulo,
  alTocar,
}: {
  letra: "F" | "P";
  activa: boolean;
  apagada: boolean;
  /** Fijo, para el lector de pantalla; el estado lo dice `aria-pressed`. */
  etiqueta: string;
  titulo: string;
  alTocar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      disabled={apagada}
      aria-pressed={activa}
      aria-label={etiqueta}
      title={titulo}
      className={`flex h-7 w-7 flex-none items-center justify-center border text-[11px] font-semibold transition disabled:opacity-40 ${
        activa
          ? "border-st-greenDot bg-st-greenDot text-bg"
          : "border-ink/25 text-ink/40 enabled:hover:border-brand enabled:hover:text-ink/70"
      }`}
    >
      {activa ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        letra
      )}
    </button>
  );
}

/** El renglón sin a quién cobrarle: la cajita está, pero no se puede tocar. */
function Apagada({ titulo }: { titulo: string }) {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      className="flex h-7 w-7 flex-none items-center justify-center border border-dashed border-ink/20 text-[11px] text-ink/25"
    >
      –
    </span>
  );
}
