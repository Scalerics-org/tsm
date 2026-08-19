import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from "../../lib/push";
import { Button, Card, ErrorText } from "../../components/ui";

/**
 * Avisos de viaje cerrado.
 *
 * "Al finalizar el viaje, notificar el celular." Cada uno lo prende en su propio teléfono:
 * el aviso va a los dispositivos que lo activaron, no a un número escrito en el código.
 * Hoy es Rodrigo; mañana se suma Diego sin que nadie toque nada.
 *
 * El botón de probar existe porque no se puede pedir que alguien espere a que un chofer
 * cierre un viaje para enterarse de que no le llegaban.
 */
export function AvisosCard() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    estadoPush().then(setEstado).catch(() => setEstado("sin-soporte"));
  }, []);

  async function alternar() {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      if (estado === "activo") {
        await desactivarPush();
        setEstado("apagado");
      } else {
        setEstado(await activarPush());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar la configuración");
    } finally {
      setBusy(false);
    }
  }

  async function probar() {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      await api.post("/push/probar", {});
      setAviso("Listo, te mandamos uno. Si no aparece, fijate que el celular no esté en silencio.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo mandar la prueba");
    } finally {
      setBusy(false);
    }
  }

  if (estado === null) return null;
  if (estado === "sin-soporte") return null;

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-cond text-lg font-semibold text-ink">Avisos de viaje cerrado</h2>
        <p className="text-sm text-ink/60">
          Te llega una notificación al celular cada vez que un chofer cierra un viaje, con el
          detalle completo.
        </p>
      </div>

      {estado === "falta-instalar" && (
        <p className="border-l-4 border-l-st-amberDot bg-st-amberBg px-3 py-2 text-sm text-ink/80">
          Primero agregá TSM a la pantalla de inicio. En iPhone los avisos sólo funcionan con la
          app instalada — abriéndola desde Safari no llegan, por más permiso que le des.
        </p>
      )}

      {estado === "bloqueado" && (
        <p className="border-l-4 border-l-st-redDot bg-st-redBg px-3 py-2 text-sm text-ink/80">
          Bloqueaste las notificaciones para este sitio. Hay que habilitarlas desde los ajustes
          del navegador; desde acá no se puede volver a pedir.
        </p>
      )}

      {(estado === "activo" || estado === "apagado") && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={alternar} loading={busy} variant={estado === "activo" ? "ghost" : "primary"}>
            {estado === "activo" ? "Apagar en este celular" : "Activar avisos"}
          </Button>
          {estado === "activo" && (
            <Button variant="secondary" onClick={probar} loading={busy}>
              Mandarme uno de prueba
            </Button>
          )}
          {estado === "activo" && (
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-st-greenTx">
              Activos en este dispositivo
            </span>
          )}
        </div>
      )}

      {aviso && <p className="text-sm text-st-greenTx">{aviso}</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
