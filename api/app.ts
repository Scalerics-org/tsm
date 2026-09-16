import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env, Vars } from "./env";
import { fail } from "./lib/response";
import auth from "./routes/auth";
import trips from "./routes/trips";
import photos from "./routes/photos";
import push from "./routes/push";
import providers from "./routes/providers";
import templates from "./routes/templates";
import libreta from "./routes/libreta";
import departamentos from "./routes/departamentos";
import fuel from "./routes/fuel";
import drivers from "./routes/drivers";
import trucks from "./routes/trucks";
import users from "./routes/users";
import reports from "./routes/reports";
import lecturas from "./routes/lecturas";
import facturacion from "./routes/facturacion";
import camaraFrio from "./routes/camara-frio";

export const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

/**
 * Cabeceras de seguridad en todas las respuestas de la API.
 *
 * Las páginas las llevan por `public/_headers`, que se aplica a los archivos estáticos; pero ese
 * archivo NO se aplica a lo que responde el Worker —lo dice la documentación de Cloudflare—, y
 * `run_worker_first` manda /api/* al Worker. Así que acá van aparte.
 *
 * La que más importa es `nosniff`: /api/photos sirve archivos que subió un usuario, y sin ella
 * un navegador podía "adivinar" que uno era HTML y ejecutarlo.
 */
app.use("*", secureHeaders({ xFrameOptions: "DENY" }));

app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

app.route("/auth", auth);
app.route("/trips", trips);
app.route("/photos", photos);
app.route("/push", push);
app.route("/providers", providers);
app.route("/templates", templates);
app.route("/libreta", libreta);
app.route("/departamentos", departamentos);
app.route("/fuel", fuel);
app.route("/drivers", drivers);
app.route("/trucks", trucks);
app.route("/users", users);
app.route("/reports", reports);
app.route("/lecturas", lecturas);
app.route("/facturacion", facturacion);
app.route("/frio", camaraFrio);

app.notFound((c) => fail(c, "Recurso no encontrado", 404));
app.onError((err, c) => {
  console.error("API error:", err);
  return fail(c, "Error interno del servidor", 500);
});
