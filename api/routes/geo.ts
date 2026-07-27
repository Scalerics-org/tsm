import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";

const geo = new Hono<{ Bindings: Env; Variables: Vars }>();
geo.use("*", requireAuth);

// Cache de respuestas externas usando la Cache API del Worker.
async function cached(key: string, ttl: number, producer: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(`https://geo-cache.local/${encodeURIComponent(key)}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = await producer();
  if (res.ok) {
    const clone = new Response(res.body, res);
    clone.headers.set("Cache-Control", `max-age=${ttl}`);
    await cache.put(cacheKey, clone.clone());
    return clone;
  }
  return res;
}

// GET /api/geo/reverse?lat&lon — geocodificación inversa (Nominatim) → localidad/departamento
geo.get("/reverse", async (c) => {
  const lat = c.req.query("lat");
  const lon = c.req.query("lon");
  if (!lat || !lon) return fail(c, "Faltan lat/lon", 400);

  const key = `rev:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  try {
    const res = await cached(key, 86400, () =>
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=es`,
        { headers: { "User-Agent": c.env.NOMINATIM_UA, Accept: "application/json" } },
      ),
    );
    if (!res.ok) return fail(c, "Servicio de geocodificación no disponible", 502);
    const data = (await res.json()) as any;
    const a = data.address ?? {};
    const locality =
      a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county || "";
    const department = a.state || a.region || a.state_district || "";
    return ok(c, { locality, department, display: data.display_name ?? "" });
  } catch {
    return fail(c, "No se pudo geocodificar", 502);
  }
});

// GET /api/geo/route?fromLat&fromLon&toLat&toLon — ruta OSRM → km + minutos
geo.get("/route", async (c) => {
  const { fromLat, fromLon, toLat, toLon } = c.req.query();
  if (!fromLat || !fromLon || !toLat || !toLon) return fail(c, "Faltan coordenadas", 400);

  const key = `route:${fromLat},${fromLon}->${toLat},${toLon}`;
  try {
    const res = await cached(key, 600, () =>
      fetch(
        `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`,
        { headers: { Accept: "application/json" } },
      ),
    );
    if (!res.ok) return fail(c, "Servicio de ruteo no disponible", 502);
    const data = (await res.json()) as any;
    const route = data.routes?.[0];
    if (!route) return fail(c, "Sin ruta disponible", 404);
    return ok(c, {
      distance_km: route.distance / 1000,
      duration_min: route.duration / 60,
    });
  } catch {
    return fail(c, "No se pudo calcular la ruta", 502);
  }
});

export default geo;
