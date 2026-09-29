import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, SIN_SENAL } from "../src/lib/api";
import {
  conReintentos,
  sePuedeReintentar,
  ESPERAS_ENTRE_INTENTOS_MS,
  ESPERA_REINTENTO_MS,
} from "../src/lib/reintentos";

/**
 * Reintentos cuando no llega respuesta. Lo que importa: sólo se reenvía lo que el servidor sabe
 * reconocer como reenvío, y una respuesta con error nunca se repite.
 */

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("qué se reintenta", () => {
  it.each([
    ["GET", "/trips/active"],
    ["GET", "/fuel?truck=3"],
    ["POST", "/trips/12/segments"],
    ["PATCH", "/trips/12/segments/a1b2-c3"],
    ["PATCH", "/trips/12/campos"],
    ["POST", "/libreta"],
  ])("%s %s sí", (m, p) => expect(sePuedeReintentar(m, p)).toBe(true));

  it.each([
    ["POST", "/fuel"],
    ["POST", "/frio"],
    ["POST", "/photos"],
    ["POST", "/trips"],
    ["POST", "/trips/12/finish"],
    ["POST", "/trips/12/cancel"],
    ["POST", "/lecturas"],
    ["DELETE", "/trips/12/segments/a1b2"],
    ["PUT", "/trips/12/segments"],
    ["PUT", "/trips/12/segments/a1b2/cobro"],
    ["GET", "/auth/me"],
  ])("%s %s no", (m, p) => expect(sePuedeReintentar(m, p)).toBe(false));
});

describe("conReintentos", () => {
  const sinRespuesta = (e: unknown) => e instanceof ApiError && e.status === 0;
  const corte = () => new ApiError(SIN_SENAL, 0);

  it("sin corte: un solo intento y no avisa nada", async () => {
    const intento = vi.fn().mockResolvedValue("ok");
    const avisar = vi.fn();
    expect(await conReintentos(intento, { reintentable: true, sinRespuesta, avisar, dormir: async () => {} })).toBe("ok");
    expect(intento).toHaveBeenCalledTimes(1);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("si vuelve la señal al segundo intento, devuelve el resultado y avisó que reintentaba", async () => {
    const intento = vi.fn().mockRejectedValueOnce(corte()).mockResolvedValue("ok");
    const avisar = vi.fn();
    const dormir = vi.fn().mockResolvedValue(undefined);
    expect(await conReintentos(intento, { reintentable: true, sinRespuesta, avisar, dormir })).toBe("ok");
    expect(intento).toHaveBeenCalledTimes(2);
    expect(dormir).toHaveBeenCalledWith(ESPERAS_ENTRE_INTENTOS_MS[0]);
    expect(avisar).toHaveBeenCalledWith({ intento: 2, de: 3 });
    expect(avisar).toHaveBeenLastCalledWith(null);
  });

  it("los reintentos esperan menos que el primer intento", async () => {
    const esperas: (number | undefined)[] = [];
    const intento = vi.fn(async (e: number | undefined) => {
      esperas.push(e);
      throw corte();
    });
    await conReintentos(intento, { reintentable: true, sinRespuesta, avisar: () => {}, dormir: async () => {} }).catch(() => {});
    expect(esperas).toEqual([undefined, ESPERA_REINTENTO_MS, ESPERA_REINTENTO_MS]);
  });

  it("si fallan todos, el mismo SIN_SENAL de siempre, tras 3 intentos y esperas crecientes", async () => {
    const intento = vi.fn().mockRejectedValue(corte());
    const dormir = vi.fn().mockResolvedValue(undefined);
    const e = await conReintentos(intento, { reintentable: true, sinRespuesta, avisar: () => {}, dormir }).catch((x) => x);
    expect(e.message).toBe(SIN_SENAL);
    expect(intento).toHaveBeenCalledTimes(3);
    expect(dormir.mock.calls.map(([ms]) => ms)).toEqual([1000, 3000]);
  });

  it("una respuesta con error NO se reintenta", async () => {
    const intento = vi.fn().mockRejectedValue(new ApiError("El viaje no está en curso", 409));
    await conReintentos(intento, { reintentable: true, sinRespuesta, avisar: () => {}, dormir: async () => {} }).catch(() => {});
    expect(intento).toHaveBeenCalledTimes(1);
  });

  it("una ruta no reintentable falla al primer corte", async () => {
    const intento = vi.fn().mockRejectedValue(corte());
    await conReintentos(intento, { reintentable: false, sinRespuesta, avisar: () => {}, dormir: async () => {} }).catch(() => {});
    expect(intento).toHaveBeenCalledTimes(1);
  });
});

describe("a través de api", () => {
  it("la carga que llegó pero cuya respuesta se perdió se manda otra vez con el mismo cuerpo", async () => {
    vi.useFakeTimers();
    const fetchFalso = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ status: 200, json: async () => ({ success: true, data: { id: 1 } }) });
    vi.stubGlobal("fetch", fetchFalso);
    const carga = { segments: [{ sid: "abc", remitente: "TIMBER" }] };
    const pedido = api.post("/trips/1/segments", carga);
    await vi.advanceTimersByTimeAsync(ESPERAS_ENTRE_INTENTOS_MS[0] + 1);
    expect(await pedido).toEqual({ id: 1 });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(fetchFalso.mock.calls[1][1].body).toBe(fetchFalso.mock.calls[0][1].body);
  });

  it("una surtida sin señal se manda una sola vez", async () => {
    const fetchFalso = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchFalso);
    const e = await api.upload("/fuel", new FormData()).catch((x) => x);
    expect(e.message).toBe(SIN_SENAL);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
