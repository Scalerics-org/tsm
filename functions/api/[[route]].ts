// Catch-all de Cloudflare Pages Functions: delega todo /api/* a la app Hono.
import { handle } from "hono/cloudflare-pages";
import { app } from "../../api/app";

export const onRequest = handle(app);
