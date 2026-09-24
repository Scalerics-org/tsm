import { describe, expect, it } from "vitest";
import { GuardadoDeCarga } from "../src/lib/guardar-carga";

describe("GuardadoDeCarga", () => {
  it("no vuelve a crear la carga si se reintenta por una foto que falló", () => {
    const g = new GuardadoDeCarga();
    const sid = g.sid(() => "sid-1");
    expect(g.debeCrear()).toBe(true);
    g.marcarCreada(sid);

    // Reintento: mismo sid, ya no hay que crearla de nuevo.
    expect(g.sid(() => "otro-sid")).toBe("sid-1");
    expect(g.debeCrear()).toBe(false);
  });

  it("cuenta las fotos que ya subió para no repetirlas al reintentar", () => {
    const g = new GuardadoDeCarga();
    g.marcarCreada("sid-1");
    expect(g.subidas()).toBe(0);
    g.marcarFotoSubida();
    g.marcarFotoSubida();
    expect(g.subidas()).toBe(2);
  });

  it("después de un reset, la carga siguiente sí manda su POST", () => {
    // Reproduce el bug: una primera carga se guarda bien pero la recarga del viaje no
    // llega (el formulario sigue montado). Sin el reset al terminar bien, la segunda
    // carga encontraba `debeCrear() === false` y nunca mandaba el POST.
    const g = new GuardadoDeCarga();
    g.marcarCreada(g.sid(() => "sid-1"));
    g.marcarFotoSubida();
    g.reset();

    expect(g.debeCrear()).toBe(true);
    expect(g.guardando()).toBe(false);
    const segundoSid = g.sid(() => "sid-2");
    expect(segundoSid).toBe("sid-2");
  });

  it("guardando() sólo es true mientras la carga quedó a mitad de subir fotos", () => {
    const g = new GuardadoDeCarga();
    expect(g.guardando()).toBe(false);
    g.marcarCreada("sid-1");
    expect(g.guardando()).toBe(true);
    g.reset();
    expect(g.guardando()).toBe(false);
  });
});
