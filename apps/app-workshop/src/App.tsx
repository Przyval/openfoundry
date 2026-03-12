import { useCallback, useState } from "react";
import {
  Alignment,
  Button,
  Navbar,
  NavbarDivider,
  NavbarGroup,
  NavbarHeading,
} from "@blueprintjs/core";
import { useNavigate, useRoutes, Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { Builder } from "./pages/Builder";
import { PagesList } from "./pages/PagesList";
import { PreviewPage } from "./pages/PreviewPage";

const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/pages" replace /> },
  { path: "/pages", element: <PagesList /> },
  { path: "/builder", element: <Builder /> },
  { path: "/builder/:pageId", element: <Builder /> },
  { path: "/preview/:pageId", element: <PreviewPage /> },
];

export default function App() {
  const [dark, setDark] = useState(false);
  const navigate = useNavigate();
  const routeElement = useRoutes(routes);

  const toggleDark = useCallback(() => setDark((d) => !d), []);

  return (
    <div className={`workshop-shell ${dark ? "bp5-dark" : ""}`}>
      <Navbar fixedToTop={false}>
        <NavbarGroup align={Alignment.LEFT}>
          <NavbarHeading
            style={{ cursor: "pointer", fontWeight: 700 }}
            onClick={() => navigate("/pages")}
          >
            OpenFoundry Workshop
          </NavbarHeading>
          <NavbarDivider />
          <Button
            minimal
            icon="document"
            text="Pages"
            onClick={() => navigate("/pages")}
          />
          <Button
            minimal
            icon="build"
            text="New Builder"
            onClick={() => navigate("/builder")}
          />
        </NavbarGroup>
        <NavbarGroup align={Alignment.RIGHT}>
          <Button
            minimal
            icon={dark ? "flash" : "moon"}
            onClick={toggleDark}
            aria-label="Toggle dark mode"
          />
        </NavbarGroup>
      </Navbar>

      <div className="workshop-body">
        {routeElement}
      </div>
    </div>
  );
}
