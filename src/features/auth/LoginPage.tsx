import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Button, ErrorText, Field } from "../../components/ui";
import { ApiError } from "../../lib/api";

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
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl font-black">
            S
          </div>
          <h1 className="text-2xl font-bold text-white">Scalerics Logística</h1>
          <p className="text-sm text-slate-400">Control de viajes y evidencia de carga</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <Field label="Email">
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.uy"
              required
            />
          </Field>
          <Field label="Contraseña">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>
        </form>

        <div className="mt-6 card p-4 text-sm">
          <p className="mb-2 font-semibold text-slate-300">Cuentas de demo (contraseña: demo1234)</p>
          <ul className="space-y-1">
            {DEMO.map((d) => (
              <li key={d.email} className="flex items-center justify-between">
                <span className="text-slate-400">{d.role}</span>
                <button
                  className="font-mono text-brand-300 hover:underline"
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
