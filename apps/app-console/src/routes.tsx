import React, { Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import { Spinner } from "@blueprintjs/core";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

/* -------------------------------------------------------------------
 * Lazy-loaded pages — keeps the initial bundle small by code-splitting
 * heavy pages into separate chunks loaded on demand.
 * ---------------------------------------------------------------- */
const OntologyExplorer = React.lazy(() => import("./pages/OntologyExplorer"));
const ObjectBrowser = React.lazy(() => import("./pages/ObjectBrowser"));
const ObjectExplorer = React.lazy(() => import("./pages/ObjectExplorer"));
const DatasetList = React.lazy(() => import("./pages/DatasetList"));
const UserManagement = React.lazy(() => import("./pages/UserManagement"));
const GroupManagement = React.lazy(() => import("./pages/GroupManagement"));
const ActionExplorer = React.lazy(() => import("./pages/ActionExplorer"));
const FunctionList = React.lazy(() => import("./pages/FunctionList"));
const AuditLog = React.lazy(() => import("./pages/AuditLog"));
const PestControlDashboard = React.lazy(() => import("./pages/PestControlDashboard"));
const WebhookList = React.lazy(() => import("./pages/WebhookList"));
const MonitorList = React.lazy(() => import("./pages/MonitorList"));
const CompassExplorer = React.lazy(() => import("./pages/CompassExplorer"));
const NotificationsPage = React.lazy(() => import("./pages/NotificationsPage"));
const PipelineExplorer = React.lazy(() => import("./pages/PipelineExplorer"));
const NetworkGraph = React.lazy(() => import("./pages/NetworkGraph"));
const Workshop = React.lazy(() => import("./pages/Workshop"));
const Contour = React.lazy(() => import("./pages/Contour"));
const DataConnection = React.lazy(() => import("./pages/DataConnection"));
const DataLineage = React.lazy(() => import("./pages/DataLineage"));
const CodeWorkbook = React.lazy(() => import("./pages/CodeWorkbook"));
const Scenarios = React.lazy(() => import("./pages/Scenarios"));
const AIPChat = React.lazy(() => import("./pages/AIPChat"));
const DataHealth = React.lazy(() => import("./pages/DataHealth"));

/* Shared loading fallback */
const PageSpinner = (
  <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
    <Spinner size={40} />
  </div>
);

/**
 * Wraps an element in a ProtectedRoute so unauthenticated users are
 * redirected to /login.
 */
function protect(element: React.ReactNode): React.ReactNode {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

/** Wrap a lazy component in Suspense + ProtectedRoute. */
function lazyProtect(Component: React.LazyExoticComponent<React.ComponentType<any>>): React.ReactNode {
  return protect(
    <Suspense fallback={PageSpinner}>
      <Component />
    </Suspense>,
  );
}

const routes: RouteObject[] = [
  // Public
  { path: "login", element: <Login /> },

  // Protected — Dashboard is eagerly loaded for fast first paint
  { index: true, element: protect(<Dashboard />) },
  { path: "ontology", element: lazyProtect(OntologyExplorer) },
  {
    path: "ontology/:ontologyRid/objects/:objectType",
    element: lazyProtect(ObjectBrowser),
  },
  { path: "objects", element: lazyProtect(ObjectExplorer) },
  { path: "datasets", element: lazyProtect(DatasetList) },
  { path: "actions", element: lazyProtect(ActionExplorer) },
  { path: "functions", element: lazyProtect(FunctionList) },
  { path: "monitors", element: lazyProtect(MonitorList) },
  { path: "compass", element: lazyProtect(CompassExplorer) },
  { path: "notifications", element: lazyProtect(NotificationsPage) },
  { path: "webhooks", element: lazyProtect(WebhookList) },
  { path: "admin/users", element: lazyProtect(UserManagement) },
  { path: "admin/groups", element: lazyProtect(GroupManagement) },
  { path: "admin/audit", element: lazyProtect(AuditLog) },
  { path: "pipelines", element: lazyProtect(PipelineExplorer) },
  { path: "graph", element: lazyProtect(NetworkGraph) },
  { path: "workshop", element: lazyProtect(Workshop) },
  { path: "contour", element: lazyProtect(Contour) },
  { path: "data-connection", element: lazyProtect(DataConnection) },
  { path: "pest-control", element: lazyProtect(PestControlDashboard) },
  { path: "lineage", element: lazyProtect(DataLineage) },
  { path: "workbook", element: lazyProtect(CodeWorkbook) },
  { path: "scenarios", element: lazyProtect(Scenarios) },
  { path: "aip", element: lazyProtect(AIPChat) },
  { path: "data-health", element: lazyProtect(DataHealth) },
];

export default routes;
