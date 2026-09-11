import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { app } from "../api/app";
import { leerFoto, tipoDeImagen, MAX_FOTO_BYTES } from "../api/lib/archivo-foto";

/**
 * Dos hallazgos de seguridad de la auditoría del 11/9:
 *   - las fotos se guardaban sin validar tipo ni tamaño, con el Content-Type que mandaba el
 *     cliente;
 *   - no había cabeceras de seguridad, ni en las páginas ni en la API.
 */

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
// Un HEIC de iPhone: la caja "ftyp" con la marca "heic".
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);

const archivo = (b: Uint8Array) => ({ size: b.byteLength, arrayBuffer: async () => b.buffer.slice(0) as ArrayBuffer });

describe("el tipo real de una foto", () => {
  it("reconoce JPEG, PNG y WEBP por sus primeros bytes", () => {
    expect(tipoDeImagen(JPEG)).toBe("image/jpeg");
    expect(tipoDeImagen(PNG)).toBe("image/png");
    expect(tipoDeImagen(WEBP)).toBe("image/webp");
  });

  it("un HTML no es una foto, aunque diga serlo", () => {
    expect(tipoDeImagen(HTML)).toBeNull();
  });

  it("un HEIC tampoco: el navegador de la oficina no lo puede mostrar", () => {
    expect(tipoDeImagen(HEIC)).toBeNull();
  });
});

describe("leer una foto subida", () => {
  it("una válida sale con el tipo y la extensión que corresponden", async () => {
    const r = await leerFoto(archivo(PNG));
    expect(r.ok && r.tipo).toBe("image/png");
    expect(r.ok && r.ext).toBe("png");
  });

  it("un HTML disfrazado de foto se rechaza con un mensaje que el chofer entiende", async () => {
    const r = await leerFoto(archivo(HTML));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("Sacala de nuevo con la cámara");
  });

  it("una demasiado grande se rechaza SIN leerla entera en memoria", async () => {
    let leida = false;
    const r = await leerFoto({
      size: MAX_FOTO_BYTES + 1,
      arrayBuffer: async () => {
        leida = true;
        return new ArrayBuffer(0);
      },
    });
    expect(r.ok).toBe(false);
    expect(leida).toBe(false);
  });

  it("una vacía se rechaza", async () => {
    expect((await leerFoto(archivo(new Uint8Array(0)))).ok).toBe(false);
  });
});

describe("las cabeceras de seguridad", () => {
  it("la API las lleva en todas sus respuestas", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Strict-Transport-Security")).toBeTruthy();
  });

  it("las páginas tienen su archivo _headers, con la política de contenido", () => {
    const h = readFileSync("public/_headers", "utf-8");
    expect(h).toContain("X-Frame-Options: DENY");
    expect(h).toContain("frame-ancestors 'none'");
    // Lo que la página carga de verdad tiene que estar permitido, o se rompe:
    expect(h).toContain("https://fonts.googleapis.com");
    expect(h).toContain("https://fonts.gstatic.com");
    expect(h).toMatch(/img-src [^;]*blob:/);
  });
});
