import { describe, it, expect } from "vitest";
import { fmtRangoDeDias } from "../src/lib/format";

const HOY = new Date("2026-09-25T15:00:00Z");

describe("fmtRangoDeDias", () => {
  it("sin año cuando cae en el año en curso", () => {
    const r = fmtRangoDeDias("2026-09-24 15:00:00", "2026-09-25 15:00:00", HOY);
    expect(r.corto).toMatch(/^24\/09 → 25\/09$/);
  });
  it("en curso: sin flecha colgando", () => {
    expect(fmtRangoDeDias("2026-09-24 15:00:00", null, HOY).corto).toBe("24/09");
  });
  it("si cruza de año, las dos fechas llevan año", () => {
    const r = fmtRangoDeDias("2025-12-30 15:00:00", "2026-01-02 15:00:00", HOY);
    expect(r.corto).toBe("30/12/2025 → 02/01/2026");
  });
  it("un viaje de otro año lleva año", () => {
    expect(fmtRangoDeDias("2025-03-10 15:00:00", null, HOY).corto).toBe("10/03/2025");
  });
  it("el detalle trae fecha y hora completas", () => {
    expect(fmtRangoDeDias("2026-09-24 15:00:00", "2026-09-25 15:00:00", HOY).detalle).toContain("Descarga:");
  });
  it("sin fechas da guión", () => {
    expect(fmtRangoDeDias(null, null, HOY).corto).toBe("—");
  });
});
