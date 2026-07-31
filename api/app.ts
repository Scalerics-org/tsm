import { Hono } from "hono";
import type { Env, Vars } from "./env";
import { fail } from "./lib/response";
import auth from "./routes/auth";
import trips from "./routes/trips";
import photos from "./routes/photos";
import providers from "./routes/providers";
import templates from "./routes/templates";
import libreta from "./routes/libreta";
import fuel from "./routes/fuel";
import drivers from "./routes/drivers";
import trucks from "./routes/trucks";
import users from "./routes/users";
import reports from "./routes/reports";

export const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

app.route("/auth", auth);
app.route("/trips", trips);
app.route("/photos", photos);
app.route("/providers", providers);
app.route("/templates", templates);
app.route("/libreta", libreta);
app.route("/fuel", fuel);
app.route("/drivers", drivers);
app.route("/trucks", trucks);
app.route("/users", users);
app.route("/reports", reports);

app.notFound((c) => fail(c, "Recurso no encontrado", 404));
app.onError((err, c) => {
  console.error("API error:", err);
  return fail(c, "Error interno del servidor", 500);
});

export type AppType = typeof app;
