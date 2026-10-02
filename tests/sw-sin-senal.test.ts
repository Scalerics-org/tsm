import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * El service worker muestra la página "sin señal" SÓLO cuando una navegación no puede ni llegar a la red.
 * Se corre `public/sw.js` con un `self`, una `caches` y un `fetch` de mentira.
 */

const CODIGO = readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const PAGINA = new Response("<h1>Sin señal</h1>", { status: 200 });

function montar(fetchDe: (r: any) => Promise<Response>) {
  const oyentes: Record<string, (e: any) => void> = {};
  const guardado = new Map<string, Response>([["/sin-senal.html", PAGINA]]);
  const caches = {
    match: async (k: string) => guardado.get(k),
    open: async () => ({ put: async (k: string, r: Response) => void guardado.set(k, r) }),
    keys: async () => ["tsm-2"],
    delete: async () => true,
  };
  const self = { addEventListener: (n: string, f: (e: any) => void) => (oyentes[n] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  new Function("self", "caches", "fetch", "Request", "Response", CODIGO)(self, caches, fetchDe, Request, Response);
  return {
    pedir(modo: string, metodo = "GET") {
      let respondida: Promise<Response> | undefined;
      const evento = {
        request: { method: metodo, mode: modo, url: "http://x/viaje/1" },
        respondWith: (p: Promise<Response>) => (respondida = p),
        waitUntil: () => {},
      };
      oyentes.fetch(evento);
      return respondida;
    },
  };
}

const sinRed = async () => {
  throw new TypeError("Failed to fetch");
};

describe("service worker: la página de sin señal", () => {
  it("una navegación sin red muestra la página guardada", async () => {
    const r = await montar(sinRed).pedir("navigate")!;
    expect(await r.text()).toContain("Sin señal");
  });

  it("una navegación con red se devuelve tal cual, también si es un 404 o un 500", async () => {
    for (const status of [200, 404, 500]) {
      const sw = montar(async () => new Response("del servidor", { status }));
      const r = await sw.pedir("navigate")!;
      expect(r.status).toBe(status);
      expect(await r.text()).toBe("del servidor");
    }
  });

  it("lo que NO es una navegación (la API, los assets) sigue fallando como antes: sin página de sin señal", async () => {
    await expect(montar(sinRed).pedir("cors")!).rejects.toThrow("Failed to fetch");
    await expect(montar(sinRed).pedir("no-cors")!).rejects.toThrow();
  });

  it("los pedidos que no son GET no los toca", () => {
    expect(montar(sinRed).pedir("navigate", "POST")).toBeUndefined();
  });

  it("cachea una sola cosa, versionada, y sigue activando al instante", () => {
    expect(CODIGO).toMatch(/const VERSION = "tsm-2"/);
    expect(CODIGO).toContain("skipWaiting()");
    expect(CODIGO).toContain("clients.claim()");
  });
});
