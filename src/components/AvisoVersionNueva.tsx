import { useEffect, useState } from "react";
import {
  descartarVersion,
  hayVersionNueva,
  versionDelServidor,
  versionDescartada,
  versionPropia,
} from "../lib/version-app";

/**
 * "Hay una versión nueva de la app": una franja chica arriba, con "Actualizar" y "Ahora no".
 *
 * Reglas que no se negocian:
 * - Nunca recarga sola. Sólo el botón, que toca el chofer: si se recargara mientras llena una carga,
 *   le borraría lo que escribió.
 * - Sólo mira cuando la app VUELVE al frente (no mientras está tocando algo) y nunca al abrirse: una
 *   app recién abierta ya trae lo último.
 * - "Ahora no" descarta ESA versión y no vuelve; sólo reaparece si sale una todavía más nueva. Así con
 *   varios deploys por día no es una franja nueva cada vez que abre la app.
 * - Si el pedido falla (sin señal) no se muestra nada, ni error ni franja.
 * - Es una franja dentro de la página, no una capa encima: no tapa nada.
 */
export function AvisoVersionNueva() {
  const [nueva, setNueva] = useState<string | null>(null);

  useEffect(() => {
    const propia = versionPropia();
    if (!propia) return; // desarrollo: no hay hash
    let vigente = true;
    const alVolver = async () => {
      if (document.visibilityState !== "visible") return;
      const servidor = await versionDelServidor();
      if (vigente && hayVersionNueva(propia, servidor, versionDescartada())) setNueva(servidor);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  if (!nueva) return null;
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-3 border-l-4 border-brand bg-brand/10 px-3 py-2 text-sm text-ink"
    >
      <span className="min-w-0 flex-1">Hay una versión nueva de la app.</span>
      <button
        type="button"
        onClick={() => location.reload()}
        className="flex-none bg-brand px-3 py-3 font-cond text-sm font-semibold uppercase tracking-[0.08em] text-bg"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => {
          descartarVersion(nueva);
          setNueva(null);
        }}
        className="flex-none px-2 py-3 text-xs text-ink/60 underline"
      >
        Ahora no
      </button>
    </div>
  );
}
