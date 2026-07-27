import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import { ROLES, PHOTO_KIND, type PhotoKind } from "../../shared/domain";
import * as tripsRepo from "../repos/trips";
import * as photosRepo from "../repos/photos";

const photos = new Hono<{ Bindings: Env; Variables: Vars }>();
photos.use("*", requireAuth);

const VALID_KINDS: PhotoKind[] = [
  PHOTO_KIND.CARGA_SALIDA,
  PHOTO_KIND.CARGA_LLEGADA,
  PHOTO_KIND.COMBUSTIBLE,
];

// POST /api/photos — subida multipart (file, trip_id, kind, lat?, lon?, taken_at?)
photos.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "Se esperaba multipart/form-data", 400);

  const fileEntry = form.get("file");
  const tripId = Number(form.get("trip_id"));
  const kind = String(form.get("kind")) as PhotoKind;

  if (!fileEntry || typeof fileEntry === "string") return fail(c, "Falta el archivo", 400);
  const file = fileEntry as unknown as File;
  if (!tripId) return fail(c, "Falta trip_id", 400);
  if (!VALID_KINDS.includes(kind)) return fail(c, "Tipo de foto inválido", 400);

  const trip = await tripsRepo.getTrip(c.env.DB, tripId);
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  if (user.role === ROLES.CHOFER && trip.driver_id !== user.driver_id) {
    return fail(c, "No podés subir fotos a este viaje", 403);
  }

  const lat = form.get("lat") ? Number(form.get("lat")) : null;
  const lon = form.get("lon") ? Number(form.get("lon")) : null;
  const takenAt =
    (form.get("taken_at") as string) || new Date().toISOString().replace("T", " ").slice(0, 19);

  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const key = `trips/${tripId}/${kind}-${Date.now()}.${ext}`;
  await c.env.FOTOS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });

  const id = await photosRepo.insertPhoto(c.env.DB, {
    trip_id: tripId,
    r2_key: key,
    kind,
    taken_at: takenAt,
    lat,
    lon,
  });
  return ok(c, { id, r2_key: key }, 201);
});

// GET /api/photos/<key...> — sirve la imagen desde R2 (requiere auth)
photos.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/photos\//, ""));
  if (!key) return fail(c, "Falta la key", 400);

  const obj = await c.env.FOTOS.get(key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});

export default photos;
