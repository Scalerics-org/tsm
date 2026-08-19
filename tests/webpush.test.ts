import { describe, it, expect } from "vitest";
import { cifrar, firmarVapid } from "../api/lib/webpush";

/**
 * Prueba de la criptografía de las notificaciones.
 *
 * El test hace de navegador: genera su propio par de claves, deja que el servidor cifre, y
 * después **descifra por su cuenta** con código independiente. Si el resultado es el mensaje
 * original, la implementación es correcta según el RFC 8291.
 *
 * Sin esto, un error acá no se ve: el servidor de push devuelve 201 igual —él no puede leer
 * el mensaje— y lo único que pasa es que al celular no le llega nada, sin ninguna pista.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const u8 = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u8) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const desdeB64url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

function concat(...ps: Uint8Array[]) {
  const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of ps) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, largo: number) {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, base, largo * 8),
  );
}

/** Un navegador que se suscribe: su par de claves y su secreto de autenticación. */
async function navegadorFalso() {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publica = new Uint8Array((await crypto.subtle.exportKey("raw", par.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    par,
    publica,
    suscripcion: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: b64url(publica),
      auth: b64url(auth),
    },
    auth,
  };
}

/** Descifra como lo haría el celular. Código aparte a propósito: si copiara el del servidor,
 *  un error compartido pasaría desapercibido. */
async function descifrarComoElCelular(cuerpo: Uint8Array, nav: Awaited<ReturnType<typeof navegadorFalso>>) {
  const salt = cuerpo.slice(0, 16);
  const largoClave = cuerpo[20];
  const asPublic = cuerpo.slice(21, 21 + largoClave);
  const cifrado = cuerpo.slice(21 + largoClave);

  const serverKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, nav.par.privateKey, 256),
  );
  const ikm = await hkdf(
    compartido,
    nav.auth,
    concat(enc.encode("WebPush: info\0"), nav.publica, asPublic),
    32,
  );
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);
  const clave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plano = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, clave, cifrado),
  );
  // El último byte es el delimitador de relleno (0x02).
  return { texto: dec.decode(plano.slice(0, -1)), delimitador: plano[plano.length - 1] };
}

describe("cifrado del mensaje (RFC 8291)", () => {
  it("el celular puede abrir lo que cifró el servidor", async () => {
    const nav = await navegadorFalso();
    const mensaje = JSON.stringify({ title: "Viaje cerrado · Casarone", body: "Artigas → Montevideo" });

    const cuerpo = await cifrar(nav.suscripcion, mensaje);
    const { texto, delimitador } = await descifrarComoElCelular(cuerpo, nav);

    expect(texto).toBe(mensaje);
    expect(delimitador).toBe(0x02);
  });

  it("respeta el formato de la cabecera: salt, tamaño de registro y clave efímera", async () => {
    const nav = await navegadorFalso();
    const cuerpo = await cifrar(nav.suscripcion, "hola");
    const vista = new DataView(cuerpo.buffer, cuerpo.byteOffset);

    expect(cuerpo.length).toBeGreaterThan(21 + 65);
    expect(vista.getUint32(16)).toBe(4096); // tamaño de registro
    expect(cuerpo[20]).toBe(65); // largo de la clave efímera
    expect(cuerpo[21]).toBe(0x04); // punto sin comprimir
  });

  it("cada mensaje usa una clave y un salt nuevos", async () => {
    // Reutilizarlos rompería el cifrado: con el mismo nonce y la misma clave, dos mensajes
    // se pueden combinar para sacar el contenido.
    const nav = await navegadorFalso();
    const a = await cifrar(nav.suscripcion, "mismo texto");
    const b = await cifrar(nav.suscripcion, "mismo texto");
    expect(b64url(a.slice(0, 16))).not.toBe(b64url(b.slice(0, 16))); // salt
    expect(b64url(a.slice(21, 86))).not.toBe(b64url(b.slice(21, 86))); // clave efímera
  });

  it("aguanta acentos y saltos de línea, que es lo que lleva el aviso", async () => {
    const nav = await navegadorFalso();
    const mensaje = "Bella Unión → Mdeo\nCarlos Méndez · STZ 4821\n\"faltaron 2 pallets\"";
    const { texto } = await descifrarComoElCelular(await cifrar(nav.suscripcion, mensaje), nav);
    expect(texto).toBe(mensaje);
  });
});

describe("firma VAPID (RFC 8292)", () => {
  const CLAVES = {
    publica: "BPRHEASnhYhyOcxkHR6NF9LzfG_CJKGqpMIBkrIMBAAedZyRvmkSR5_0U-Ji8Dk03qM1wK3Ch3EjNAYqFt0nzYY",
    privada: "-V2tvk3fMQDOawZj1rliO3BhMtYXyI_W-Wtl5fS8ztw",
  };

  it("firma un JWT que valida contra la clave pública", async () => {
    const jwt = await firmarVapid(
      "https://fcm.googleapis.com/fcm/send/abc",
      CLAVES.privada,
      CLAVES.publica,
      "mailto:contacto@scalerics.com",
    );
    const [cab, cuerpo, firma] = jwt.split(".");

    const pub = desdeB64url(CLAVES.publica);
    const clave = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: b64url(pub.slice(1, 33)),
        y: b64url(pub.slice(33, 65)),
        ext: true,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valida = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      clave,
      desdeB64url(firma),
      enc.encode(`${cab}.${cuerpo}`),
    );
    expect(valida).toBe(true);
  });

  it("el destinatario es el origen del servidor de push, no la url entera", async () => {
    const jwt = await firmarVapid(
      "https://fcm.googleapis.com/fcm/send/abc123?x=1",
      CLAVES.privada,
      CLAVES.publica,
      "mailto:x@y.com",
    );
    const cuerpo = JSON.parse(dec.decode(desdeB64url(jwt.split(".")[1])));
    expect(cuerpo.aud).toBe("https://fcm.googleapis.com");
    expect(cuerpo.sub).toBe("mailto:x@y.com");
  });

  it("no vence más allá de las 24 h que acepta el estándar", async () => {
    const jwt = await firmarVapid("https://updates.push.services.mozilla.com/wpush/v2/x", CLAVES.privada, CLAVES.publica, "mailto:x@y.com");
    const { exp } = JSON.parse(dec.decode(desdeB64url(jwt.split(".")[1])));
    const horas = (exp - Math.floor(Date.now() / 1000)) / 3600;
    expect(horas).toBeGreaterThan(1);
    expect(horas).toBeLessThanOrEqual(24);
  });

  it("declara ES256, que es el único algoritmo que aceptan los servidores de push", async () => {
    const jwt = await firmarVapid("https://x.com/p", CLAVES.privada, CLAVES.publica, "mailto:x@y.com");
    expect(JSON.parse(dec.decode(desdeB64url(jwt.split(".")[0])))).toEqual({ typ: "JWT", alg: "ES256" });
  });
});
