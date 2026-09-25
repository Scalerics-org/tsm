import { useEffect, useState } from "react";
import {
  COBRO_TIPO,
  LIBRETA_ESTADO,
  LIBRETA_TIPO,
  type CobroDeCarga,
  type CobroTipo,
  type LibretaEntry,
  type Provider,
  type TripSegment,
} from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { LibretaPicker } from "../../components/LibretaPicker";
import { Button, ErrorText } from "../../components/ui";
import { atajosDeCarga } from "./atajos-cobro";

/** Un cliente de la libreta, o sólo el nombre si el viaje es anterior a que se guardara el id. */
function comoEntrada(nombre: string, id: number | null): LibretaEntry {
  return {
    id: id ?? 0,
    tipo: LIBRETA_TIPO.DESTINATARIO,
    nombre,
    provider_id: null,
    agrupador: false,
    estado: LIBRETA_ESTADO.CONFIRMADO,
    usos: 0,
    created_by: null,
  };
}

/**
 * "¿A quién se le cobra esta carga?" — el diálogo del tick de la columna Cliente.
 *
 * Es un diálogo y no un desplegable dentro de la celda: la tabla tiene scroll propio y un
 * desplegable se recortaría. Lo escribe únicamente la oficina; el chofer no llega acá.
 *
 * Dar de alta un cliente que todavía no está en la libreta es el camino principal, no un
 * extra: los choferes cargan para clientes que no existen todavía, así que cuando la oficina
 * viene a asignar, la mayoría de las veces todavía no está. Por eso el alta vive en el mismo
 * selector, sin salir de acá.
 */
export function CobroDeCargaDialog({
  tripId,
  cobro,
  carga,
  onClose,
  onGuardado,
}: {
  tripId: number;
  cobro: CobroDeCarga;
  carga: TripSegment;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState<CobroTipo>(cobro.tipo ?? COBRO_TIPO.CLIENTE);
  const [cliente, setCliente] = useState<LibretaEntry | null>(
    cobro.nombre && cobro.tipo !== COBRO_TIPO.PROVEEDOR ? comoEntrada(cobro.nombre, cobro.cobroId) : null,
  );
  const [proveedor, setProveedor] = useState(cobro.tipo === COBRO_TIPO.PROVEEDOR ? (cobro.nombre ?? "") : "");
  const [proveedores, setProveedores] = useState<Provider[] | null>(null);
  // Los clientes elegibles con su nombre de HOY. Los atajos y el nombre que ya tenía la carga se
  // muestran con éste y no con el texto que quedó escrito cuando el chofer la cargó.
  const [vigentes, setVigentes] = useState<LibretaEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tipo !== COBRO_TIPO.PROVEEDOR || proveedores) return;
    api
      .get<Provider[]>("/providers")
      .then(setProveedores)
      .catch(() => setProveedores([]));
  }, [tipo, proveedores]);

  useEffect(() => {
    api
      .get<LibretaEntry[]>(`/libreta?tipo=${LIBRETA_TIPO.DESTINATARIO}&seleccionables=1`)
      .then(setVigentes)
      // Sin la lista no hay forma de mostrar el nombre actual: mejor sin atajos que con uno viejo.
      .catch(() => setVigentes([]));
  }, []);

  // Si la carga ya tenía un cliente de la libreta, se muestra con el nombre actual.
  useEffect(() => {
    if (!vigentes || cobro.cobroId == null) return;
    const actual = vigentes.find((e) => e.id === cobro.cobroId);
    if (actual) setCliente((prev) => (prev && prev.id === actual.id ? comoEntrada(actual.nombre, actual.id) : prev));
  }, [vigentes, cobro.cobroId]);

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [onClose]);

  // Atajos: los destinatarios de ESTA carga que están en la libreta. Sólo eligen —no guardan—,
  // y se rotulan como "cobrarle a", porque la palabra "cliente" ya dice otra cosa dos columnas
  // más allá: para quién va la carga. Cobrarle al destinatario es lo habitual, no lo seguro.
  const atajos = vigentes ? atajosDeCarga(carga, vigentes) : [];

  const aQuien = tipo === COBRO_TIPO.CLIENTE ? (cliente?.nombre ?? "") : proveedor;

  async function guardar() {
    if (!aQuien) return setError("Elegí a quién se le cobra.");
    setBusy(true);
    setError("");
    try {
      const cuerpo =
        tipo === COBRO_TIPO.CLIENTE
          ? cliente!.id
            ? { cobro_tipo: tipo, cobro_id: cliente!.id }
            : { cobro_tipo: tipo, cobro_a: cliente!.nombre }
          : { cobro_tipo: tipo, cobro_a: proveedor };
      await api.put(`/trips/${tripId}/segments/${cobro.sid}/cobro`, cuerpo);
      onGuardado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo guardar"));
      setBusy(false);
    }
  }

  async function quitar() {
    setBusy(true);
    setError("");
    try {
      await api.put(`/trips/${tripId}/segments/${cobro.sid}/cobro`, { cobro_tipo: null });
      onGuardado();
    } catch (e) {
      setError(mensajeDe(e, "No se pudo quitar"));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobro-titulo"
        className="w-full max-w-md space-y-4 border border-ink/20 bg-bg p-5 shadow-xl"
      >
        <div>
          <h2 id="cobro-titulo" className="font-cond text-xl font-semibold text-ink">
            ¿A quién se le cobra?
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Carga {cobro.numero} · {cobro.titulo}
          </p>
          <p className="mt-1 text-xs text-ink/50">
            Es a quién se le factura, que puede no ser para quién va la carga.
          </p>
        </div>

        <div className="flex gap-2" role="group" aria-label="Se le cobra a">
          {([COBRO_TIPO.CLIENTE, COBRO_TIPO.PROVEEDOR] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => setTipo(t)}
              className={`flex-1 border px-3 py-2 font-cond text-sm font-semibold uppercase tracking-[0.08em] ${
                tipo === t ? "border-brand bg-brand text-bg" : "border-ink/25 text-ink/70 hover:border-brand"
              }`}
            >
              {t === COBRO_TIPO.CLIENTE ? "Un cliente" : "Un proveedor"}
            </button>
          ))}
        </div>

        {tipo === COBRO_TIPO.CLIENTE ? (
          <div className="space-y-3">
            {atajos.length > 0 && (
              <div>
                <div className="label">Cobrarle a uno de los destinatarios de esta carga</div>
                <div className="flex flex-wrap gap-2">
                  {atajos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setCliente(comoEntrada(a.nombre, a.id))}
                      className={`border px-3 py-1.5 text-sm ${
                        cliente?.id === a.id ? "border-brand bg-brand/10 font-semibold text-ink" : "border-ink/25 text-ink/80 hover:border-brand"
                      }`}
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <LibretaPicker
              tipo={LIBRETA_TIPO.DESTINATARIO}
              label={atajos.length > 0 ? "O cobrarle a otro cliente" : "Cliente"}
              value={cliente}
              onChange={setCliente}
              soloSeleccionables
              permiteAlta
              // Un cliente que se da de alta acá es de cobranza: no le tiene que aparecer a los choferes.
              altaSoloCobro
            />
            <p className="text-xs text-ink/50">
              Si el cliente todavía no está, escribí el nombre y tocá “Agregar”: queda en la libreta.
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="label">Proveedor</span>
            <select className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
              <option value="">{proveedores ? "Elegí…" : "Cargando…"}</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="border-l-4 border-brand bg-surface px-3 py-2 text-sm">
          {aQuien ? (
            <>
              Se le va a cobrar a <strong>{aQuien}</strong>
              <span className="text-ink/50"> ({tipo})</span>
            </>
          ) : (
            <span className="text-ink/50">Todavía no elegiste a quién.</span>
          )}
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex flex-wrap items-center gap-2">
          <Button loading={busy} disabled={!aQuien} onClick={guardar}>
            Guardar
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          {cobro.nombre && (
            <button
              type="button"
              onClick={quitar}
              disabled={busy}
              className="ml-auto text-sm text-st-redTx hover:underline disabled:opacity-40"
              title="Vuelve a lo que digan las reglas de la libreta"
            >
              Quitar la asignación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
