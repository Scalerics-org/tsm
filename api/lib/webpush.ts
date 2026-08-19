/**
 * Web Push desde el Worker, sin librerías.
 *
 * Mandar una notificación no es un `fetch` pelado: hay que firmar un JWT con la clave VAPID
 * (RFC 8292) y **cifrar el mensaje** con la clave pública del navegador que se suscribió
 * (RFC 8291, esquema `aes128gcm`). El servidor de push —Google, Mozilla, Apple— reenvía el
 * paquete sin poder leerlo; sólo el celular que se suscribió puede abrirlo.
 *
 * Se implementa a mano porque `web-push` es de Node y acá corre WebCrypto en Workers, que
 * tiene todo lo necesario: ECDH P-256, HKDF, AES-GCM y ECDSA.
 */

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const u8 = b instanceof Uint8Array ? b : new Uint8Array(b);
  let bin = "";
  for (const x of u8) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** HKDF de una sola pasada (extract + expand), que es lo que expone WebCrypto. */
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, largo: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    base,
    largo * 8,
  );
  return new Uint8Array(bits);
}

export interface Suscripcion {
  endpoint: string;
  /** Clave pública del navegador (punto P-256 sin comprimir, 65 bytes en base64url). */
  p256dh: string;
  /** Secreto de autenticación de la suscripción (16 bytes en base64url). */
  auth: string;
}

/**
 * Cifra el payload para esa suscripción, en el formato `aes128gcm`.
 *
 * El cuerpo queda: salt(16) || tamaño de registro(4) || largo de la clave(1) || clave
 * efímera(65) || texto cifrado. El navegador necesita la clave efímera adentro del mensaje
 * para poder derivar la misma llave y abrirlo.
 */
// Exportadas para poder probarlas: el test simula al navegador, descifra el mensaje y
// verifica la firma. Sin eso, un error de criptografía sólo se descubre cuando no llega
// ninguna notificación y no hay forma de saber por qué.
export async function cifrar(sub: Suscripcion, texto: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);

  // Par efímero: uno nuevo por mensaje. Reutilizarlo dejaría de ser seguro.
  // Los tipos de Workers declaran generateKey como CryptoKey | CryptoKeyPair.
  const efimero = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  // exportKey("raw") devuelve ArrayBuffer, pero el tipo lo declara como la unión con JWK.
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", efimero.publicKey)) as ArrayBuffer,
  );

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      efimero.privateKey,
      256,
    ),
  );

  // El secreto de la suscripción entra como salt: sin él, un intermediario que viera el
  // intercambio de claves podría descifrar igual.
  const ikm = await hkdf(
    compartido,
    authSecret,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);

  // El 0x02 marca el final del contenido: es el delimitador de relleno del formato.
  const plano = concat(enc.encode(texto), new Uint8Array([0x02]));
  const clave = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, clave, plano as BufferSource),
  );

  const cabecera = new Uint8Array(21);
  cabecera.set(salt, 0);
  new DataView(cabecera.buffer).setUint32(16, 4096); // tamaño de registro
  cabecera[20] = asPublic.length; // 65
  return concat(cabecera, asPublic, cifrado);
}

/** El JWT que prueba que el mensaje sale de este servidor y no de cualquiera. */
export async function firmarVapid(endpoint: string, privada: string, publica: string, subject: string): Promise<string> {
  const { origin } = new URL(endpoint);
  const cabecera = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: origin,
        // 12 h. El máximo que acepta el estándar son 24; de más lo rechazan.
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );

  // La privada se guarda como el escalar d; las coordenadas salen de la pública.
  const pub = b64urlToBytes(publica);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privada,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const clave = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    clave,
    enc.encode(`${cabecera}.${cuerpo}`) as BufferSource,
  );
  return `${cabecera}.${cuerpo}.${bytesToB64url(firma)}`;
}

export interface ResultadoEnvio {
  ok: boolean;
  status: number;
  /** La suscripción ya no existe (el celular la borró o desinstaló la app): hay que sacarla. */
  vencida: boolean;
}

export interface ClavesVapid {
  publica: string;
  privada: string;
  subject: string;
}

/**
 * Manda una notificación. No tira excepción: devuelve qué pasó.
 *
 * Es a propósito. Esto se llama al cerrar un viaje, y que un chofer no pueda terminarlo
 * porque el servidor de push está caído sería absurdo.
 */
export async function enviarPush(
  sub: Suscripcion,
  payload: unknown,
  vapid: ClavesVapid,
): Promise<ResultadoEnvio> {
  try {
    const cuerpo = await cifrar(sub, JSON.stringify(payload));
    const jwt = await firmarVapid(sub.endpoint, vapid.privada, vapid.publica, vapid.subject);

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publica}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        // Si el celular está apagado, el servidor guarda el aviso un día y lo entrega al
        // prender. Más que eso, un "viaje cerrado" ya no le sirve a nadie.
        TTL: "86400",
        Urgency: "normal",
      },
      body: cuerpo as BufferSource,
    });

    // 404 y 410 son la forma que tiene el servidor de push de decir "esta suscripción murió".
    return { ok: res.ok, status: res.status, vencida: res.status === 404 || res.status === 410 };
  } catch {
    return { ok: false, status: 0, vencida: false };
  }
}
