import { useState } from "react";
import { enablePush, pushState, pushSupported, type PushState } from "../lib/push";

/** Botón para activar notificaciones push. Pensado para fondos navy. */
export function NotificationsButton({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>(pushState());
  const [busy, setBusy] = useState(false);

  if (!pushSupported()) return null;

  async function activate() {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch {
      setState("denied");
    } finally {
      setBusy(false);
    }
  }

  const Bell = (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );

  if (state === "granted") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-st-greenDot"
        title="Notificaciones activas"
      >
        {Bell}
        {!compact && "Activas"}
      </span>
    );
  }

  if (state === "denied") {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-bg/40"
        title="Bloqueadas en el navegador"
      >
        {Bell}
        {!compact && "Bloqueadas"}
      </span>
    );
  }

  return (
    <button
      onClick={activate}
      disabled={busy}
      className="inline-flex items-center gap-1.5 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-400 hover:text-bg disabled:opacity-50"
      title="Activar notificaciones"
    >
      {Bell}
      {!compact && (busy ? "Activando…" : "Notificaciones")}
    </button>
  );
}
