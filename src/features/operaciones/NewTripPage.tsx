import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TRUCK_STATUS, type Driver, type Trip, type Truck } from "@shared/domain";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ErrorText, Field, Spinner } from "../../components/ui";
import { URUGUAY_CITIES } from "../../lib/cities";
import { haversineKm } from "@shared/geo";
import { fmtKm } from "../../lib/format";

export function NewTripPage() {
  const navigate = useNavigate();
  const { id } = useParams(); // presente => modo edición
  const editing = Boolean(id);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [routeKm, setRouteKm] = useState<number | null>(null);

  const [form, setForm] = useState({
    driver_id: "",
    truck_id: "",
    origin: "",
    destination: "",
    scheduled_at: "",
    cargo_desc: "",
    cargo_weight: "",
    cargo_client: "",
    cargo_doc: "",
  });

  useEffect(() => {
    api.get<Driver[]>("/drivers").then(setDrivers).catch(() => setDrivers([]));
    api.get<Truck[]>("/trucks").then(setTrucks).catch(() => setTrucks([]));
  }, []);

  // Modo edición: precargar el viaje.
  useEffect(() => {
    if (!id) return;
    api
      .get<{ trip: Trip }>(`/trips/${id}`)
      .then(({ trip }) => {
        setForm({
          driver_id: String(trip.driver_id),
          truck_id: String(trip.truck_id),
          origin: trip.origin,
          destination: trip.destination,
          scheduled_at: trip.scheduled_at.replace(" ", "T").slice(0, 16),
          cargo_desc: trip.cargo?.description ?? "",
          cargo_weight: trip.cargo?.weight_kg != null ? String(trip.cargo.weight_kg) : "",
          cargo_client: trip.cargo?.client ?? "",
          cargo_doc: trip.cargo?.doc_number ?? "",
        });
      })
      .catch(() => setError("No se pudo cargar el viaje"));
  }, [id]);

  const originCity = URUGUAY_CITIES.find((c) => c.name === form.origin);
  const destCity = URUGUAY_CITIES.find((c) => c.name === form.destination);

  // Estima la distancia (recta como fallback, OSRM cuando hay ruta).
  useEffect(() => {
    if (!originCity || !destCity) {
      setRouteKm(null);
      return;
    }
    setRouteKm(haversineKm(originCity, destCity));
    api
      .get<{ distance_km: number }>(
        `/geo/route?fromLat=${originCity.lat}&fromLon=${originCity.lon}&toLat=${destCity.lat}&toLon=${destCity.lon}`,
      )
      .then((r) => setRouteKm(r.distance_km))
      .catch(() => {});
  }, [form.origin, form.destination]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drivers || !trucks) return <Spinner size={28} />;

  const availableTrucks = trucks.filter((t) => t.status !== TRUCK_STATUS.MANTENIMIENTO);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.driver_id || !form.truck_id || !originCity || !destCity || !form.scheduled_at) {
      setError("Completá chofer, camión, origen, destino y fecha.");
      return;
    }
    setBusy(true);
    const payload = {
      driver_id: Number(form.driver_id),
      truck_id: Number(form.truck_id),
      origin: originCity.name,
      origin_lat: originCity.lat,
      origin_lon: originCity.lon,
      destination: destCity.name,
      dest_lat: destCity.lat,
      dest_lon: destCity.lon,
      scheduled_at: form.scheduled_at.replace("T", " ") + ":00",
      distance_km: routeKm ?? 0,
      cargo: form.cargo_desc
        ? {
            description: form.cargo_desc,
            weight_kg: form.cargo_weight ? Number(form.cargo_weight) : null,
            client: form.cargo_client || null,
            doc_number: form.cargo_doc || null,
          }
        : null,
    };
    try {
      const trip = editing
        ? await api.put<Trip>(`/trips/${id}`, payload)
        : await api.post<Trip>("/trips", payload);
      navigate(`/panel/viajes/${trip.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el viaje");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-ink">{editing ? "Editar viaje" : "Nuevo viaje"}</h1>

      <form onSubmit={submit} className="space-y-4">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Chofer">
            <select className="input" value={form.driver_id} onChange={set("driver_id")} required>
              <option value="">Seleccionar…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Camión">
            <select className="input" value={form.truck_id} onChange={set("truck_id")} required>
              <option value="">Seleccionar…</option>
              {availableTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.plate} · {t.brand} {t.model} ({t.avg_consumption_l100} L/100km)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origen">
            <select className="input" value={form.origin} onChange={set("origin")} required>
              <option value="">Seleccionar…</option>
              {URUGUAY_CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destino">
            <select className="input" value={form.destination} onChange={set("destination")} required>
              <option value="">Seleccionar…</option>
              {URUGUAY_CITIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha y hora programada">
            <input type="datetime-local" className="input" value={form.scheduled_at} onChange={set("scheduled_at")} required />
          </Field>
          <div className="flex items-end">
            <div className="bg-surface px-4 py-2 text-sm">
              <span className="text-ink/60">Distancia estimada: </span>
              <span className="font-semibold text-ink">{routeKm != null ? fmtKm(routeKm) : "—"}</span>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold text-ink">Carga (opcional)</h2>
          <Field label="Descripción">
            <input className="input" value={form.cargo_desc} onChange={set("cargo_desc")} placeholder="Ej: Cemento a granel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Peso (kg)">
              <input type="number" className="input" value={form.cargo_weight} onChange={set("cargo_weight")} />
            </Field>
            <Field label="Cliente">
              <input className="input" value={form.cargo_client} onChange={set("cargo_client")} />
            </Field>
            <Field label="Remito">
              <input className="input" value={form.cargo_doc} onChange={set("cargo_doc")} />
            </Field>
          </div>
        </Card>

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            {editing ? "Guardar cambios" : "Crear viaje"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/panel/viajes")}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
