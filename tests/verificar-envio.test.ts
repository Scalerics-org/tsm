import { describe, it, expect, vi } from "vitest";
import { ApiError, SIN_SENAL } from "../src/lib/api";
import { enviarVerificando, ESPERA_ANTES_DE_VERIFICAR_MS } from "../src/lib/verificar-envio";

const corte = () => new ApiError(SIN_SENAL, 0);
const sinEspera = async () => {};

describe("enviarVerificando", () => {
  it("si sale bien, un solo envío y no lee nada", async () => {
    const enviar = vi.fn().mockResolvedValue("ok");
    const yaLlego = vi.fn();
    expect(await enviarVerificando(enviar, yaLlego, sinEspera)).toEqual({ yaEstaba: false, dato: "ok" });
    expect(yaLlego).not.toHaveBeenCalled();
  });

  it("llegó y se perdió la respuesta: 'ya estaba' y NO se manda otra vez", async () => {
    const enviar = vi.fn().mockRejectedValue(corte());
    const yaLlego = vi.fn().mockResolvedValue(true);
    expect(await enviarVerificando(enviar, yaLlego, sinEspera)).toEqual({ yaEstaba: true });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("no llegó: se manda una vez más y devuelve ese resultado", async () => {
    const enviar = vi.fn().mockRejectedValueOnce(corte()).mockResolvedValue("ok");
    const yaLlego = vi.fn().mockResolvedValue(false);
    expect(await enviarVerificando(enviar, yaLlego, sinEspera)).toEqual({ yaEstaba: false, dato: "ok" });
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("no llegó y el reenvío también se corta: el sin señal de siempre, sin un tercer intento", async () => {
    const enviar = vi.fn().mockRejectedValue(corte());
    const yaLlego = vi.fn().mockResolvedValue(false);
    const e = await enviarVerificando(enviar, yaLlego, sinEspera).catch((x) => x);
    expect(e.message).toBe(SIN_SENAL);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("si la lectura tampoco contesta: el sin señal, sin reenviar", async () => {
    const enviar = vi.fn().mockRejectedValue(corte());
    const yaLlego = vi.fn().mockRejectedValue(corte());
    const e = await enviarVerificando(enviar, yaLlego, sinEspera).catch((x) => x);
    expect(e.message).toBe(SIN_SENAL);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("un 409 del reenvío se verifica antes de mostrarlo: si ya estaba, es éxito", async () => {
    const enviar = vi.fn().mockRejectedValueOnce(corte()).mockRejectedValue(new ApiError("El viaje no está en curso", 409));
    const yaLlego = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await enviarVerificando(enviar, yaLlego, sinEspera)).toEqual({ yaEstaba: true });
  });

  it("un 409 real (la lectura sigue sin coincidir) se muestra como hoy", async () => {
    const enviar = vi.fn().mockRejectedValueOnce(corte()).mockRejectedValue(new ApiError("ya está cargada", 409));
    const yaLlego = vi.fn().mockResolvedValue(false);
    const e = await enviarVerificando(enviar, yaLlego, sinEspera).catch((x) => x);
    expect(e.status).toBe(409);
  });

  it("un error con respuesta en el primer intento no se verifica ni se reenvía", async () => {
    const enviar = vi.fn().mockRejectedValue(new ApiError("Cargá los litros", 400));
    const yaLlego = vi.fn();
    const e = await enviarVerificando(enviar, yaLlego, sinEspera).catch((x) => x);
    expect(e.status).toBe(400);
    expect(yaLlego).not.toHaveBeenCalled();
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("espera un momento antes de leer, para no cruzarse con un pedido que todavía se está guardando", async () => {
    const espera = vi.fn().mockResolvedValue(undefined);
    await enviarVerificando(vi.fn().mockRejectedValue(corte()), vi.fn().mockResolvedValue(true), espera);
    expect(espera).toHaveBeenCalledWith(ESPERA_ANTES_DE_VERIFICAR_MS);
  });
});
