import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DRIVER_STATUS,
  FIELD_STAGE,
  UNIDAD,
  missingField,
  problemaDeCantidad,
  type Driver,
  type LibretaEntry,
  type TripTemplate,
  type Unidad,
} from "@shared/domain";
import { api, ApiError, mensajeDe } from "../../lib/api";
import { Button, Card, ErrorDeCarga, ErrorText, Field, Spinner } from "../../components/ui";
import { LibretaPicker } from "../../components/LibretaPicker";
import { FechaInput } from "../../components/FechaInput";
import { CampoDePlantilla } from "../../components/CampoDePlantilla";

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
  // Los campos propios de la plantilla: hoja de ruta, remito, pallets, peso.
  const [values, setValues] = useState<Record<string, string>>({});
  // Las cargas que la plantilla trae puestas (la ida y la vuelta de Manassi, el tramo de
  // Agencia). El servidor las crea igual; acá sólo se les pone la cantidad.
  const [fijas, setFijas] = useState<{ cantidad: string; unidad: Unidad }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin esto, si fallaba una de las tres listas su desplegable quedaba vacío, sin nada que
  // dijera si no hay choferes cargados o si no llegaron.
  const [listasFalló, setListasFalló] = useState<string | null>(null);
  const cargarListas = () => {
    setListasFalló(null);
    const falla = (e: unknown) => setListasFalló(mensajeDe(e));
    api.get<TripTemplate[]>("/templates").then(setTemplates).catch(falla);
    api.get<Driver[]>("/drivers").then(setDrivers).catch(falla);
    api.get<TruckOption[]>("/trucks/options").then(setTrucks).catch(falla);
  };
  useEffect(cargarListas, []);

  const tpl = templates?.find((t) => String(t.id) === templateId) ?? null;

  // Al elegir la plantilla se precargan su origen y su destino habitual: es lo que evita
  // retipear en el 90% de los casos, y sigue siendo editable para el que no encaja.
  function elegirPlantilla(id: string) {
    setTemplateId(id);
    // Cada plantilla trae sus propios campos: los de la anterior no le corresponden a esta.
    setValues({});
    setFijas([]);
    const t = templates?.find((x) => String(x.id) === id);
    if (!t) return;
    // Con cargas fijas, la "Carga 1" vacía de siempre era una trampa: la oficina la llenaba
    // con la misma carga que ya viene puesta, y quedaba duplicada — y se facturaba dos veces.
    const fs = t.renglones_fijos ?? [];
    setFijas(fs.map((f) => ({ cantidad: f.cantidad != null ? String(f.cantidad) : "", unidad: f.unidad ?? UNIDAD.PALLETS })));
    setCargas(fs.length ? [] : [cargaVacia()]);
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
    // La misma regla que el servidor (`missingField`), así la pantalla no deja pasar algo que
    // después se rebota. Sólo los de la etapa de carga, que son los que exige al crear.
    const falta = tpl ? missingField(tpl, FIELD_STAGE.CARGA, values) : null;
    if (falta) return setError(`Falta: ${falta}.`);

    // La cantidad de las fijas es obligatoria: el viaje nace cerrado y no hay después.
    const fijasDeLaPlantilla = tpl?.renglones_fijos ?? [];
    for (let i = 0; i < fijasDeLaPlantilla.length; i++) {
      const cant = fijas[i]?.cantidad ?? "";
      if (!cant.trim()) return setError(`Falta la cantidad de la carga fija "${fijasDeLaPlantilla[i].remitente}".`);
      const mala = problemaDeCantidad(Number(cant));
      if (mala) return setError(`${mala}: ${fijasDeLaPlantilla[i].remitente}.`);
    }
    for (const c of cargas) {
      if (!c.lugar || !c.cantidad) continue;
      const mala = problemaDeCantidad(Number(c.cantidad));
      if (mala) return setError(`${mala}: ${c.lugar.nombre}.`);
    }

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
        field_values: values,
        cantidades_fijas: fijas.map((f) => ({ cantidad: Number(f.cantidad), unidad: f.unidad })),
        segments,
      });
      navigate(`/panel/viajes/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el viaje");
      setBusy(false);
    }
  }

  const avisoListas = listasFalló && (
    <ErrorDeCarga
      titulo="No se pudieron cargar las plantillas, los choferes o los camiones."
      mensaje={listasFalló}
      onReintentar={cargarListas}
    />
  );

  if (!templates) return avisoListas || <Spinner size={28} />;

  return (
    <div className="space-y-5">
      <Link to="/panel/viajes" className="text-sm text-ink/60 hover:text-ink">
        ← Viajes
      </Link>
      {avisoListas}
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
              {/* Los inactivos siguen en la lista —un viaje viejo lo hizo quien lo hizo— pero
                  marcados, para no elegir por error a alguien que ya no trabaja acá. */}
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.status === DRIVER_STATUS.INACTIVO ? " (inactivo)" : ""}
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

      {/* Los datos propios de la plantilla. Faltaban, y no era un detalle: el servidor exige
          los obligatorios de la carga, así que un viaje de Cañuelas (hoja de ruta y pallets)
          no se podía guardar desde acá. Por eso el cliente cargaba los viajes atrasados
          entrando como chofer — donde no puede dar de alta clientes, y donde la fecha queda la
          del día en que lo carga y hay que corregirla después. */}
      {tpl && tpl.fields.length > 0 && (
        <Card className="space-y-4">
          <div>
            <span className="label mb-0">Datos del viaje</span>
            <p className="text-sm text-ink/60">Los mismos que completa el chofer en este viaje.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {tpl.fields.map((f) => (
              <CampoDePlantilla
                key={f.key}
                campo={f}
                valor={values[f.key] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <span className="label mb-0">Cargas</span>
          <p className="text-sm text-ink/60">
            Cada carga es un renglón facturable. Si el viaje no llevaba cargas, dejalo vacío.
          </p>
        </div>

        {(tpl?.renglones_fijos ?? []).map((f, i) => (
          <div key={`fija-${i}`} className="space-y-3 border border-brand/30 bg-brand/[.04] p-3">
            <div className="flex items-center justify-between">
              <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                Carga fija {i + 1}
              </span>
              <span className="text-xs text-ink/50">viene con el viaje</span>
            </div>
            <p className="text-sm text-ink">
              {f.remitente} → {f.clientes.join(" · ") || "sin cliente"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={fijas[i]?.cantidad ?? ""}
                  onChange={(e) =>
                    setFijas((prev) => prev.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))
                  }
                />
              </Field>
              <Field label="Unidad">
                <select
                  className="input"
                  value={fijas[i]?.unidad ?? UNIDAD.PALLETS}
                  onChange={(e) =>
                    setFijas((prev) => prev.map((x, j) => (j === i ? { ...x, unidad: e.target.value as Unidad } : x)))
                  }
                >
                  <option value={UNIDAD.PALLETS}>Pallets</option>
                  <option value={UNIDAD.KILOS}>Kilos</option>
                </select>
              </Field>
            </div>
          </div>
        ))}

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
