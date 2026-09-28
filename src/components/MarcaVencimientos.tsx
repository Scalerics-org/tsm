import { hoyEnUruguay, resumenDeVencimientos } from "@shared/vencimientos";

/**
 * La marca que las listas de Camiones y de Choferes muestran cuando algún documento está vencido o
 * por vencer: ahí es donde se mira de un vistazo.
 *
 * No muestra NADA si no hay nada que avisar. Un camión sin ninguna fecha cargada —hoy son todos— se
 * ve exactamente como antes, sin "sin datos" ni rojos: no se sabe no es lo mismo que vencido.
 * Sólo avisa, nunca bloquea.
 */
export function MarcaVencimientos({
  fechas,
  className = "",
}: {
  fechas: (string | null | undefined)[];
  className?: string;
}) {
  const { vencidos, porVencer } = resumenDeVencimientos(fechas, hoyEnUruguay());
  if (!vencidos && !porVencer) return null;
  const vencido = vencidos > 0;
  const texto = vencido
    ? vencidos > 1
      ? `${vencidos} vencidos`
      : "Vencido"
    : porVencer > 1
      ? `${porVencer} por vencer`
      : "Por vencer";
  return (
    <span
      title="Documentos: mirá las fechas en la ficha. Es un aviso, no impide salir."
      className={`inline-block whitespace-nowrap border-l-4 px-2 py-0.5 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] ${
        vencido
          ? "border-l-st-redDot bg-st-redBg text-st-redTx"
          : "border-l-st-amberDot bg-st-amberBg text-st-amberTx"
      } ${className}`}
    >
      {texto}
    </span>
  );
}
