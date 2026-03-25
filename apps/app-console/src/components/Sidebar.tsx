import { useCallback, useRef } from "react";
import { Menu, MenuDivider, MenuItem } from "@blueprintjs/core";
import { useLocation, useNavigate } from "react-router-dom";

/* ------------------------------------------------------------------ */
/*  Navigation sections — mirrors Palantir Foundry 5-pillar structure  */
/* ------------------------------------------------------------------ */

const PLATFORM_ITEMS = [
  { path: "/", label: "Dashboard", icon: "dashboard" as const },
  { path: "/pest-control", label: "Pest Control", icon: "bug" as const },
  { path: "/aip", label: "AIP Chat", icon: "chat" as const },
  { path: "/compass", label: "Compass", icon: "folder-open" as const },
  { path: "/notifications", label: "Notifications", icon: "notifications" as const },
];

const DATA_ITEMS = [
  { path: "/ontology", label: "Ontology", icon: "diagram-tree" as const },
  { path: "/objects", label: "Object Explorer", icon: "cube" as const },
  { path: "/graph", label: "Network Graph", icon: "graph" as const },
  { path: "/contour", label: "Contour", icon: "horizontal-bar-chart" as const },
  { path: "/lineage", label: "Data Lineage", icon: "flows" as const },
  { path: "/data-health", label: "Data Health", icon: "heart" as const },
  { path: "/datasets", label: "Datasets", icon: "database" as const },
  { path: "/data-connection", label: "Data Connection", icon: "exchange" as const },
  { path: "/pipelines", label: "Pipelines", icon: "data-lineage" as const },
];

const BUILD_ITEMS = [
  { path: "/workshop", label: "Workshop", icon: "applications" as const },
  { path: "/workbook", label: "Code Workbook", icon: "code" as const },
  { path: "/scenarios", label: "Scenarios", icon: "git-branch" as const },
  { path: "/actions", label: "Actions", icon: "play" as const },
  { path: "/functions", label: "Functions", icon: "function" as const },
];

const AUTOMATION_ITEMS = [
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

const ALL_ITEMS = [
  ...PLATFORM_ITEMS,
  ...DATA_ITEMS,
  ...BUILD_ITEMS,
  ...AUTOMATION_ITEMS,
  ...ADMIN_ITEMS,
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLUListElement>(null);

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();

      const currentIdx = ALL_ITEMS.findIndex((item) => isActive(item.path));
      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < ALL_ITEMS.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : ALL_ITEMS.length - 1;
      }
      navigate(ALL_ITEMS[nextIdx].path);

      // Focus the next menu item
      const menuItems = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
      if (menuItems && menuItems[nextIdx]) {
        menuItems[nextIdx].focus();
      }
    },
    [navigate, location.pathname],
  );

  const renderItems = (
    items: Array<{ path: string; label: string; icon: string }>,
  ) =>
    items.map((item) => (
      <MenuItem
        key={item.path}
        icon={item.icon as any}
        text={item.label}
        active={isActive(item.path)}
        aria-current={isActive(item.path) ? "page" : undefined}
        onClick={() => navigate(item.path)}
      />
    ));

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Main navigation">
      <Menu ulRef={menuRef} onKeyDown={handleKeyDown}>
        {/* Platform */}
        <MenuDivider title="Platform" />
        {renderItems(PLATFORM_ITEMS)}

        {/* Data */}
        <MenuDivider title="Data" />
        {renderItems(DATA_ITEMS)}

        {/* Build */}
        <MenuDivider title="Build" />
        {renderItems(BUILD_ITEMS)}

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
