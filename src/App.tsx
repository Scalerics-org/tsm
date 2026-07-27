import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { ROLES, type Role } from "@shared/domain";
import { Spinner } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./features/auth/LoginPage";
import { ChoferTripsPage } from "./features/chofer/ChoferTripsPage";
import { ChoferTripDetailPage } from "./features/chofer/ChoferTripDetailPage";
import { OpsDashboard } from "./features/operaciones/OpsDashboard";
import { OpsTripsPage } from "./features/operaciones/OpsTripsPage";
import { OpsTripDetailPage } from "./features/operaciones/OpsTripDetailPage";
import { NewTripPage } from "./features/operaciones/NewTripPage";
import { AdminDriversPage } from "./features/admin/AdminDriversPage";
import { AdminTrucksPage } from "./features/admin/AdminTrucksPage";
import { AdminUsersPage } from "./features/admin/AdminUsersPage";

function homePath(role: Role): string {
  if (role === ROLES.CHOFER) return "/viajes";
  if (role === ROLES.ADMIN) return "/panel";
  return "/panel";
}

function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const OPS: Role[] = [ROLES.ENCARGADO, ROLES.ADMIN];

  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<Navigate to={homePath(user.role)} replace />} />

        {/* Chofer */}
        <Route
          path="/viajes"
          element={
            <RequireRole roles={[ROLES.CHOFER]}>
              <ChoferTripsPage />
            </RequireRole>
          }
        />
        <Route
          path="/viajes/:id"
          element={
            <RequireRole roles={[ROLES.CHOFER]}>
              <ChoferTripDetailPage />
            </RequireRole>
          }
        />

        {/* Encargado / Admin */}
        <Route
          path="/panel"
          element={
            <RequireRole roles={OPS}>
              <OpsDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/panel/viajes"
          element={
            <RequireRole roles={OPS}>
              <OpsTripsPage />
            </RequireRole>
          }
        />
        <Route
          path="/panel/viajes/nuevo"
          element={
            <RequireRole roles={OPS}>
              <NewTripPage />
            </RequireRole>
          }
        />
        <Route
          path="/panel/viajes/:id"
          element={
            <RequireRole roles={OPS}>
              <OpsTripDetailPage />
            </RequireRole>
          }
        />

        {/* Admin */}
        <Route
          path="/admin/choferes"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <AdminDriversPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/camiones"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <AdminTrucksPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <RequireRole roles={[ROLES.ADMIN]}>
              <AdminUsersPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to={homePath(user.role)} replace />} />
      </Routes>
    </AppShell>
  );
}
