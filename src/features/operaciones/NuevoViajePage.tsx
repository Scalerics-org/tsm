import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UNIDAD, type Driver, type LibretaEntry, type TripTemplate, type Unidad } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";
import { FechaInput } from "../../components/FechaInput";

interface TruckOption {
  id: number;
  plate: string;
}

/** Una carga del viaje que la oficina está cargando a mano. */
interface CargaForm {
  lugar: LibretaEntry | null;
  cliente: LibretaEntry | null;
  cantidad: string;
  unidad: Unidad;
}

const cargaVacia = (): CargaForm => ({ lugar: null, cliente: null, cantidad: "", unidad: UNIDAD.PALLETS });

/**
 * Cargar un viaje a mano desde oficina.
 *
 * "Borrar viajes o agregar viajes desde oficina, para posibles correcciones." Es para el
 * viaje que se hizo pero no quedó registrado — el chofer se olvidó, se quedó sin batería, o
 * pasó antes de que existiera la app.
 *
 * Nace COMPLETADO y con la fecha que se indique: no es un viaje que arranca ahora, es uno
 * que ya pasó. Por eso tampoco se le piden las fotos — no hubo app en el momento, que es
 * justamente el motivo por el que se está cargando así.
 */
export function NuevoViajePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TripTemplate[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<TruckOption[]>([]);

  const [templateId, setTemplateId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [kilometros, setKilometros] = useState("");
  const [cargas, setCargas] = useState<CargaForm[]>([cargaVacia()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(() => setTemplates([]));
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
    api.get<TruckOption[]>("/trucks/options").then(setTrucks).catch(() => setTrucks([]));
  }, []);

  const tpl = templates?.find((t) => String(t.id) === templateId) ?? null;

  // Al elegir la plantilla se precargan su origen y su destino habitual: es lo que evita
  // retipear en el 90% de los casos, y sigue siendo editable para el que no encaja.
  function elegirPlantilla(id: string) {
    setTemplateId(id);
    const t = templates?.find((x) => String(x.id) === id);
    if (!t) return;
    setOrigen(t.origin ?? "");
    const primera = t.dest_options?.[0];
    if (primera) {
      setDestino(primera.destino);
      setDestinatario(primera.destinatario ?? "");
    }
  }

  const setCarga = (i: number, patch: Partial<CargaForm>) =>
    setCargas((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function guardar() {
    setError(null);
    if (!templateId) return setError("Elegí el viaje.");
    if (!driverId) return setError("Elegí de qué chofer es.");
    if (!truckId) return setError("Elegí el camión.");
    if (!destino.trim()) return setError("Poné el destino.");

    const segments = cargas
      .filter((c) => c.lugar)
      .map((c) => ({
        remitente: c.lugar!.nombre,
        remitente_id: c.lugar!.id,
        clientes: c.cliente ? [c.cliente.nombre] : [],
        cliente_ids: c.cliente ? [c.cliente.id] : [],
        cantidad: c.cantidad ? Number(c.cantidad) : null,
        unidad: c.cantidad ? c.unidad : null,
      }));

    setBusy(true);
    try {
      const trip = await api.post<{ id: number }>("/trips", {
        template_id: Number(templateId),
        driver_id: Number(driverId),
        truck_id: Number(truckId),
        fecha,
        origin: origen,
        destino,
        destinatario: destinatario || null,
        kilometros: kilometros || null,
        field_values: {},
        segments,
      });
      navigate(`/panel/viajes/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el viaje");
      setBusy(false);
    }
  }

  if (!templates) return <Spinner size={28} />;

  return (
    <div className="space-y-5">
      <Link to="/panel/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>
      <div>
        <div className="kicker">Oficina</div>
        <h1 className="text-2xl text-ink">Cargar un viaje a mano</h1>
        <p className="mt-1 max-w-xl text-sm text-ink/60">
          Para un viaje que se hizo y no quedó registrado. Queda como completado, con la fecha
          que pongas, y marcado como cargado desde oficina.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Viaje">
            <select className="input" value={templateId} onChange={(e) => elegirPlantilla(e.target.value)}>
              <option value="">Elegí…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.provider_name} · {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del viaje">
            <FechaInput value={fecha} onChange={setFecha} />
          </Field>
          <Field label="Chofer">
            <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Elegí…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Camión">
            <select className="input" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">Elegí…</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.plate}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origen">
            <input className="input" value={origen} onChange={(e) => setOrigen(e.target.value)} />
          </Field>
          <Field label="Destino">
            <input className="input" value={destino} onChange={(e) => setDestino(e.target.value)} />
          </Field>
          <Field label="Destinatario">
            <input className="input" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} />
          </Field>
          <Field label="Kilómetros">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={kilometros}
              onChange={(e) => setKilometros(e.target.value)}
              placeholder="Opcional"
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <span className="label mb-0">Cargas</span>
          <p className="text-sm text-ink/60">
            Cada carga es un renglón facturable. Si el viaje no llevaba cargas, dejalo vacío.
          </p>
        </div>

        {cargas.map((c, i) => (
          <div key={i} className="space-y-3 border border-ink/15 bg-bg p-3">
            <div className="flex items-center justify-between">
              <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/55">
                Carga {i + 1}
              </span>
              {cargas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCargas((prev) => prev.filter((_, j) => j !== i))}
                  className="text-sm text-st-redTx hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
            <LibretaPicker
              tipo="remitente"
              label="Lugar de carga"
              value={c.lugar}
              onChange={(v) => setCarga(i, { lugar: v })}
              providerId={tpl?.provider_id ?? null}
              soloSeleccionables
            />
            <LibretaPicker
              tipo="destinatario"
              label="Cliente"
              value={c.cliente}
              onChange={(v) => setCarga(i, { cliente: v })}
              providerId={tpl?.provider_id ?? null}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={c.cantidad}
                  onChange={(e) => setCarga(i, { cantidad: e.target.value })}
                />
              </Field>
              <Field label="Unidad">
                <select
                  className="input"
                  value={c.unidad}
                  onChange={(e) => setCarga(i, { unidad: e.target.value as Unidad })}
                >
                  <option value={UNIDAD.PALLETS}>Pallets</option>
                  <option value={UNIDAD.KILOS}>Kilos</option>
                </select>
              </Field>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setCargas((prev) => [...prev, cargaVacia()])}
          className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-brand/40 bg-brand/[.06] py-3 font-cond text-[15px] font-semibold text-brand-700"
        >
          <span className="text-lg leading-none">+</span> Agregar otra carga
        </button>
      </Card>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        <Button onClick={guardar} loading={busy}>
          Guardar viaje
        </Button>
        <Button variant="ghost" onClick={() => navigate("/panel/viajes")}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
