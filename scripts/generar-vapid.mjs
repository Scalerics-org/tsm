/**
 * Genera el par de claves VAPID para las notificaciones.
 *
 * Se corre UNA vez. La pública va en wrangler.toml (la ve el navegador); la privada va
 * como secret y no se commitea nunca:
 *
 *   node scripts/generar-vapid.mjs
 *   npx wrangler secret put VAPID_PRIVATE
 *
 * Si se cambian, TODAS las suscripciones guardadas dejan de servir y cada uno tiene que
 * volver a activar las notificaciones. No se rotan por gusto.
 */
import { webcrypto as crypto } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);

// La pública va cruda (punto sin comprimir, 65 bytes: 0x04 || X || Y) — es el formato que
// espera `applicationServerKey` en el navegador.
const publica = await crypto.subtle.exportKey("raw", par.publicKey);
// La privada, como el escalar d de 32 bytes, que es lo que usan las librerías de web push.
const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);

console.log("VAPID_PUBLIC  =", b64url(publica));
console.log("VAPID_PRIVATE =", jwk.d);
console.log();
console.log("La pública va en wrangler.toml. La privada:  npx wrangler secret put VAPID_PRIVATE");
