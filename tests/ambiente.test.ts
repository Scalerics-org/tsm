import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { app } from "../api/app";
import { ambienteDelServidor, ambienteDeLaRespuesta } from "../src/lib/ambiente";
import { FranjaVisible } from "../src/components/FranjaDePrueba";

/**
 * El ambiente de prueba (prueba.tsm.scalerics.com) es una copia de producción donde Rodrigo mira
 * cada cambio antes de que llegue a los choferes. Tiene que ser imposible confundirlo con el real:
 * la franja aparece sólo cuando el Worker tiene AMBIENTE = "prueba".
 */
describe("/api/health dice en qué ambiente está", () => {
  const pedir = async (env: Record<string, unknown>) => (await app.request("/api/health", {}, env as never)).json();

  it("con AMBIENTE = prueba, dice prueba", async () => {
    expect((await pedir({ AMBIENTE: "prueba" })).data.ambiente).toBe("prueba");
  });

  it("en producción (sin la variable) dice produccion", async () => {
    expect((await pedir({})).data.ambiente).toBe("produccion");
  });

  it("cualquier otro valor se toma como producción: la franja sólo la prende 'prueba'", async () => {
    expect((await pedir({ AMBIENTE: "staging" })).data.ambiente).toBe("produccion");
  });

  it("sigue diciendo que está ok", async () => {
    expect((await pedir({})).data.status).toBe("ok");
  });
});

describe("lo que entiende el navegador", () => {
  it("prueba sólo si el servidor lo dice", () => {
    expect(ambienteDeLaRespuesta({ success: true, data: { ambiente: "prueba" } })).toBe("prueba");
    expect(ambienteDeLaRespuesta({ success: true, data: { ambiente: "produccion" } })).toBe("produccion");
  });

  it("una respuesta rara o vacía es producción: nunca se muestra la franja por error", () => {
    for (const rara of [null, undefined, {}, "prueba", { data: null }, { data: { ambiente: 1 } }]) {
      expect(ambienteDeLaRespuesta(rara)).toBe("produccion");
    }
  });

  it("sin señal, o con un error del servidor, es producción", async () => {
    const sinRed = (async () => {
      throw new Error("sin red");
    }) as never;
    expect(await ambienteDelServidor(sinRed)).toBe("produccion");
    expect(await ambienteDelServidor((async () => new Response("", { status: 500 })) as never)).toBe("produccion");
  });

  it("lee el ambiente de /api/health", async () => {
    const pedidos: string[] = [];
    const falso = (async (url: string) => {
      pedidos.push(url);
      return new Response(JSON.stringify({ success: true, data: { ambiente: "prueba" } }));
    }) as never;
    expect(await ambienteDelServidor(falso)).toBe("prueba");
    expect(pedidos).toEqual(["/api/health"]);
  });
});

describe("la franja", () => {
  it("dice con todas las letras que es una prueba y que lo cargado no es real", () => {
    const html = renderToStaticMarkup(createElement(FranjaVisible));
    expect(html).toContain("AMBIENTE DE PRUEBA");
    expect(html).toContain("lo que cargues acá no es real");
  });

  it("es fija arriba de todo", () => {
    const html = renderToStaticMarkup(createElement(FranjaVisible));
    expect(html).toContain("fixed");
    expect(html).toContain("top-0");
  });
});
