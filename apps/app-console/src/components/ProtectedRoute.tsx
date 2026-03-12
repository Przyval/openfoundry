import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@blueprintjs/core";
import { useAuth } from "../context/AuthContext";

/**
 * Wrapper that redirects unauthenticated users to /login.
 *
 * While the initial auth check is in progress a centered spinner is shown.
 */
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Spinner size={50} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
