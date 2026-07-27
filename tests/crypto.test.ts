import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../api/lib/crypto";

// Hash del seed para admin@demo.uy (password: demo1234). Valida que el formato
// del backend coincide con el que se generó para las migraciones.
const SEED_ADMIN_HASH =
  "pbkdf2$100000$bf5635c1f4caae7ca3470f1dd4199bf9$b0e6d4e4f4e9a320e6d295a6ca673a15b4484be93db7c41b7d2b77b363a9f3a2";

describe("password hashing", () => {
  it("verifica el hash de seed con la contraseña correcta", async () => {
    expect(await verifyPassword("demo1234", SEED_ADMIN_HASH)).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    expect(await verifyPassword("incorrecta", SEED_ADMIN_HASH)).toBe(false);
  });

  it("hash/verify de ida y vuelta", async () => {
    const h = await hashPassword("miClaveSegura!");
    expect(h).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword("miClaveSegura!", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
  });

  it("rechaza hashes con formato inválido", async () => {
    expect(await verifyPassword("x", "no-es-un-hash")).toBe(false);
  });
});
