import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ROLES } from "@shared/domain";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  [ROLES.CHOFER]: [{ to: "/viajes", label: "Mis viajes", icon: "🚚" }],
  [ROLES.ENCARGADO]: [
    { to: "/panel", label: "Panel", icon: "📊" },
    { to: "/panel/viajes", label: "Viajes", icon: "🗺️" },
    { to: "/panel/viajes/nuevo", label: "Nuevo viaje", icon: "➕" },
  ],
  [ROLES.ADMIN]: [
    { to: "/panel", label: "Panel", icon: "📊" },
    { to: "/panel/viajes", label: "Viajes", icon: "🗺️" },
    { to: "/admin/choferes", label: "Choferes", icon: "🧑‍✈️" },
    { to: "/admin/camiones", label: "Camiones", icon: "🚛" },
    { to: "/admin/usuarios", label: "Usuarios", icon: "👤" },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return <>{children}</>;
  const items = NAV_BY_ROLE[user.role] ?? [];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-[500] border-b border-white/10 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg font-black">
              S
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-white">Scalerics Logística</div>
              <div className="text-xs text-slate-400 capitalize">{user.role}</div>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === "/panel"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  }`
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">{user.name}</span>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Nav móvil */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 md:hidden">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/panel"}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                  isActive ? "bg-white/10 text-white" : "text-slate-300"
                }`
              }
            >
              <span>{it.icon}</span>
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
