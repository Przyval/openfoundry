import { useCallback, useState } from "react";
import {
  Alignment,
  Button,
  Navbar,
  NavbarDivider,
  NavbarGroup,
  NavbarHeading,
} from "@blueprintjs/core";
import { useNavigate, useRoutes } from "react-router-dom";
import { ErrorBoundary, NetworkStatusBanner } from "@openfoundry/ui-components";
import GlobalSearch from "./components/GlobalSearch";
import Sidebar from "./components/Sidebar";
import { AuthProvider, useAuth } from "./context/AuthContext";
import routes from "./routes";

function AppShell() {
  const [dark, setDark] = useState(false);
  const navigate = useNavigate();
  const routeElement = useRoutes(routes);
  const { isAuthenticated, currentUser, logout } = useAuth();

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  return (
    <div className={`app-shell ${dark ? "bp5-dark" : ""}`}>
      {/* ---------- Top Navbar ---------- */}
      <Navbar fixedToTop={false}>
        <NavbarGroup align={Alignment.LEFT}>
          <NavbarHeading
            style={{ cursor: "pointer", fontWeight: 700 }}
            onClick={() => navigate("/")}
          >
            OpenFoundry
          </NavbarHeading>
          <NavbarDivider />
          <Button
            minimal
            icon="diagram-tree"
            text="Ontology"
            onClick={() => navigate("/ontology")}
          />
          <Button
            minimal
            icon="cube"
            text="Objects"
            onClick={() => navigate("/objects")}
          />
          <Button
            minimal
            icon="database"
            text="Datasets"
            onClick={() => navigate("/datasets")}
          />
          <Button
            minimal
            icon="play"
            text="Actions"
            onClick={() => navigate("/actions")}
          />
          <Button
            minimal
            icon="function"
            text="Functions"
            onClick={() => navigate("/functions")}
          />
          <Button
            minimal
            icon="people"
            text="Admin"
            onClick={() => navigate("/admin/users")}
          />
        </NavbarGroup>
        <NavbarGroup align={Alignment.RIGHT}>
          <GlobalSearch />
          <NavbarDivider />
          <Button
            minimal
            icon={dark ? "flash" : "moon"}
            onClick={toggleDark}
            aria-label="Toggle dark mode"
          />
          {isAuthenticated && currentUser && (
            <>
              <NavbarDivider />
              <Button
                minimal
                icon="user"
                text={currentUser.username}
                disabled
              />
              <Button
                minimal
                icon="log-out"
                text="Logout"
                onClick={handleLogout}
              />
            </>
          )}
        </NavbarGroup>
      </Navbar>

      {/* ---------- Network status ---------- */}
      <NetworkStatusBanner />

      {/* ---------- Body: sidebar + main ---------- */}
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <ErrorBoundary>
            {routeElement}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
