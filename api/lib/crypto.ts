import { SignJWT, jwtVerify } from "jose";
import type { AuthUser, Role } from "../../shared/domain";

const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN_BYTES = 32;
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_LEN_BYTES * 8,
  );
}

/** Genera un hash con formato `pbkdf2$iters$saltHex$hashHex`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${toHex(derived)}`;
}

/** Verifica una contraseña contra el hash almacenado (comparación en tiempo constante). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  const derived = new Uint8Array(await pbkdf2(password, salt, iterations));
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

interface JwtClaims {
  sub: string;
  email: string;
  name: string;
  role: Role;
  driver_id: number | null;
}

export async function signToken(user: AuthUser, secret: string): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    driver_id: user.driver_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(enc.encode(secret));
}

export async function verifyToken(token: string, secret: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, enc.encode(secret));
    const c = payload as unknown as JwtClaims;
    return {
      id: Number(payload.sub),
      email: c.email,
      name: c.name,
      role: c.role,
      driver_id: c.driver_id,
    };
  } catch {
    return null;
  }
}
