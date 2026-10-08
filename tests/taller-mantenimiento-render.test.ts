import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { VEHICULOS } from "../src/features/taller/datos";
import { TabMantenimiento } from "../src/features/taller/TabMantenimiento";
import { posiciones } from "../src/features/taller/disposicion";
import type { Vehiculo } from "../src/features/taller/tipos";

/** Renderiza la pestaña Mantenimiento con la URL dada (el router en memoria lee la query igual que el de la app). */
function renderizar(vehiculo: Vehiculo, query: string): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [`/panel/taller/${vehiculo.patente}?${query}`] }, createElement(TabMantenimiento, { vehiculo })),
  );
}

const camion = VEHICULOS.find((v) => v.tipo === "camion" && v.disposicion && v.componentes.length > 0);
const montacargas = VEHICULOS.find((v) => v.tipo === "montacargas");

describe("Mantenimiento: lo que se ve según la URL", () => {
  it("sin sec abre Ejes, con las tres partes de los ejes", () => {
    if (!camion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const html = renderizar(camion, "tab=mantenimiento");
    expect(html).toContain("Qué cubierta hay en cada posición");
    expect(html).toContain("Frenos");
    expect(html).toContain("Rodaje");
  });

  it("las secciones de componentes del camión son las de la planilla, en orden, y Ejes va primero", () => {
    if (!camion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const html = renderizar(camion, "tab=mantenimiento");
    const orden = ["Ejes", "Motor", "Caja de cambios", "Diferencial", "Chasis", "Electricidad"].map((t) => html.indexOf(`>${t}<`));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("sub=frenos muestra la tabla de frenos por rueda y no el dibujo de cubiertas", () => {
    if (!camion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const html = renderizar(camion, "tab=mantenimiento&sub=frenos");
    expect(html).toContain("Frenos por rueda");
    expect(html).not.toContain("Qué cubierta hay en cada posición");
  });

  it("sub=rodaje muestra la tabla de rodaje por rueda", () => {
    if (!camion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const html = renderizar(camion, "tab=mantenimiento&sub=rodaje");
    expect(html).toContain("Rodaje por rueda");
  });

  it("sec=motor muestra la planilla del motor con sus piezas", () => {
    if (!camion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const html = renderizar(camion, "tab=mantenimiento&sec=motor");
    expect(html).toContain("Alternador");
    expect(html).toContain("Correas");
    expect(html).not.toContain("Qué cubierta hay en cada posición");
  });

  it("un enlace a una cubierta (?cubierta=N) abre Ejes → Cubiertas con esa cubierta en la ficha", () => {
    if (!camion?.disposicion) throw new Error("hace falta un camión con dibujo en los datos de ejemplo");
    const numero = posiciones(camion.disposicion)[0].numero;
    const html = renderizar(camion, `cubierta=${numero}`);
    expect(html).toContain(`Ficha de la cubierta ${numero}`);
    expect(html).toContain("Qué cubierta hay en cada posición");
  });

  it("el montacargas no tiene dibujo: Ejes muestra un mensaje en vez de las cubiertas", () => {
    if (!montacargas) throw new Error("hace falta el montacargas en los datos de ejemplo");
    const html = renderizar(montacargas, "tab=mantenimiento&sec=ejes");
    expect(html).toContain("no tiene ejes ni cubiertas que dibujar");
    expect(html).not.toContain("Qué cubierta hay en cada posición");
  });
});
