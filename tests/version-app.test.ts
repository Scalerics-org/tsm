import { describe, it, expect } from "vitest";
import { hayVersionNueva, versionDelServidor, versionPropia } from "../src/lib/version-app";

/**
 * El aviso de "hay una versión nueva de la app".
 *
 * Lo que tiene que ser cierto: la versión sale del nombre del script del build, sin nada nuevo que
 * mantener; sin señal o sin versión no se avisa nada; y una versión descartada no vuelve a avisarse
 * (sólo una todavía más nueva), para que con varios deploys por día la franja no sea ruido.
 */

const doc = (src: string | null) =>
  ({ querySelector: () => (src ? { getAttribute: () => src } : null) }) as unknown as Document;

describe("versionPropia", () => {
  it("sale del nombre del script del build", () => {
    expect(versionPropia(doc("/assets/index-DxYiImaU.js"))).toBe("index-DxYiImaU.js");
  });

  it("en desarrollo (sin hash) no hay versión: no se avisa nada", () => {
    expect(versionPropia(doc("/src/main.tsx"))).toBeNull();
    expect(versionPropia(doc(null))).toBeNull();
  });
});

describe("versionDelServidor", () => {
  const responder = (cuerpo: string, ok = true) => (async () => ({ ok, text: async () => cuerpo })) as unknown as typeof fetch;

  it("la lee del HTML que sirve el servidor", async () => {
    const html = '<script type="module" crossorigin src="/assets/index-NUEVA123.js"></script>';
    expect(await versionDelServidor(responder(html))).toBe("index-NUEVA123.js");
  });

  it("si el pedido falla (sin señal) devuelve null y no tira", async () => {
    const roto = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await versionDelServidor(roto)).toBeNull();
    expect(await versionDelServidor(responder("", false))).toBeNull();
  });

  it("un HTML sin script del build (una página de error) no inventa una versión", async () => {
    expect(await versionDelServidor(responder("<html>Error 502</html>"))).toBeNull();
  });
});

describe("hayVersionNueva", () => {
  it("avisa cuando el servidor sirve otra versión", () => {
    expect(hayVersionNueva("index-A.js", "index-B.js", null)).toBe(true);
  });

  it("no avisa si es la misma", () => {
    expect(hayVersionNueva("index-A.js", "index-A.js", null)).toBe(false);
  });

  it("una versión descartada no vuelve a avisarse...", () => {
    expect(hayVersionNueva("index-A.js", "index-B.js", "index-B.js")).toBe(false);
  });

  it("...pero una todavía más nueva sí", () => {
    expect(hayVersionNueva("index-A.js", "index-C.js", "index-B.js")).toBe(true);
  });

  it("sin alguna de las dos versiones no se avisa: se queda con lo que tiene", () => {
    expect(hayVersionNueva(null, "index-B.js", null)).toBe(false);
    expect(hayVersionNueva("index-A.js", null, null)).toBe(false);
  });
});
