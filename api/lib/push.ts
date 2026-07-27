import { SignJWT, importJWK } from "jose";
import type { Env } from "../env";
import type { PushSub } from "../repos/push";
import { deleteByEndpoint, subsForRole, subsForUsers, userIdForDriver } from "../repos/push";

// ── base64url ──
function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  len: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

// ── VAPID JWT (ES256) firmado con la clave privada del servidor ──
async function vapidAuthHeader(audience: string, env: Env): Promise<string> {
  const pub = b64uToBytes(env.VAPID_PUBLIC); // 65 bytes: 0x04 || X || Y
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const toB64u = (b: Uint8Array) =>
    btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: toB64u(x),
    y: toB64u(y),
    d: env.VAPID_PRIVATE,
    ext: true,
  };
  const key = await importJWK(jwk, "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setAudience(audience)
    .setSubject(env.VAPID_SUBJECT)
    .setExpirationTime("12h")
    .sign(key);
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`;
}

// ── Cifrado de payload aes128gcm (RFC 8291 / RFC 8188) ──
async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  authSecretB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dh); // clave pública del cliente (65 bytes)
  const authSecret = b64uToBytes(authSecretB64); // 16 bytes

  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer,
  ); // 65
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey } as unknown as string,
      asKeys.privateKey,
      256,
    ),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK combinado: HKDF(salt=authSecret, ikm=ecdhSecret, info="WebPush: info"\0 ua as)
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, asPublic);
  const prk = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const cek = await hkdf(salt, prk, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, utf8("Content-Encoding: nonce\0"), 12);

  const record = concat(payload, new Uint8Array([2])); // delimitador de último registro
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  // Cabecera aes128gcm: salt(16) | rs(4) | idlen(1)=65 | asPublic(65) | ciphertext
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, ct);
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

async function sendOne(sub: PushSub, msg: PushMessage, env: Env): Promise<number> {
  const audience = new URL(sub.endpoint).origin;
  const [auth, body] = await Promise.all([
    vapidAuthHeader(audience, env),
    encryptPayload(utf8(JSON.stringify(msg)), sub.p256dh, sub.auth),
  ]);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "2419200",
    },
    body,
  });
  if (res.status === 404 || res.status === 410) {
    await deleteByEndpoint(env.DB, sub.endpoint); // suscripción expirada
  }
  return res.status;
}

async function sendToSubs(subs: PushSub[], msg: PushMessage, env: Env): Promise<void> {
  await Promise.allSettled(subs.map((s) => sendOne(s, msg, env)));
}

/** Notifica a un chofer (por su driver_id). */
export async function notifyDriver(env: Env, driverId: number, msg: PushMessage): Promise<void> {
  if (!env.VAPID_PRIVATE) return;
  const uid = await userIdForDriver(env.DB, driverId);
  if (uid == null) return;
  await sendToSubs(await subsForUsers(env.DB, [uid]), msg, env);
}

/** Notifica a todos los usuarios de un rol (p. ej. encargados). */
export async function notifyRole(env: Env, role: string, msg: PushMessage): Promise<void> {
  if (!env.VAPID_PRIVATE) return;
  await sendToSubs(await subsForRole(env.DB, role), msg, env);
}
