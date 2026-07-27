import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TRIP_STATUS, TRIP_STATUS_LABEL, type TripStatus } from "@shared/domain";

/** Marcas de registro tipo blueprint en las 4 esquinas. */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

export function Card({
  children,
  className = "",
  corners = true,
  accent,
}: {
  children: ReactNode;
  className?: string;
  corners?: boolean;
  accent?: "blue" | "amber" | "green" | "red";
}) {
  const accentBorder = accent
    ? {
        blue: "border-l-4 border-l-st-blueDot",
        amber: "border-l-4 border-l-st-amberDot",
        green: "border-l-4 border-l-st-greenDot",
        red: "border-l-4 border-l-st-redDot",
      }[accent]
    : "";
  return (
    <div className={`panel p-4 ${accentBorder} ${className}`}>
      {corners && <Corners />}
      {children}
    </div>
  );
}

type BtnVariant = "primary" | "navy" | "secondary" | "ghost" | "success" | "danger";
export function Button({
  children,
  variant = "primary",
  className = "",
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const map: Record<BtnVariant, string> = {
    primary: "btn-primary",
    navy: "btn-navy",
    secondary: "btn-secondary",
    ghost: "btn-secondary",
    success: "btn-success",
    danger: "btn-danger",
  };
  return (
    <button {...rest} disabled={rest.disabled || loading} className={`btn ${map[variant]} ${className}`}>
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-brand/30 border-t-brand"
      style={{ width: size, height: size }}
    />
  );
}

const STATUS: Record<
  TripStatus,
  { bg: string; bd: string; tx: string; dot: string; pulse?: boolean }
> = {
  [TRIP_STATUS.PENDIENTE]: {
    bg: "bg-st-amberBg",
    bd: "border-st-amberBd",
    tx: "text-st-amberTx",
    dot: "bg-st-amberDot",
  },
  [TRIP_STATUS.EN_RUTA]: {
    bg: "bg-st-blueBg",
    bd: "border-st-blueBd",
    tx: "text-st-blueTx",
    dot: "bg-st-blueDot",
    pulse: true,
  },
  [TRIP_STATUS.COMPLETADO]: {
    bg: "bg-st-greenBg",
    bd: "border-st-greenBd",
    tx: "text-st-greenTx",
    dot: "bg-st-greenDot",
  },
  [TRIP_STATUS.CANCELADO]: {
    bg: "bg-neutral-200",
    bd: "border-neutral-400",
    tx: "text-neutral-600",
    dot: "bg-neutral-500",
  },
  [TRIP_STATUS.CON_INCIDENCIA]: {
    bg: "bg-st-redBg",
    bd: "border-st-redBd",
    tx: "text-st-redTx",
    dot: "bg-st-redDot",
  },
};

export function StatusBadge({ status }: { status: TripStatus }) {
  const s = STATUS[status];
  return (
    <span className={`pill ${s.bg} ${s.bd} ${s.tx}`}>
      <i className={`pill-dot ${s.dot} ${s.pulse ? "animate-fl" : ""}`} />
      {TRIP_STATUS_LABEL[status].toUpperCase()}
    </span>
  );
}

/** KPI tipo dashboard: borde de acento a la izquierda + número grande condensado. */
export function Stat({
  label,
  value,
  hint,
  accent = "blue",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "blue" | "amber" | "green" | "red";
}) {
  const accentBorder = {
    blue: "border-l-st-blueDot",
    amber: "border-l-st-amberDot",
    green: "border-l-st-greenDot",
    red: "border-l-st-redDot",
  }[accent];
  const accentText = {
    blue: "text-brand-700",
    amber: "text-st-amberTx",
    green: "text-st-greenTx",
    red: "text-st-redTx",
  }[accent];
  return (
    <div className={`panel border-l-4 ${accentBorder} px-4 py-3`}>
      <Corners />
      <div className={`font-cond text-[11px] font-semibold uppercase tracking-[0.14em] ${accentText}`}>
        {label}
      </div>
      <div className="mt-1 font-cond text-3xl font-semibold leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink/50">{hint}</div>}
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
  return (
    <p className="mt-2 border-l-4 border-st-redDot bg-st-redBg px-3 py-2 text-sm text-st-redTx">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="panel flex items-center justify-center px-6 py-12 text-center text-ink/50">
      <Corners />
      {children}
    </div>
  );
}
