// Punto de entrada del Worker.
//
// Antes esto era una Pages Function (functions/api/[[route]].ts). En Workers el
// Worker es el módulo principal y los archivos estáticos se sirven desde el binding
// de assets, configurado en wrangler.toml:
//   - `run_worker_first = ["/api/*"]` manda las llamadas a la API acá
//   - `not_found_handling = "single-page-application"` devuelve index.html para las
//     rutas del front (/, /viaje/3, /panel/...), que las resuelve React Router
//
// Hono ya expone un `fetch` compatible, así que alcanza con exportar la app.
import { app } from "./app";

export default app;
