import { useState } from "react";
import { UNIDAD, type LibretaEntry, type TripSegment, type Unidad } from "@shared/domain";
import { api, mensajeDe } from "../../lib/api";
import { Button, ErrorText, Field } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";

/**
 * La oficina le agrega una carga a un viaje ya cargado.
 *
 * "Cuando le di corregir viaje, en uno que cargaron acá y no ingresaron todos los orígenes de
 * carga, en el Mdeo - BU, no me dejaba agregar otro origen. Cargó en 3 lugares, ingresó dos y
 * no pude ingresarle el tercero." — Rodrigo, 16/9. El servidor ya lo aceptaba
 * (`PUT /trips/:id/segments`); lo que no había era pantalla.
 *
 * Se manda la lista entera: las cargas que ya estaban van tal cual, con su `sid` —de ahí
 * cuelgan sus fotos y su cobro escrito a mano— y la nueva al final. El cobro de la nueva lo
 * resuelven las reglas en el servidor, igual que cuando la carga el chofer.
 */
export function AgregarCargaOficina({
  tripId,
  providerId,
  segments,
  onAgregada,
}: {
  tripId: number;
  providerId: number | null;
  segments: TripSegment[];
  onAgregada: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lugar, setLugar] = useState<LibretaEntry | null>(null);
  const [cliente, setCliente] = useState<LibretaEntry | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<Unidad>(UNIDAD.PALLETS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cerrar = () => {
    setAbierto(false);
    setLugar(null);
    setCliente(null);
    setCantidad("");
    setError("");
  };

  async function guardar() {
    setError("");
    if (!lugar) return setError("Elegí el lugar de carga.");
    setBusy(true);
    try {
      await api.put(`/trips/${tripId}/segments`, {
        segments: [
          ...segments,
          {
            remitente: lugar.nombre,
            remitente_id: lugar.id,
            clientes: cliente ? [cliente.nombre] : [],
            cliente_ids: cliente ? [cliente.id] : [],
            cantidad: cantidad ? Number(cantidad) : null,
            unidad: cantidad ? unidad : null,
          },
        ],
      });
      cerrar();
      onAgregada();
    } catch (e) {
      // El servidor frena el viaje ya facturado y el lugar "Varios": su mensaje dice qué hacer.
      setError(mensajeDe(e, "No se pudo agregar la carga"));
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-brand/40 bg-brand/[.06] py-3 font-cond text-[15px] font-semibold text-brand-700"
      >
        <span className="text-lg leading-none">+</span> {segments.length > 0 ? "Agregar otra carga" : "Agregar carga"}
      </button>
    );
  }

  return (
    <div className="space-y-3 border border-brand/30 bg-brand/[.04] p-3">
      <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
        Carga {segments.length + 1}
      </div>
      <LibretaPicker
        tipo="remitente"
        label="Lugar de carga"
        value={lugar}
        onChange={setLugar}
        providerId={providerId}
        soloSeleccionables
      />
      <LibretaPicker tipo="destinatario" label="Cliente" value={cliente} onChange={setCliente} providerId={providerId} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cantidad">
          <input className="input" type="number" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </Field>
        <Field label="Unidad">
          <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            <option value={UNIDAD.PALLETS}>Pallets</option>
            <option value={UNIDAD.KILOS}>Kilos</option>
          </select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button onClick={guardar} loading={busy}>
          Guardar carga
        </Button>
        <Button variant="ghost" onClick={cerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
