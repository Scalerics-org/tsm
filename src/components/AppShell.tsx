import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ROLES } from "@shared/domain";

/** Ícono de camión del sistema FLETA. */
export function TruckMark({ size = 20, stroke = "#f2f2f3" }: { size?: number; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={stroke} strokeWidth={1.5}>
      <path d="M1 6h11v10H1z" />
      <path d="M12 9h4.5l3 3.5V16H12z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 flex-none place-items-center bg-brand">
        <TruckMark />
      </span>
      {!compact && (
        <span className="font-cond text-[22px] font-semibold tracking-[0.06em] text-bg">FLETA</span>
      )}
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const I = {
  grid: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M4 13h7V4H4zM13 20h7v-9h-7zM4 20h7v-4H4zM13 8h7V4h-7z" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M1 6h11v10H1z" />
      <path d="M12 9h4.5l3 3.5V16H12z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  driver: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
};

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  [ROLES.ENCARGADO]: [
    { to: "/panel", label: "Resumen", icon: I.grid },
    { to: "/panel/viajes", label: "Viajes", icon: I.list },
    { to: "/panel/viajes/nuevo", label: "Nuevo viaje", icon: I.plus },
  ],
  [ROLES.ADMIN]: [
    { to: "/panel", label: "Resumen", icon: I.grid },
    { to: "/panel/viajes", label: "Viajes", icon: I.list },
    { to: "/admin/choferes", label: "Choferes", icon: I.driver },
    { to: "/admin/camiones", label: "Camiones", icon: I.truck },
    { to: "/admin/usuarios", label: "Usuarios", icon: I.user },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  if (user.role === ROLES.CHOFER) return <ChoferShell>{children}</ChoferShell>;
  return <DesktopShell items={NAV_BY_ROLE[user.role] ?? []}>{children}</DesktopShell>;
}

// ---- Chofer: móvil, header navy + bottom nav ----
function ChoferShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-bg">
      <header className="sticky top-0 z-[500] flex items-center gap-3 bg-navy px-4 py-3">
        <Logo />
        <span className="ml-auto text-right leading-tight">
          <span className="block text-sm font-semibold text-bg">{user?.name}</span>
          <span className="block text-[11px] text-bg/55">Chofer</span>
        </span>
      </header>

      <main className="flex-1 px-4 py-5 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-[500] mx-auto grid max-w-md grid-cols-2 border-t border-ink/15 bg-surface">
        <NavLink
          to="/viajes"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 py-3 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] ${
              isActive ? "border-t-[3px] border-brand text-brand-700" : "text-ink/50"
            }`
          }
        >
          {I.truck}
          Viajes
        </NavLink>
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="flex flex-col items-center justify-center gap-1 py-3 font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-ink/50"
        >
          {I.user}
          Salir
        </button>
      </nav>
    </div>
  );
}

// ---- Ops / Admin: escritorio, sidebar navy ----
function DesktopShell({ items, children }: { items: NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col bg-navy py-5 md:flex">
        <div className="px-5 pb-6">
          <Logo />
        </div>
        <nav className="flex flex-col">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/panel"}
              className={({ isActive }) =>
                `flex items-center gap-3 border-l-[3px] px-5 py-3 font-cond text-[15px] font-semibold uppercase tracking-[0.08em] ${
                  isActive
                    ? "border-brand bg-brand/20 text-bg"
                    : "border-transparent text-bg/65 hover:bg-white/5 hover:text-bg"
                }`
              }
            >
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 pt-4">
          <div className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-bg">
            {user?.name}
          </div>
          <div className="mt-0.5 text-[12px] capitalize text-bg/55">{user?.role}</div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="mt-3 font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-400 hover:text-bg"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Top bar (móvil) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[500] flex items-center gap-3 bg-navy px-4 py-3 md:hidden">
          <Logo />
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="ml-auto font-cond text-sm font-semibold uppercase tracking-[0.08em] text-brand-400"
          >
            Salir
          </button>
        </header>
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-ink/10 bg-surface px-3 py-2 md:hidden">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/panel"}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 px-3 py-1.5 font-cond text-sm font-semibold uppercase tracking-[0.06em] ${
                  isActive ? "bg-navy text-bg" : "text-ink/60"
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
