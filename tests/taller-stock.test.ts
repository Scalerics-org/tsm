import { describe, expect, it } from "vitest";
import {
  agregarItem,
  comprar,
  descontar,
  editarItem,
  eliminarItem,
  erroresDeCompra,
  erroresDeItem,
  esItemDeStock,
  existencia,
  faltantes,
  numeroDeCantidad,
  type ItemDeStock,
} from "../src/features/taller/stock-consumibles";
import { altaDeCubiertas, editarCubiertaStock, erroresDeCubiertas } from "../src/features/taller/stock-cubiertas";
import { ACEITES_DE_EJEMPLO, FILTROS_DE_EJEMPLO, type CubiertaEnStock } from "../src/features/taller/datos-extra";
import { VEHICULOS } from "../src/features/taller/datos";
import { PIEZA, SECCION } from "../src/features/taller/tipos-de-service";
import { claveDeItem, consumosDeMarcas, marcaNueva, seccionesDeService, type Marcas } from "../src/features/taller/servicio";

const filtroLF: ItemDeStock = {
  id: "fi-LF3000",
  nombre: "LF3000",
  tipo: "aceite de motor",
  unidad: "u",
  movimientos: [{ id: "m1", fecha: "2026-09-15", cantidad: 3, obs: "" }],
};
const aceiteMotor: ItemDeStock = {
  id: "ac-motor",
  nombre: "Aceite de motor",
  tipo: "",
  unidad: "L",
  movimientos: [{ id: "m2", fecha: "2026-09-01", cantidad: 200, obs: "Tambor" }],
};

let n = 0;
const nuevoId = () => `id-${++n}`;

describe("existencia", () => {
  it("suma las compras y resta los usos", () => {
    const conUso: ItemDeStock = { ...filtroLF, movimientos: [...filtroLF.movimientos, { id: "u1", fecha: "2026-10-01", cantidad: -1, obs: "", uso: { patente: "ABC 123", servicio: "s1", pieza: "Filtro de aceite" } }] };
    expect(existencia(conUso)).toBe(2);
  });

  it("redondea a dos decimales (litros)", () => {
    const item: ItemDeStock = { ...aceiteMotor, movimientos: [{ id: "a", fecha: "2026-10-01", cantidad: 0.1, obs: "" }, { id: "b", fecha: "2026-10-01", cantidad: 0.2, obs: "" }] };
    expect(existencia(item)).toBe(0.3);
  });
});

describe("numeroDeCantidad", () => {
  it("acepta coma decimal y devuelve 0 si no es un número", () => {
    expect(numeroDeCantidad("1,5")).toBe(1.5);
    expect(numeroDeCantidad("20")).toBe(20);
    expect(numeroDeCantidad("")).toBe(0);
    expect(numeroDeCantidad("abc")).toBe(0);
  });
});

describe("comprar", () => {
  it("suma la compra al ítem sin tocar los demás", () => {
    const despues = comprar([filtroLF, aceiteMotor], "fi-LF3000", { id: "m9", fecha: "2026-10-05", cantidad: 8, obs: "Raúl" });
    expect(existencia(despues[0])).toBe(11);
    expect(despues[1]).toBe(aceiteMotor);
    expect(filtroLF.movimientos).toHaveLength(1);
  });
});

describe("agregarItem", () => {
  it("da de alta un ítem con su compra inicial", () => {
    const despues = agregarItem([], { id: "fi-AF1", nombre: "AF1", tipo: "aire", unidad: "u", compra: { id: "m1", fecha: "2026-10-05", cantidad: 4, obs: "" } });
    expect(despues).toHaveLength(1);
    expect(despues[0].nombre).toBe("AF1");
    expect(existencia(despues[0])).toBe(4);
  });
});

describe("editarItem y eliminarItem", () => {
  it("edita el nombre y el tipo, y conserva los movimientos", () => {
    const despues = editarItem([filtroLF], "fi-LF3000", { nombre: "LF3001", tipo: "aire" });
    expect(despues[0]).toMatchObject({ id: "fi-LF3000", nombre: "LF3001", tipo: "aire" });
    expect(existencia(despues[0])).toBe(3);
  });

  it("elimina el ítem pedido", () => {
    expect(eliminarItem([filtroLF, aceiteMotor], "fi-LF3000")).toEqual([aceiteMotor]);
  });
});

describe("descontar", () => {
  it("resta el consumo y deja el uso con service, vehículo, fecha y pieza", () => {
    const despues = descontar([filtroLF], [{ de: "filtro", itemId: "fi-LF3000", cantidad: 1, pieza: "Filtro de aceite de motor" }], { patente: "ABC 123", servicio: "s1", fecha: "2026-10-08" }, nuevoId);
    expect(existencia(despues[0])).toBe(2);
    const uso = despues[0].movimientos.at(-1);
    expect(uso).toMatchObject({ fecha: "2026-10-08", cantidad: -1, uso: { patente: "ABC 123", servicio: "s1", pieza: "Filtro de aceite de motor" } });
  });

  it("deja el stock en negativo si no alcanza, sin tirar error", () => {
    const despues = descontar([filtroLF], [{ de: "filtro", itemId: "fi-LF3000", cantidad: 5, pieza: "Filtro de aceite de motor" }], { patente: "ABC 123", servicio: "s1", fecha: "2026-10-08" }, nuevoId);
    expect(existencia(despues[0])).toBe(-2);
  });

  it("no toca los ítems que no están en el consumo", () => {
    const despues = descontar([filtroLF, aceiteMotor], [{ de: "aceite", itemId: "ac-motor", cantidad: 20, pieza: "Aceite de motor" }], { patente: "ABC 123", servicio: "s1", fecha: "2026-10-08" }, nuevoId);
    expect(despues[0]).toBe(filtroLF);
    expect(existencia(despues[1])).toBe(180);
  });
});

describe("faltantes", () => {
  it("avisa lo que se pide por encima de lo que hay, por ítem", () => {
    const f = faltantes([filtroLF], [
      { de: "filtro", itemId: "fi-LF3000", cantidad: 2, pieza: "a" },
      { de: "filtro", itemId: "fi-LF3000", cantidad: 2, pieza: "b" },
    ]);
    expect(f).toEqual([{ itemId: "fi-LF3000", nombre: "LF3000", disponible: 3, pedido: 4 }]);
  });

  it("no avisa si alcanza", () => {
    expect(faltantes([filtroLF], [{ de: "filtro", itemId: "fi-LF3000", cantidad: 3, pieza: "a" }])).toEqual([]);
  });
});

describe("erroresDeItem y erroresDeCompra", () => {
  it("un filtro necesita modelo y tipo, y no puede repetir un modelo", () => {
    expect(erroresDeItem("filtro", { nombre: "", tipo: "aire" }, [])).toContain("Falta el modelo.");
    expect(erroresDeItem("filtro", { nombre: "LF3000", tipo: "aire" }, [filtroLF])).toContain("Ya hay un filtro LF3000.");
    expect(erroresDeItem("filtro", { nombre: "LF3000", tipo: "aire" }, [filtroLF], "fi-LF3000")).toEqual([]);
  });

  it("un aceite necesita nombre y no puede repetirse", () => {
    expect(erroresDeItem("aceite", { nombre: "  ", tipo: "" }, [])).toContain("Falta el tipo.");
    expect(erroresDeItem("aceite", { nombre: "aceite de motor", tipo: "" }, [aceiteMotor])).toContain("Ya hay un aceite de ese tipo.");
  });

  it("la compra necesita cantidad positiva y fecha", () => {
    expect(erroresDeCompra({ fecha: "2026-10-05", cantidad: 0 })).toContain("La cantidad tiene que ser mayor que cero.");
    expect(erroresDeCompra({ fecha: "", cantidad: 2 })).toContain("Falta la fecha.");
    expect(erroresDeCompra({ fecha: "2026-10-05", cantidad: 2 })).toEqual([]);
  });
});

describe("esItemDeStock", () => {
  it("reconoce un ítem bien formado y rechaza datos viejos o rotos", () => {
    expect(esItemDeStock(filtroLF)).toBe(true);
    expect(esItemDeStock({ id: "x" })).toBe(false);
    expect(esItemDeStock(null)).toBe(false);
  });
});

const cubiertaDeEjemplo: CubiertaEnStock = { codigo: "N-0101", modeloId: "r269", estado: "nueva", obs: "" };

describe("altaDeCubiertas", () => {
  it("da de alta una cubierta por cada código, cada una con su uid", () => {
    const nuevas = altaDeCubiertas({ modeloId: "multi", estado: "nueva", fecha: "2026-10-05", proveedor: "Michelin SA", obs: "Compra" }, ["", "N-0200", ""], nuevoId);
    expect(nuevas).toHaveLength(3);
    expect(new Set(nuevas.map((c) => c.uid)).size).toBe(3);
    expect(nuevas.map((c) => c.codigo)).toEqual(["", "N-0200", ""]);
    expect(nuevas[0]).toMatchObject({ modeloId: "multi", estado: "nueva", desde: "2026-10-05", proveedor: "Michelin SA", obs: "Compra" });
  });

  it("sin proveedor no guarda el campo", () => {
    const [c] = altaDeCubiertas({ modeloId: "multi", estado: "usada", fecha: "2026-10-05", proveedor: "  ", obs: "" }, [""], nuevoId);
    expect(c.proveedor).toBeUndefined();
  });
});

describe("erroresDeCubiertas", () => {
  const base = { modeloId: "multi", estado: "nueva" as const, fecha: "2026-10-05", proveedor: "", obs: "" };

  it("pide modelo válido, fecha y entre 1 y 30 cubiertas", () => {
    expect(erroresDeCubiertas({ ...base, modeloId: "nada" }, [""], [])).toContain("Elegí el modelo.");
    expect(erroresDeCubiertas({ ...base, fecha: "" }, [""], [])).toContain("Falta la fecha.");
    expect(erroresDeCubiertas(base, [], [])).toContain("Tiene que ser al menos una cubierta.");
  });

  it("no deja repetir un código, ni dentro de la compra ni con el stock", () => {
    expect(erroresDeCubiertas(base, ["N-1", "n-1"], [])).toContain("El código N-1 está repetido.");
    expect(erroresDeCubiertas(base, ["N-0101"], ["N-0101"])).toContain("Ya hay una cubierta con el código N-0101.");
    expect(erroresDeCubiertas(base, ["", ""], ["N-0101"])).toEqual([]);
  });
});

describe("editarCubiertaStock", () => {
  it("cambia los datos y conserva el uid, así el recorrido sigue a la cubierta", () => {
    const original = { ...cubiertaDeEjemplo, uid: "u-1" };
    const editada = editarCubiertaStock(original, { codigo: "N-0999", obs: "Revisada" });
    expect(editada).toMatchObject({ uid: "u-1", codigo: "N-0999", obs: "Revisada", modeloId: "r269" });
    expect(original.codigo).toBe("N-0101");
  });
});

describe("erroresDeCompra con unidad", () => {
  it("los filtros se cuentan en unidades enteras; los litros pueden tener decimales", () => {
    expect(erroresDeCompra({ fecha: "2026-10-05", cantidad: 1.5 }, "u")).toContain("Los filtros se cuentan en unidades enteras.");
    expect(erroresDeCompra({ fecha: "2026-10-05", cantidad: 1.5 }, "L")).toEqual([]);
  });
});

describe("consumosDeMarcas", () => {
  const camion = VEHICULOS.find((v) => v.componentes.some((c) => c.id === "motor"));
  if (!camion) throw new Error("hace falta un camión con motor en los datos de ejemplo");
  const secciones = seccionesDeService(camion);
  const claveDe = (seccion: string, pieza: string) => claveDeItem(seccion, { sujeto: "", pieza });

  it("sólo sale del stock lo que tiene un ítem elegido; si no hay cantidad, cuenta uno", () => {
    const marcas: Marcas = {
      [claveDe(SECCION.filtros, PIEZA.filtroAceite)]: marcaNueva({ accion: "nuevo", desdeStock: "fi-LF3000", cantidadStock: "2" }),
      [claveDe(SECCION.liquidos, PIEZA.aceiteMotor)]: marcaNueva({ accion: "nuevo", desdeStock: "ac-aceite-motor" }),
      [claveDe(SECCION.filtros, PIEZA.filtroAire)]: marcaNueva({ accion: "nuevo" }),
    };
    expect(consumosDeMarcas(secciones, marcas, ACEITES_DE_EJEMPLO, FILTROS_DE_EJEMPLO)).toEqual([
      { de: "filtro", itemId: "fi-LF3000", cantidad: 2, pieza: PIEZA.filtroAceite },
      { de: "aceite", itemId: "ac-aceite-motor", cantidad: 1, pieza: PIEZA.aceiteMotor },
    ]);
  });

  it("un id que no existe en el stock no descuenta nada", () => {
    const marcas: Marcas = { [claveDe(SECCION.filtros, PIEZA.filtroAceite)]: marcaNueva({ accion: "nuevo", desdeStock: "fi-NO-EXISTE" }) };
    expect(consumosDeMarcas(secciones, marcas, ACEITES_DE_EJEMPLO, FILTROS_DE_EJEMPLO)).toEqual([]);
  });
});
