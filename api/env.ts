/// <reference types="@cloudflare/workers-types" />

// Bindings y variables disponibles en el Worker (definidos en wrangler.toml).
export interface Env {
  DB: D1Database;
  FOTOS: R2Bucket;
  JWT_SECRET: string;
  NOMINATIM_UA: string;
  VAPID_PUBLIC: string;
  VAPID_PRIVATE: string;
  VAPID_SUBJECT: string;
}

// Variables que colgamos del contexto Hono tras autenticar.
import type { AuthUser } from "../shared/domain";
export interface Vars {
  user: AuthUser;
}
