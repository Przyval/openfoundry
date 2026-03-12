import { Menu, MenuDivider, MenuItem } from "@blueprintjs/core";
import { useLocation, useNavigate } from "react-router-dom";

/* ------------------------------------------------------------------ */
/*  Navigation sections                                                */
/* ------------------------------------------------------------------ */

const PLATFORM_ITEMS = [
  { path: "/", label: "Dashboard", icon: "dashboard" as const },
  { path: "/compass", label: "Compass", icon: "folder-open" as const },
  { path: "/notifications", label: "Notifications", icon: "notifications" as const },
];

const DATA_ITEMS = [
  { path: "/ontology", label: "Ontology", icon: "diagram-tree" as const },
  { path: "/objects", label: "Object Explorer", icon: "cube" as const },
  { path: "/datasets", label: "Datasets", icon: "database" as const },
];

const AUTOMATION_ITEMS = [
  { path: "/actions", label: "Actions", icon: "play" as const },
  { path: "/functions", label: "Functions", icon: "function" as const },
  { path: "/monitors", label: "Monitors", icon: "eye-open" as const },
  { path: "/webhooks", label: "Webhooks", icon: "globe-network" as const },
];

const ADMIN_ITEMS = [
  { path: "/admin/users", label: "Users", icon: "people" as const },
  { path: "/admin/groups", label: "Groups", icon: "group-objects" as const },
  { path: "/admin/audit", label: "Audit Log", icon: "document" as const },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  const renderItems = (
    items: Array<{ path: string; label: string; icon: string }>,
  ) =>
    items.map((item) => (
      <MenuItem
        key={item.path}
        icon={item.icon as any}
        text={item.label}
        active={isActive(item.path)}
        onClick={() => navigate(item.path)}
      />
    ));

  return (
    <aside className="app-sidebar">
      <Menu>
        {/* Platform */}
        <MenuDivider title="Platform" />
        {renderItems(PLATFORM_ITEMS)}

        {/* Data */}
        <MenuDivider title="Data" />
        {renderItems(DATA_ITEMS)}

        {/* Automation */}
        <MenuDivider title="Automation" />
        {renderItems(AUTOMATION_ITEMS)}

        {/* Admin */}
        <MenuDivider title="Admin" />
        {renderItems(ADMIN_ITEMS)}
      </Menu>
    </aside>
  );
}
