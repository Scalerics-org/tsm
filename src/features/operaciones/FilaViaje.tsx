import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { TRIP_STATUS, destinoVisible, fmtKilos, type Trip } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Spinner, StatusBadge } from "../../components/ui";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { FechaInput } from "../../components/FechaInput";

/**
 * Una fila de la lista de viajes, con la fecha corregible y el botón de borrar.
 *
 * "Eliminar viajes. Ingresar viajes y cambiar fechas de ingreso." — y señalando ESTA lista.
 * Las dos acciones existían sólo entrando al viaje, de a uno. Acá es donde la oficina mira
 * los viajes de la semana y ve el que está mal, así que es donde tienen que estar.
 *
 * La fecha no es un input siempre visible: con veinte viajes en pantalla, veinte casillas de
 * fecha tapan la lista. Se toca la fecha y ahí se vuelve editable.
 */
/** Lo que la oficina recibe de más en la lista: la marca de facturado. */
export type ViajeDeOficina = Trip & {
  factura_numero?: string | null;
  facturado_at?: string | null;
  factura_quitada?: string | null;
};

/**
 * El último número de factura que se usó, para no volver a tipearlo: una factura suele llevar
 * varios viajes seguidos de la lista. Vive mientras la pestaña esté abierta.
 */
let ultimaFactura = "";

export function FilaViaje({ t, onCambio }: { t: ViajeDeOficina; onCambio: () => void }) {
  // Los filtros de la lista viajan al viaje, para que "← Viajes" vuelva con los mismos.
  const { search } = useLocation();
  const desde = { viajes: search };
  const [editandoFecha, setEditandoFecha] = useState(false);
  // Lo que se está tipeando, separado de lo que está guardado.
  const [borrador, setBorrador] = useState(t.started_at.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /**
   * El tilde de facturado. "No tengo cómo poner un tick, color tipo Excel, a los facturados."
   *
   * Es la MISMA marca que pone Resumen del cliente, con número de factura: si fueran dos
   * marcas distintas, un viaje podría figurar facturado en una pantalla y pendiente en la otra.
   * Por eso pide el número, que viene sugerido con el último que se usó.
   */
  async function alternarFacturado() {
    const facturado = !!t.factura_numero;
    let cuerpo: { trip_ids: number[]; factura_numero?: string };
    if (facturado) {
      if (!confirm(`¿Sacarle la factura ${t.factura_numero} a este viaje? Vuelve a quedar sin facturar.`)) return;
      cuerpo = { trip_ids: [t.id] };
    } else {
      const numero = prompt("Número de la factura", ultimaFactura || t.factura_quitada || "")?.trim();
      if (!numero) return;
      ultimaFactura = numero;
      cuerpo = { trip_ids: [t.id], factura_numero: numero };
    }
    setError("");
    setBusy(true);
    try {
      await api.post(facturado ? "/facturacion/desmarcar" : "/facturacion/marcar", cuerpo);
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la factura");
    } finally {
      setBusy(false);
    }
  }

  async function cambiarFecha(fecha: string) {
    // Una fecha a medio tipear llega como "" o como un año de dos dígitos: no se manda.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha === t.started_at.slice(0, 10)) {
      setBorrador(t.started_at.slice(0, 10));
      return setEditandoFecha(false);
    }
    setError("");
    setBusy(true);
    try {
      await api.patch(`/trips/${t.id}/fecha`, { fecha });
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar la fecha");
    } finally {
      // Se cierra pase lo que pase: si falló, la casilla se quedaba abierta mostrando la
      // fecha que el usuario eligió y que NO se guardó. La fila tiene que mostrar siempre lo
      // que está en la base; el porqué lo dice el mensaje de al lado.
      setEditandoFecha(false);
      setBusy(false);
    }
  }

  /**
   * El aviso dice qué se lleva puesto. Un "¿Seguro?" pelado no deja ver que se están tirando
   * tres renglones cobrables y sus fotos. Cancelar sigue siendo la opción blanda: el viaje
   * queda, marcado, y sale igual de la auditoría y de la facturación.
   */
  async function borrar() {
    const cargas = t.segments.length;
    const detalle = cargas
      ? `Se van a borrar también sus ${cargas} carga${cargas === 1 ? "" : "s"} y sus fotos.`
      : "El viaje no tiene cargas registradas.";
    const enCurso =
      t.status === TRIP_STATUS.EN_CURSO
        ? `\n\nOJO: está EN CURSO. ${t.driver_name ?? "El chofer"} lo tiene abierto y va a perder lo que esté cargando.`
        : "";
    if (
      !confirm(
        `¿Borrar el viaje ${t.origin} → ${destinoVisible(t)} del ${fmtDateTime(t.started_at)}?\n\n${detalle}${enCurso}\n\nEsto no se puede deshacer. Si solo querés dejarlo sin efecto, entrá al viaje y usá Cancelar.`,
      )
    ) {
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.del(`/trips/${t.id}`);
      onCambio();
    } catch (e) {
      // El backend frena el viaje ya facturado. Ese mensaje dice qué hacer, así que se
      // muestra tal cual en la fila y no se traduce a un "no se pudo" genérico.
      setError(e instanceof ApiError ? e.message : "No se pudo borrar el viaje");
      setBusy(false);
    }
  }

  return (
    // Verde tipo Excel en toda la fila: facturado se lee de lejos, sin buscar la columna.
    <tr className={`border-b border-ink/10 ${t.factura_numero ? "bg-st-greenBg hover:bg-st-greenBg/70" : "hover:bg-surface"}`}>
      {/* El número del mes. Tabular para que las unidades queden alineadas entre filas, y
          apagado porque es una referencia: lo que se lee primero es el recorrido. */}
      <td className="px-3 py-3 text-right font-cond tabular-nums text-ink/45">
        {t.numero_mes ?? "—"}
      </td>
      <td className="px-4 py-3">
        <Link to={`/panel/viajes/${t.id}`} state={desde} className="font-medium text-ink hover:text-brand-700">
          {t.origin} → {destinoVisible(t)}
        </Link>
        <div className="text-xs text-ink/50">{t.provider_name}</div>
        {error && <div className="mt-1 max-w-xs text-xs text-st-redTx">{error}</div>}
      </td>
      <td className="px-4 py-3 text-ink/70">{t.driver_name}</td>
      <td className="px-4 py-3 text-ink/70">{t.truck_plate}</td>
      <td className="px-4 py-3 text-right text-ink/70">
        {fmtKilos(t.kilos_carga)}
      </td>
      <td className="px-4 py-3 text-ink/60">
        {editandoFecha ? (
          /* NO se guarda en cada `onChange`. Un input de fecha dispara un cambio por cada
             tramo que se completa: tipeando el día, el navegador ya entrega fechas enteras
             pero equivocadas —incluso del año 0002— y cada una salía como un PATCH. El viaje
             quedaba con una fecha que nadie eligió, la casilla se cerraba sola y el resto de
             lo que estaba tecleando se perdía. Se guarda al salir del campo o con Enter. */
          <FechaInput
            className="input w-36 py-1 text-sm"
            value={borrador}
            autoFocus
            disabled={busy}
            onChange={setBorrador}
            onBlur={() => cambiarFecha(borrador)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setBorrador(t.started_at.slice(0, 10));
                setEditandoFecha(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditandoFecha(true)}
            className="text-left underline decoration-ink/20 decoration-dotted underline-offset-4 hover:text-brand-700 hover:decoration-brand-700"
            title="Tocá para corregir la fecha"
          >
            {fmtDateTime(t.started_at)}
          </button>
        )}
      </td>
      {/* Fecha de descarga: es `finished_at`, o sea cuándo el chofer registró la llegada.
          Un viaje en curso todavía no la tiene, y ahí el guión es el dato: dice que sigue
          abierto. Va sin hora porque al lado de la salida lo que se compara son los días. */}
      <td className="px-4 py-3 text-ink/60">
        {t.finished_at ? fmtDate(t.finished_at) : <span className="text-ink/30">—</span>}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={t.status} />
      </td>
      <td className="px-4 py-3">
        {t.status === TRIP_STATUS.COMPLETADO || t.factura_numero ? (
          <button
            type="button"
            onClick={alternarFacturado}
            disabled={busy}
            aria-pressed={!!t.factura_numero}
            title={t.factura_numero ? `Factura ${t.factura_numero}. Tocá para sacarla.` : "Marcar como facturado"}
            className={`flex h-6 w-6 items-center justify-center border transition disabled:opacity-40 ${
              t.factura_numero
                ? "border-st-greenDot bg-st-greenDot text-bg"
                : "border-ink/25 text-transparent hover:border-brand hover:text-ink/25"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          // En curso o cancelado: todavía no hay nada que facturar.
          <span className="text-ink/30" title="Sólo se factura un viaje completado">—</span>
        )}
        {t.factura_numero && <div className="mt-1 text-[11px] text-st-greenTx">{t.factura_numero}</div>}
      </td>
      <td className="px-4 py-3 text-right">
        {/* Corregir va acá, en Acciones, y no sólo adentro de la ficha: la oficina revisa la
            lista y corrige de a varios, así que mandarla a abrir el viaje para recién ahí
            encontrar el botón es un paso de más en cada corrección. Lleva a la ficha con la
            edición ya abierta — el formulario vive allá, no se duplica. */}
        <div className="flex items-center justify-end gap-3">
          <Link
            to={`/panel/viajes/${t.id}?editar=1`}
            state={desde}
            className="text-sm text-brand-700 hover:underline"
          >
            Corregir
          </Link>
          <button
            type="button"
            onClick={borrar}
            disabled={busy}
            className="text-sm text-st-redTx hover:underline disabled:opacity-40"
          >
            {busy ? <Spinner size={12} /> : "Borrar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
