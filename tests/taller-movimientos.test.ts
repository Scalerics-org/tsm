import { describe, it, expect } from "vitest";
import type { CubiertaEnStock } from "../src/features/taller/datos-extra";
import { aplicarMovimiento, recorridoDeCubierta, type Situacion } from "../src/features/taller/movimientos";
import { kmRecorridos, type Cubierta, type Vehiculo } from "../src/features/taller/tipos";

/**
 * Sacar o mover una cubierta: baja, stock, otra posición del mismo vehículo u otra de OTRO vehículo. El historial de cada
 * cubierta la sigue por un id interno, aunque no tenga código.
 */

const cub = (numero: number, extra: Partial<Cubierta> = {}): Cubierta => ({
  uid: `u${numero}`,
  numero,
  codigo: `C-${numero}`,
  modeloId: "multi",
  fecha: "2026-01-10",
  kmInicial: 60_000,
  obs: "",
  anteriores: [],
  ...extra,
});

const stockNuevo: CubiertaEnStock = { uid: "N-0103", codigo: "N-0103", modeloId: "r269", estado: "nueva", obs: "" };

function situacion(): Situacion {
  return {
    flota: {
      "GTP 4325": { km: 100_000, cubiertas: [cub(3), cub(7), cub(10, { uid: "u10", codigo: undefined })], vacias: {} },
      "GTP 4238": { km: 200_000, cubiertas: [cub(8, { uid: "x8", codigo: "X-8", kmInicial: 150_000 })], vacias: {} },
    },
    stock: [stockNuevo],
    bajas: [],
  };
}

let n = 0;
const nuevoUid = () => `nuevo-${++n}`;
const mov = (parcial: object) => ({ patente: "GTP 4325", posicion: 3, fecha: "2026-10-05", km: 100_000, obs: "", ...parcial }) as never;

describe("una baja", () => {
  it("la cubierta sale de servicio con su motivo y el historial que tenía", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "baja", motivo: "objeto" }, reemplazo: { tipo: "stock", uid: "N-0103" } }), nuevoUid);
    expect(d.bajas).toHaveLength(1);
    expect(d.bajas[0]).toMatchObject({ uid: "u3", motivo: "Se rompió por agarrar un objeto", patente: "GTP 4325", posicion: 3, km: 40_000 });
    expect(d.bajas[0].historial).toEqual([{ tipo: "vehiculo", patente: "GTP 4325", posicion: 3, desde: "2026-01-10", kmDesde: 60_000, hasta: "2026-10-05", kmHasta: 100_000 }]);
  });

  it("el reemplazo del stock ocupa la posición con 0 km, se descuenta del stock y hereda el historial de la posición", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "baja", motivo: "mala_maniobra" }, reemplazo: { tipo: "stock", uid: "N-0103" } }), nuevoUid);
    const nueva = d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)!;
    expect(nueva).toMatchObject({ uid: "N-0103", codigo: "N-0103", modeloId: "r269", kmInicial: 100_000, fecha: "2026-10-05" });
    expect(d.stock).toEqual([]);
    expect(nueva.anteriores[0]).toMatchObject({ codigo: "C-3", kmRecorridos: 40_000, motivo: "Se rompió por mala maniobra" });
  });

  it("sin reemplazo la posición queda vacía y su historial no se pierde", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "baja", motivo: "fin_de_vida" }, reemplazo: { tipo: "vacia" }, obs: "Gastada" }), nuevoUid);
    expect(d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)).toBeUndefined();
    expect(d.flota["GTP 4325"].vacias[3][0]).toMatchObject({ codigo: "C-3", motivo: "Fin de la vida útil · Gastada" });
  });

  it("una cubierta cargada a mano ocupa el lugar, y una nueva posición vacía la hereda", () => {
    const vacia = aplicarMovimiento(situacion(), mov({ destino: { tipo: "baja", motivo: "fin_de_vida" } }), nuevoUid);
    const lleno = aplicarMovimiento(vacia, mov({ posicion: 7, destino: { tipo: "mover", patente: "GTP 4325", posicion: 3 } }), nuevoUid);
    const en3 = lleno.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)!;
    expect(en3.uid).toBe("u7");
    expect(en3.anteriores[0].codigo).toBe("C-3");
    expect(lleno.flota["GTP 4325"].vacias[3]).toBeUndefined();
  });

  it("manual: nueva cubierta sin código", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "baja", motivo: "fin_de_vida" }, reemplazo: { tipo: "manual", modeloId: "kmax" } }), nuevoUid);
    const nueva = d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)!;
    expect(nueva.codigo).toBeUndefined();
    expect(nueva.uid).toMatch(/^nuevo-/);
    expect(nueva.modeloId).toBe("kmax");
  });
});

describe("guardarla en el stock de usadas", () => {
  it("entra como usada con su id y de dónde salió, aunque no tenga código", () => {
    const d = aplicarMovimiento(situacion(), mov({ posicion: 10, destino: { tipo: "stock" } }), nuevoUid);
    const usada = d.stock.find((s) => s.estado === "usada")!;
    expect(usada).toMatchObject({ uid: "u10", codigo: "", desde: "2026-10-05" });
    expect(usada.obs).toContain("Salió de GTP 4325 posición 10 el 05/10");
  });
});

describe("mover a otra posición del mismo vehículo", () => {
  it("a una posición libre: la cubierta cambia de posición y la de origen queda libre", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4325", posicion: 4 } }), nuevoUid);
    expect(d.flota["GTP 4325"].cubiertas.map((c) => c.numero)).toEqual([4, 7, 10]);
    expect(d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 4)!.uid).toBe("u3");
    expect(d.flota["GTP 4325"].vacias[3][0].motivo).toContain("Movida a la posición 4");
  });

  it("a una posición ocupada con intercambio: las dos cambian de lugar y ninguna queda vacía", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4325", posicion: 10, ocupada: { tipo: "intercambio" } } }), nuevoUid);
    const c = d.flota["GTP 4325"].cubiertas;
    expect(c.find((x) => x.numero === 10)!.uid).toBe("u3");
    expect(c.find((x) => x.numero === 3)!.uid).toBe("u10");
    expect(c.find((x) => x.numero === 3)!.anteriores[0].codigo).toBe("C-3");
    expect(c.find((x) => x.numero === 10)!.anteriores[0].codigo).toBe("Sin código");
  });

  it("a una ocupada mandando la que estaba al stock: el lugar de origen se ofrece a un reemplazo", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4325", posicion: 7, ocupada: { tipo: "stock" } }, reemplazo: { tipo: "stock", uid: "N-0103" } }), nuevoUid);
    expect(d.stock.map((s) => s.uid)).toEqual(["u7"]);
    expect(d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)!.uid).toBe("N-0103");
    expect(d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 7)!.uid).toBe("u3");
  });

  it("a una ocupada dando de baja la que estaba", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4325", posicion: 7, ocupada: { tipo: "baja", motivo: "objeto" } } }), nuevoUid);
    expect(d.bajas.map((b) => b.uid)).toEqual(["u7"]);
  });

  it("a su misma posición no hace nada", () => {
    const antes = situacion();
    expect(aplicarMovimiento(antes, mov({ destino: { tipo: "mover", patente: "GTP 4325", posicion: 3 } }), nuevoUid)).toBe(antes);
  });
});

describe("mover a OTRO vehículo", () => {
  const aOtro = (extra: object = {}) =>
    aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4238", posicion: 8, ocupada: { tipo: "stock" }, ...extra } }), nuevoUid);

  it("llega a la posición de destino arrancando con el km del tacógrafo de ESE vehículo", () => {
    const d = aOtro();
    const llegada = d.flota["GTP 4238"].cubiertas.find((c) => c.numero === 8)!;
    expect(llegada).toMatchObject({ uid: "u3", kmInicial: 200_000 });
  });

  it("la que estaba en el destino sigue su camino (stock) con SUS km", () => {
    const d = aOtro();
    const usada = d.stock.find((s) => s.uid === "x8")!;
    expect(usada.historial).toEqual([{ tipo: "vehiculo", patente: "GTP 4238", posicion: 8, desde: "2026-01-10", kmDesde: 150_000, hasta: "2026-10-05", kmHasta: 200_000 }]);
  });

  it("intercambio entre vehículos: cada una va al vehículo del otro", () => {
    const d = aOtro({ ocupada: { tipo: "intercambio" } });
    expect(d.flota["GTP 4325"].cubiertas.find((c) => c.numero === 3)!.uid).toBe("x8");
    expect(d.flota["GTP 4238"].cubiertas.find((c) => c.numero === 8)!.uid).toBe("u3");
    expect(d.stock.map((s) => s.uid)).toEqual(["N-0103"]);
  });

  it("no modifica la situación de antes", () => {
    const antes = situacion();
    aplicarMovimiento(antes, mov({ destino: { tipo: "mover", patente: "GTP 4238", posicion: 8, ocupada: { tipo: "stock" } } }), nuevoUid);
    expect(antes.flota["GTP 4325"].cubiertas.map((c) => c.numero)).toEqual([3, 7, 10]);
    expect(antes.flota["GTP 4238"].cubiertas).toHaveLength(1);
  });
});

describe("el recorrido de una cubierta", () => {
  const fmt = (d: string) => d.split("-").reverse().join("/");

  it("sigue a la cubierta entre dos vehículos y el total es la suma de los tramos", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4238", posicion: 8, ocupada: { tipo: "stock" } } }), nuevoUid);
    const c = d.flota["GTP 4238"].cubiertas.find((x) => x.numero === 8)!;
    // Hoy GTP 4238 marca 212.000 km: 12.000 desde que llegó.
    const r = recorridoDeCubierta(c.historial ?? [], { tipo: "vehiculo", patente: "GTP 4238", posicion: 8, desde: c.fecha, kmDesde: c.kmInicial, kmActual: 212_000 }, fmt);
    expect(r.lineas.map((l) => [l.donde, l.km])).toEqual([
      ["GTP 4325 pos. 3", 40_000],
      ["GTP 4238 pos. 8", 12_000],
    ]);
    expect(r.totalKm).toBe(52_000);
  });

  it("los km que lleva la cubierta no vuelven a cero al moverla: el desgaste la sigue", () => {
    const d = aplicarMovimiento(situacion(), mov({ destino: { tipo: "mover", patente: "GTP 4238", posicion: 8, ocupada: { tipo: "stock" } } }), nuevoUid);
    const c = d.flota["GTP 4238"].cubiertas.find((x) => x.numero === 8)!;
    expect(kmRecorridos({ km: 200_000 } as Vehiculo, c)).toBe(40_000); // recién llegó: lo que ya hizo en la 4325
    expect(kmRecorridos({ km: 212_000 } as Vehiculo, c)).toBe(52_000); // más lo de este tramo
  });

  it("una cubierta sin código se sigue igual por su id", () => {
    const d = aplicarMovimiento(situacion(), mov({ posicion: 10, destino: { tipo: "mover", patente: "GTP 4238", posicion: 9 } }), nuevoUid);
    const c = d.flota["GTP 4238"].cubiertas.find((x) => x.numero === 9)!;
    expect(c.uid).toBe("u10");
    expect(c.codigo).toBeUndefined();
    expect(c.historial).toHaveLength(1);
  });
});
