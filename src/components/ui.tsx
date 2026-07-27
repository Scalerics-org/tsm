import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TRIP_STATUS, TRIP_STATUS_LABEL, type TripStatus } from "@shared/domain";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

type BtnVariant = "primary" | "ghost" | "danger" | "success";
export function Button({
  children,
  variant = "primary",
  className = "",
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: "bg-brand-600 hover:bg-brand-500 text-white",
    ghost: "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10",
    danger: "bg-red-600/90 hover:bg-red-500 text-white",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
        transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/30 border-t-white"
      style={{ width: size, height: size }}
    />
  );
}

const STATUS_STYLES: Record<TripStatus, string> = {
  [TRIP_STATUS.PENDIENTE]: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  [TRIP_STATUS.EN_RUTA]: "bg-brand-500/15 text-brand-300 border-brand-500/30",
  [TRIP_STATUS.COMPLETADO]: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  [TRIP_STATUS.CANCELADO]: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  [TRIP_STATUS.CON_INCIDENCIA]: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function StatusBadge({ status }: { status: TripStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {TRIP_STATUS_LABEL[status]}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card flex items-center justify-center px-6 py-12 text-center text-slate-400">
      {children}
    </div>
  );
}
