import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { TruckMark } from "../../components/AppShell";

const DEMO = [
  { role: "Chofer", email: "carlos@demo.uy" },
  { role: "Encargado", email: "ops@demo.uy" },
  { role: "Admin", email: "admin@demo.uy" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Tarjeta navy estilo FLETA */}
        <div className="blueprint elev-md bg-navy p-7">
          <i className="corner tl" />
          <i className="corner tr" />
          <i className="corner bl" />
          <i className="corner br" />

          <div className="mb-7 flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center bg-brand">
              <TruckMark size={24} />
            </span>
            <div>
              <div className="font-cond text-3xl font-semibold leading-none tracking-[0.04em] text-bg">
                FLETA
              </div>
              <p className="mt-1 text-[13px] text-bg/60">Control de viajes de flota</p>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-bg/65">
                Email
              </label>
              <input
                className="h-12 w-full border border-bg/25 bg-bg/[.08] px-3 text-bg outline-none placeholder:text-bg/40 focus:border-brand"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.uy"
                required
              />
            </div>
            <div>
              <label className="mb-2 block font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-bg/65">
                Clave
              </label>
              <input
                className="h-12 w-full border border-bg/25 bg-bg/[.08] px-3 text-bg outline-none placeholder:text-bg/40 focus:border-brand"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="border-l-4 border-st-redDot bg-st-redBg px-3 py-2 text-sm text-st-redTx">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-14 border border-brand bg-brand font-cond text-xl font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? "Ingresando…" : "Entrar"}
            </button>
          </form>
        </div>

        {/* Cuentas de demo */}
        <div className="panel mt-6 p-4 text-sm">
          <i className="corner tl" />
          <i className="corner br" />
          <p className="mb-2 font-cond font-semibold uppercase tracking-[0.1em] text-brand-700">
            Cuentas de demo · clave demo1234
          </p>
          <ul className="space-y-1">
            {DEMO.map((d) => (
              <li key={d.email} className="flex items-center justify-between">
                <span className="text-ink/55">{d.role}</span>
                <button
                  className="font-mono text-brand-700 hover:underline"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword("demo1234");
                  }}
                >
                  {d.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
