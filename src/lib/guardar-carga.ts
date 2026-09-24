/**
 * Sigue el estado de una carga que se está guardando, para no duplicarla si el chofer
 * reintenta el guardado por una foto que falló subir. Vive acá y no en `shared/` porque no
 * es una regla de negocio del dominio: es el manejo de reintentos de un formulario que
 * puede seguir montado más tiempo del que dura el guardado (ver `CargasPanel`, donde el
 * formulario sólo se remonta cuando el viaje termina de recargarse con la carga nueva).
 */
export class GuardadoDeCarga {
  private actual: { sid: string; subidas: number } | null = null;

  /** El sid de un intento anterior sin terminar, o uno nuevo si no hay ninguno en curso. */
  sid(generar: () => string): string {
    return this.actual?.sid ?? generar();
  }

  /** Si hay que mandar el POST de creación, o si ya se mandó en un intento anterior. */
  debeCrear(): boolean {
    return this.actual === null;
  }

  marcarCreada(sid: string) {
    this.actual ??= { sid, subidas: 0 };
  }

  /** Cuántas fotos de esta carga ya se subieron. */
  subidas(): number {
    return this.actual?.subidas ?? 0;
  }

  marcarFotoSubida() {
    if (this.actual) this.actual.subidas++;
  }

  /** Si esta carga ya se creó y quedó a mitad de subir sus fotos. */
  guardando(): boolean {
    return this.actual !== null;
  }

  /**
   * Se llama cuando el guardado terminó bien, para que la carga siguiente arranque de
   * cero. Sin esto, si el formulario sigue montado (la recarga del viaje tardó o falló por
   * mala señal), la carga siguiente encontraba `debeCrear() === false`, no mandaba su POST,
   * y la pantalla igual le decía al chofer que había guardado.
   */
  reset() {
    this.actual = null;
  }
}
