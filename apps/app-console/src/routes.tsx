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
import PestControlDashboard from "./pages/PestControlDashboard";
import WebhookList from "./pages/WebhookList";
import MonitorList from "./pages/MonitorList";
import CompassExplorer from "./pages/CompassExplorer";
import NotificationsPage from "./pages/NotificationsPage";
import PipelineExplorer from "./pages/PipelineExplorer";
import NetworkGraph from "./pages/NetworkGraph";
import Workshop from "./pages/Workshop";
import Contour from "./pages/Contour";
import DataConnection from "./pages/DataConnection";
import DataLineage from "./pages/DataLineage";
import CodeWorkbook from "./pages/CodeWorkbook";
import Scenarios from "./pages/Scenarios";
import AIPChat from "./pages/AIPChat";
import DataHealth from "./pages/DataHealth";
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
  { path: "pipelines", element: protect(<PipelineExplorer />) },
  { path: "graph", element: protect(<NetworkGraph />) },
  { path: "workshop", element: protect(<Workshop />) },
  { path: "contour", element: protect(<Contour />) },
  { path: "data-connection", element: protect(<DataConnection />) },
  { path: "pest-control", element: protect(<PestControlDashboard />) },
  { path: "lineage", element: protect(<DataLineage />) },
  { path: "workbook", element: protect(<CodeWorkbook />) },
  { path: "scenarios", element: protect(<Scenarios />) },
  { path: "aip", element: protect(<AIPChat />) },
  { path: "data-health", element: protect(<DataHealth />) },
];

export default routes;
