import { useEffect, useState } from "react";
import { esIOS, estaInstalada } from "../lib/pwa";

/** El evento que Chrome dispara cuando la app se puede instalar. No está en los tipos del DOM. */
interface PromptInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OCULTO = "tsm_instalar_oculto";

/**
 * Invitación a instalar la app en el celular.
 *
 * En Android el navegador da un botón: se aprieta y queda instalada. En iPhone no existe
 * ese botón — hay que hacer Compartir → Agregar a inicio a mano, así que ahí lo único que
 * se puede hacer es explicárselo con los pasos.
 *
 * Y no es sólo cosmético: en iPhone las notificaciones SÓLO funcionan si la app se abrió
 * desde la pantalla de inicio. En una pestaña de Safari, pedir permiso no sirve de nada.
 *
 * Si ya está instalada no se muestra nada, y se puede cerrar para siempre: un cartel que
 * vuelve todos los días en la pantalla que el chofer usa diez veces por día es un estorbo.
 */
export function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null);
  const [visible, setVisible] = useState(false);
  const [pasosIOS, setPasosIOS] = useState(false);

  useEffect(() => {
    if (estaInstalada() || localStorage.getItem(OCULTO)) return;

    if (esIOS()) {
      setVisible(true);
      return;
    }
    const alPoder = (e: Event) => {
      e.preventDefault(); // sin esto el navegador muestra su propio cartel y perdemos el control
      setPrompt(e as PromptInstalacion);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", alPoder);
    return () => window.removeEventListener("beforeinstallprompt", alPoder);
  }, []);

  if (!visible) return null;

  function cerrar() {
    localStorage.setItem(OCULTO, "1");
    setVisible(false);
  }

  async function instalar() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") cerrar();
  }

  return (
    <div className="mb-4 border-l-4 border-l-brand bg-brand/[.06] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-cond text-[15px] font-semibold text-ink">
            Instalá TSM en el celular
          </div>
          <p className="mt-0.5 text-sm text-ink/65">
            {esIOS()
              ? "Se abre como una app, sin la barra del navegador, y es lo que permite recibir los avisos."
              : "Se abre como una app, sin la barra del navegador, y entra directo desde el ícono."}
          </p>

          {esIOS() && pasosIOS && (
            <ol className="mt-2 space-y-1 text-sm text-ink/75">
              <li>
                1 · Tocá <b>Compartir</b> abajo (el cuadrado con la flecha).
              </li>
              <li>
                2 · Elegí <b>Agregar a inicio</b>.
              </li>
              <li>3 · Abrila desde el ícono nuevo, no desde Safari.</li>
            </ol>
          )}
        </div>

        <div className="flex flex-none gap-2">
          {esIOS() ? (
            <button
              type="button"
              onClick={() => setPasosIOS((v) => !v)}
              className="btn btn-primary"
            >
              {pasosIOS ? "Listo" : "Cómo"}
            </button>
          ) : (
            <button type="button" onClick={instalar} className="btn btn-primary">
              Instalar
            </button>
          )}
          <button type="button" onClick={cerrar} className="text-sm text-ink/50 hover:text-ink">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
