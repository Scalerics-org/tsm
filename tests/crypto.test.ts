import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { hashPassword, signToken, verifyPassword, verifyToken } from "../api/lib/crypto";

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

describe("verificación del token", () => {
  const SECRETO = "secreto-de-prueba";
  const usuario = { id: 7, email: "a@tsm.uy", name: "Ana", role: "ADMIN", driver_id: null, truck_id: null } as const;

  it("acepta un token HS256 firmado por nosotros", async () => {
    const token = await signToken(usuario as never, SECRETO);
    expect((await verifyToken(token, SECRETO))?.id).toBe(7);
  });

  it("rechaza un token firmado con otro algoritmo aunque use el mismo secreto", async () => {
    const hs512 = await new SignJWT({ name: "Ana", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("7")
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(SECRETO));
    expect(await verifyToken(hs512, SECRETO)).toBeNull();
  });
});