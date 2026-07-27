import { describe, it, expect } from "vitest";
import { GpsSubject, type GpsUpdate } from "../src/lib/gps/GpsSubject";

function fix(lat: number, lon: number) {
  return { lat, lon, accuracy: 5, timestamp: 0 };
}

describe("GpsSubject (patrón Observer)", () => {
  it("notifica a los observadores en cada push", () => {
    const subject = new GpsSubject();
    const updates: GpsUpdate[] = [];
    subject.subscribe({ update: (u) => updates.push(u) });

    subject.push(fix(-34.9011, -56.1645));
    subject.push(fix(-34.83, -56.3));

    expect(updates.length).toBe(2);
  });

  it("acumula km sólo con pasos plausibles", () => {
    const subject = new GpsSubject();
    subject.push(fix(-34.9011, -56.1645));
    subject.push(fix(-34.83, -56.3)); // ~15 km, cuenta
    const km = subject.getTotalKm();
    expect(km).toBeGreaterThan(10);

    // ruido: no debería sumar
    const before = subject.getTotalKm();
    subject.push(fix(-34.83001, -56.30001));
    expect(subject.getTotalKm()).toBe(before);
  });

  it("permite desuscribir un observador", () => {
    const subject = new GpsSubject();
    let count = 0;
    const unsub = subject.subscribe({ update: () => (count += 1) });
    subject.push(fix(0, 0));
    unsub();
    subject.push(fix(1, 1));
    expect(count).toBe(1);
  });

  it("respeta el km inicial (viaje ya empezado)", () => {
    const subject = new GpsSubject(50);
    expect(subject.getTotalKm()).toBe(50);
  });
});
