import { describe, expect, it } from "vitest";
import { parteDeEjesDeLaUrl, pestanaDeLaUrl, seccionDeLaUrl, seccionesDelVehiculo } from "../src/features/taller/ubicacion";

const url = (q: string) => new URLSearchParams(q);

describe("pestanaDeLaUrl", () => {
  it("sin tab abre Services", () => {
    expect(pestanaDeLaUrl(url(""))).toBe("services");
  });

  it("tab=mantenimiento y tab=historial abren esas pestañas", () => {
    expect(pestanaDeLaUrl(url("tab=mantenimiento"))).toBe("mantenimiento");
    expect(pestanaDeLaUrl(url("tab=historial"))).toBe("historial");
  });

  it("las pestañas viejas (Cubiertas y Componentes) caen en Mantenimiento", () => {
    expect(pestanaDeLaUrl(url("tab=cubiertas"))).toBe("mantenimiento");
    expect(pestanaDeLaUrl(url("tab=componentes"))).toBe("mantenimiento");
  });

  it("un enlace a una cubierta sin tab cae en Mantenimiento, con la cubierta abierta", () => {
    expect(pestanaDeLaUrl(url("cubierta=4"))).toBe("mantenimiento");
  });

  it("un tab desconocido abre Services", () => {
    expect(pestanaDeLaUrl(url("tab=otra-cosa"))).toBe("services");
  });
});

describe("seccionDeLaUrl", () => {
  const camion = seccionesDelVehiculo([{ id: "motor" }, { id: "caja" }, { id: "diferencial" }, { id: "chasis" }, { id: "electricidad" }]);

  it("sin sec abre Ejes", () => {
    expect(seccionDeLaUrl(url("tab=mantenimiento"), camion)).toBe("ejes");
  });

  it("abre la sección pedida si el vehículo la tiene", () => {
    expect(seccionDeLaUrl(url("tab=mantenimiento&sec=motor"), camion)).toBe("motor");
  });

  it("una sección que el vehículo no tiene vuelve a Ejes", () => {
    const semirremolque = seccionesDelVehiculo([{ id: "chasis" }, { id: "electricidad" }]);
    expect(seccionDeLaUrl(url("sec=motor"), semirremolque)).toBe("ejes");
  });

  it("un valor que no existe vuelve a Ejes", () => {
    expect(seccionDeLaUrl(url("sec=basura"), camion)).toBe("ejes");
  });
});

describe("seccionesDelVehiculo", () => {
  it("Ejes siempre está, aunque el vehículo no tenga dibujo (el montacargas)", () => {
    expect(seccionesDelVehiculo([{ id: "motor" }])).toEqual(["ejes", "motor"]);
  });

  it("solo lista las secciones de componentes que el vehículo tiene, en el orden de la planilla", () => {
    expect(seccionesDelVehiculo([{ id: "electricidad" }, { id: "chasis" }])).toEqual(["ejes", "chasis", "electricidad"]);
  });
});

describe("parteDeEjesDeLaUrl", () => {
  it("sin sub abre Cubiertas", () => {
    expect(parteDeEjesDeLaUrl(url("sec=ejes"))).toBe("cubiertas");
  });

  it("abre Frenos o Rodaje cuando se piden", () => {
    expect(parteDeEjesDeLaUrl(url("sub=frenos"))).toBe("frenos");
    expect(parteDeEjesDeLaUrl(url("sub=rodaje"))).toBe("rodaje");
  });

  it("un valor que no existe vuelve a Cubiertas", () => {
    expect(parteDeEjesDeLaUrl(url("sub=otra"))).toBe("cubiertas");
  });
});
