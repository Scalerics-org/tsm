import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockPage } from "../src/features/taller/StockPage";

// El rol del usuario: el lector ("solo mirar") no ve los botones de escribir. Se controla desde cada prueba.
const rol = vi.hoisted(() => ({ soloMirar: false }));
vi.mock("../src/lib/auth", () => ({ useSoloMirar: () => rol.soloMirar }));

// Los hooks del store usan useSyncExternalStore, que no se puede renderizar en el servidor. Acá se leen datos de ejemplo fijos;
// el resto del módulo (las acciones) queda como está.
vi.mock("../src/features/taller/servicio", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("../src/features/taller/servicio")>();
  const { CUBIERTAS_EN_STOCK, ACEITES_DE_EJEMPLO, FILTROS_DE_EJEMPLO } = await import("../src/features/taller/datos-extra");
  return {
    ...original,
    useStock: () => CUBIERTAS_EN_STOCK,
    useBajas: () => [],
    useAceites: () => ACEITES_DE_EJEMPLO,
    useFiltros: () => FILTROS_DE_EJEMPLO,
  };
});

/** La página de Stock con la URL dada (el router en memoria lee la query igual que el de la app). */
function renderizar(query: string): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/panel/taller/stock${query}`] }, createElement(StockPage)));
}

beforeEach(() => {
  rol.soloMirar = false;
});

describe("Stock: una pestaña por vez", () => {
  it("sin tab abre Cubiertas y no muestra aceites ni filtros", () => {
    const html = renderizar("");
    expect(html).toContain("Cubiertas");
    expect(html).toContain("+ Agregar");
    expect(html).not.toContain("LF3000");
    expect(html).not.toContain("Líquido de caja y diferencial");
  });

  it("tab=aceites muestra cada tipo de aceite con sus movimientos, y no los filtros", () => {
    const html = renderizar("?tab=aceites");
    expect(html).toContain("Aceite de motor");
    expect(html).toContain("Líquido de caja y diferencial");
    expect(html).toContain("Movimientos");
    expect(html).not.toContain("LF3000");
  });

  it("tab=filtros muestra cada modelo con su tipo, y no los aceites", () => {
    const html = renderizar("?tab=filtros");
    expect(html).toContain("LF3000");
    expect(html).toContain("aceite de motor");
    expect(html).not.toContain("Líquido de caja y diferencial");
  });

  it("un tab que no existe abre Cubiertas", () => {
    expect(renderizar("?tab=otra-cosa")).toContain("+ Agregar");
  });
});

describe("Stock: el lector sólo mira", () => {
  it("no ve los botones de agregar, comprar, editar ni eliminar, en ninguna pestaña", () => {
    rol.soloMirar = true;
    for (const query of ["", "?tab=aceites", "?tab=filtros"]) {
      const html = renderizar(query);
      expect(html).not.toContain("+ Agregar");
      expect(html).not.toContain(">Comprar<");
      expect(html).not.toContain(">Editar<");
      expect(html).not.toContain(">Eliminar<");
    }
  });

  it("el que escribe sí los ve", () => {
    const html = renderizar("?tab=filtros");
    expect(html).toContain("+ Agregar");
    expect(html).toContain(">Comprar<");
    expect(html).toContain(">Eliminar<");
  });
});
