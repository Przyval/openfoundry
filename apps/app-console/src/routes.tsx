import type { RouteObject } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import OntologyExplorer from "./pages/OntologyExplorer";
import ObjectBrowser from "./pages/ObjectBrowser";
import ObjectExplorer from "./pages/ObjectExplorer";
import DatasetList from "./pages/DatasetList";
import UserManagement from "./pages/UserManagement";
import GroupManagement from "./pages/GroupManagement";
import ActionExplorer from "./pages/ActionExplorer";
import FunctionList from "./pages/FunctionList";
import AuditLog from "./pages/AuditLog";
import WebhookList from "./pages/WebhookList";
import MonitorList from "./pages/MonitorList";
import CompassExplorer from "./pages/CompassExplorer";
import NotificationsPage from "./pages/NotificationsPage";
import ProtectedRoute from "./components/ProtectedRoute";

/**
 * Wraps an element in a ProtectedRoute so unauthenticated users are
 * redirected to /login.
 */
function protect(element: React.ReactNode): React.ReactNode {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

const routes: RouteObject[] = [
  // Public
  { path: "login", element: <Login /> },

  // Protected
  { index: true, element: protect(<Dashboard />) },
  { path: "ontology", element: protect(<OntologyExplorer />) },
  {
    path: "ontology/:ontologyRid/objects/:objectType",
    element: protect(<ObjectBrowser />),
  },
  { path: "objects", element: protect(<ObjectExplorer />) },
  { path: "datasets", element: protect(<DatasetList />) },
  { path: "actions", element: protect(<ActionExplorer />) },
  { path: "functions", element: protect(<FunctionList />) },
  { path: "monitors", element: protect(<MonitorList />) },
  { path: "compass", element: protect(<CompassExplorer />) },
  { path: "notifications", element: protect(<NotificationsPage />) },
  { path: "webhooks", element: protect(<WebhookList />) },
  { path: "admin/users", element: protect(<UserManagement />) },
  { path: "admin/groups", element: protect(<GroupManagement />) },
  { path: "admin/audit", element: protect(<AuditLog />) },
];

export default routes;
