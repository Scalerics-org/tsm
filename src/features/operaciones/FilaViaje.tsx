import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  TRIP_STATUS,
  cargasSinDescarga,
  descargasSinBoleta,
  sinFotoDeLlegada,
  clienteDelViaje,
  destinoVisible,
  estadoDeCobro,
  fmtKilos,
  origenVisible,
  recorridoVisible,
  type Trip,
} from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Spinner, StatusBadge } from "../../components/ui";
import { fmtDateTime, fmtRangoDeDias } from "../../lib/format";
import { ClientePorCarga } from "./ClientePorCarga";
import { FechaInput } from "../../components/FechaInput";
import { useSoloMirar } from "../../lib/auth";

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
  /** Cuándo se cobró. Sólo tiene sentido con factura o referencia. */
  pago_at?: string | null;
};

/**
 * El último número de factura que se usó, para no volver a tipearlo: una factura suele llevar
 * varios viajes seguidos de la lista. Vive mientras la pestaña esté abierta.
 */
let ultimaFactura = "";

/**
 * Lo que pide el diálogo, y cómo se llama la columna. El campo es texto libre y la oficina lo usa
 * para dos cosas: el número de la factura, o —cuando el viaje se arregla sin factura— a quién le
 * corresponde pagarlo ("SAMAN"), o "S/F". Cualquiera de las tres lo deja como facturado.
 */
const TEXTO_FACTURA = "N° de factura, S/F, o a quién se le cobra (por ejemplo SAMAN)";

const COLOR_DE_FILA: Record<ReturnType<typeof estadoDeCobro>, string> = {
  sin_facturar: "hover:bg-surface",
  facturado: "bg-st-redBg hover:bg-st-redBg/70",
  pago: "bg-st-greenBg hover:bg-st-greenBg/70",
};

export function FilaViaje({
  t,
  onCambio,
}: {
  t: ViajeDeOficina;
  onCambio: () => void;
}) {
  // "Vaya que toque un dedazo y borre algo jajaja." La fila es justo donde estaba el riesgo:
  // la fecha se corrige tocándola, y Borrar es un renglón de texto al lado de Corregir.
  const soloMirar = useSoloMirar();
  // Los filtros de la lista viajan al viaje, para que "← Viajes" vuelva con los mismos.
  const { search } = useLocation();
  const desde = { viajes: search };
  const [editandoFecha, setEditandoFecha] = useState(false);
  // Lo que se está tipeando, separado de lo que está guardado.
  const [borrador, setBorrador] = useState(t.started_at.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const estado = estadoDeCobro(t);
  const cliente = clienteDelViaje(t);
  const sinDescarga = cargasSinDescarga(t);
  const sinBoleta = descargasSinBoleta(t);
  const rango = fmtRangoDeDias(t.started_at, t.finished_at);
  // Si no hay lugar, el rango parte después de la flecha ("24/09 →" / "25/09") y no en el medio
  // de una fecha: la columna llega a ser la mitad de ancha y la tabla entra en el monitor de 1280.
  const rangoEnDosLineas = rango.corto.replace(" → ", " → ");

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
      const numero = prompt(TEXTO_FACTURA, ultimaFactura || t.factura_quitada || "")?.trim();
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

  /**
   * El tilde de pago: "cuando paguen le pongo sí en otro tick y queda en verde". Sólo agrega
   * información: no toca la factura. Sin factura o referencia no hay nada que cobrar, y el tilde
   * queda apagado.
   */
  async function alternarPago() {
    const pago = estado === "pago";
    if (pago && !confirm(`¿Sacarle el pago a este viaje? Sigue facturado (${t.factura_numero}), sin cobrar.`)) return;
    setError("");
    setBusy(true);
    try {
      await api.post(pago ? "/facturacion/desmarcar-pago" : "/facturacion/marcar-pago", { trip_ids: [t.id] });
      onCambio();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el pago");
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
        `¿Borrar el viaje ${origenVisible(t)} → ${destinoVisible(t)} del ${fmtDateTime(t.started_at)}?\n\n${detalle}${enCurso}\n\nEsto no se puede deshacer. Si solo querés dejarlo sin efecto, entrá al viaje y usá Cancelar.`,
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
    // Los tres colores del Excel: blanco sin facturar, rojo facturado y sin cobrar, verde
    // facturado y pago. Se lee de lejos, sin buscar la columna; y sin el color, el tilde de
    // Facturado y el de Pago dicen lo mismo.
    <tr className={`border-b border-ink/10 ${COLOR_DE_FILA[estado]}`}>
      {/* El número del mes. Tabular para que las unidades queden alineadas entre filas, y
          apagado porque es una referencia: lo que se lee primero es el recorrido. */}
      <td className="px-3 py-3 text-right font-cond tabular-nums text-ink/45">
        {t.numero_mes ?? "—"}
      </td>
      <td className="px-3 py-3">
        <Link to={`/panel/viajes/${t.id}`} state={desde} className="font-medium text-ink hover:text-brand-700">
          {recorridoVisible(t)}
        </Link>
        <div className="text-xs text-ink/50">
          {t.provider_name}
          {/* El tipo de viaje, para no tener que entrar: "Internacional TYCSUR". Sólo si dice
              algo más que el cliente. */}
          {t.template_name && t.template_name !== t.provider_name && (
            <span className="text-ink/40"> · {t.template_name}</span>
          )}
        </div>
        {/* Las cargas, para identificar el viaje sin entrar: en "Otros Viajes" todos dicen
            Montevideo → Artigas y lo que cambia es qué se cargó y para quién (Rodrigo, 19/9). */}
        {t.segments.length > 0 && (
          <div className="mt-0.5 w-0 min-w-full truncate text-xs text-ink/45" title={resumenCargas(t)}>
            {resumenCargas(t)}
          </div>
        )}
        {sinDescarga > 0 && (
          <div
            className="mt-0.5 text-[11px] font-semibold text-st-amberTx"
            title="El chofer cerró el viaje sin saber dónde descargó. Se completa desde la ficha del viaje, en Corregir lugares."
          >
            falta dónde descargó {sinDescarga === 1 ? "una carga" : `${sinDescarga} cargas`}
          </div>
        )}
        {sinFotoDeLlegada(t) && (
          <div
            className="mt-0.5 text-[11px] font-semibold text-st-amberTx"
            title="El chofer no pudo sacar la foto de llegada. Hay que pedírsela."
          >
            falta la foto de llegada
          </div>
        )}
        {sinBoleta > 0 && (
          <div
            className="mt-0.5 text-[11px] font-semibold text-st-amberTx"
            title="El chofer no pudo sacar la boleta de la descarga. Hay que pedírsela."
          >
            falta la boleta de {sinBoleta === 1 ? "un lugar" : `${sinBoleta} lugares`}
          </div>
        )}
        {error && <div className="mt-1 max-w-xs text-xs text-st-redTx">{error}</div>}
      </td>
      <td className="min-w-[7.5rem] px-3 py-3 text-ink/70">
        <div>{t.driver_name}</div>
        <div className="text-xs text-ink/50">{t.truck_plate}</div>
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right text-ink/70">
        {fmtKilos(t.kilos_carga)}
      </td>
      {/* Salida y descarga en una sola columna: al lado de la salida lo que se compara son los
          días, así que va "24/09 → 25/09" y la fecha con hora completa en el tooltip. Un viaje
          en curso todavía no tiene descarga: no lleva flecha. Se sigue tocando para corregir la salida. */}
      <td className="px-3 py-3 text-ink/60">
        {soloMirar ? (
          <span title={rango.detalle}>{rangoEnDosLineas}</span>
        ) : editandoFecha ? (
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
            title={`${rango.detalle}
Tocá para corregir la fecha`}
          >
            {rangoEnDosLineas}
          </button>
        )}
      </td>
      <td className="px-2 py-3">
        <StatusBadge status={t.status} compacto />
      </td>
      {/* A quién se le cobra. Junto a Factura y Pago, que es lo que la oficina mira de corrido.
          Los viajes con cargas llevan un tick por carga y ahí la oficina asigna a quién cobrarle
          (Rodrigo, 25/9); los clásicos, sin cargas, se ven como siempre: sólo el nombre. */}
      <td className="px-2 py-3">
        {t.segments.length > 0 ? (
          <ClientePorCarga trip={t} soloMirar={soloMirar} onCambio={onCambio} />
        ) : (
          <>
            {cliente.nombres.length > 0 ? (
              <div className="max-w-[10rem] text-ink/80" title={cliente.todos.join(", ")}>
                {/* Hasta dos nombres, uno debajo del otro: con un "+1" se veía sólo el primero y
                    podía tapar al cliente que importa. Recién desde el tercero aparece el "+N". */}
                {cliente.nombres.map((n) => (
                  <div key={n}>{n}</div>
                ))}
                {cliente.mas > 0 && <div className="text-ink/45">+{cliente.mas}</div>}
              </div>
            ) : (
              <span className="whitespace-nowrap italic text-ink/40" title="Todavía no hay a quién cobrarle este viaje">
                Sin asignar
              </span>
            )}
            {cliente.nombres.length > 0 && cliente.faltaAsignar && (
              <div className="mt-0.5 text-[11px] font-semibold text-st-amberTx">falta asignar una carga</div>
            )}
          </>
        )}
      </td>
      <td className="px-2 py-3">
        {/* El tilde se SIGUE VIENDO para el lector —es la mitad de lo que se mira en esta
            lista— pero apagado: mirar qué está facturado sí, cambiarlo no. */}
        {t.status === TRIP_STATUS.COMPLETADO || t.factura_numero ? (
          <button
            type="button"
            onClick={alternarFacturado}
            disabled={busy || soloMirar}
            aria-pressed={!!t.factura_numero}
            title={
              t.factura_numero
                ? `${t.factura_numero}.${soloMirar ? "" : " Tocá para sacarla."}`
                : soloMirar
                  ? "Sin facturar"
                  : "Marcar como facturado: número de factura, S/F o a quién se le cobra"
            }
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
        {t.factura_numero && (
          <div className={`mt-1 text-[11px] ${estado === "pago" ? "text-st-greenTx" : "text-st-redTx"}`}>{t.factura_numero}</div>
        )}
      </td>
      {/* El tilde de pago, en su propia columna. Apagado mientras el viaje no tenga factura o
          referencia, y para el lector: mirar qué está cobrado sí, cambiarlo no. */}
      <td className="px-2 py-3">
        {t.factura_numero ? (
          <button
            type="button"
            onClick={alternarPago}
            disabled={busy || soloMirar}
            aria-pressed={estado === "pago"}
            title={
              estado === "pago"
                ? `Pago.${soloMirar ? "" : " Tocá para sacarlo."}`
                : soloMirar
                  ? "Sin pagar"
                  : "Marcar como pago"
            }
            className={`flex h-6 w-6 items-center justify-center border transition disabled:opacity-40 ${
              estado === "pago"
                ? "border-st-greenDot bg-st-greenDot text-bg"
                : "border-ink/25 text-transparent hover:border-brand hover:text-ink/25"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="text-ink/30" title="Primero tiene que tener factura o referencia: sin eso no hay nada que cobrar">
            —
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {soloMirar ? (
          <span className="text-ink/30">—</span>
        ) : (
          <>
          {/* Corregir va acá, en Acciones, y no sólo adentro de la ficha: la oficina revisa la
              lista y corrige de a varios, así que mandarla a abrir el viaje para recién ahí
              encontrar el botón es un paso de más en cada corrección. Lleva a la ficha con la
              edición ya abierta — el formulario vive allá, no se duplica. */}
          {/* Íconos con nombre accesible y tooltip. Borrar va separado por una raya y con aire:
              no puede quedar pegado a Corregir, un toque de más borra un viaje. */}
          <div className="flex items-center justify-end">
            <Link
              to={`/panel/viajes/${t.id}?editar=1`}
              state={desde}
              title="Corregir"
              aria-label="Corregir el viaje"
              className="flex h-8 w-7 items-center justify-center text-brand-700 hover:bg-brand/10"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" />
              </svg>
            </Link>
            <span className="mx-1.5 h-5 w-px bg-ink/15" aria-hidden />
            <button
              type="button"
              onClick={borrar}
              disabled={busy}
              title="Borrar"
              aria-label="Borrar el viaje"
              className="flex h-8 w-7 items-center justify-center text-st-redTx hover:bg-st-redTx/10 disabled:opacity-40"
            >
              {busy ? (
                <Spinner size={12} />
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
                </svg>
              )}
            </button>
          </div>
          </>
        )}
      </td>
    </tr>
  );
}

/** "Maccio → La Estancia · ISUSA → Tomás Gomensoro": las cargas del viaje en una línea. */
function resumenCargas(t: Trip): string {
  return t.segments
    .map((c) => `${c.remitente}${c.clientes.length ? ` → ${c.clientes.join(", ")}` : ""}`)
    .join(" · ");
}
