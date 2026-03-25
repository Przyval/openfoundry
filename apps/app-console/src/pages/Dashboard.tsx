import { useCallback } from "react";
import {
  Button,
  Card,
  Elevation,
  HTMLTable,
  Icon,
  Intent,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatsResponse {
  counts: {
    ontologies: number;
    objectTypes: number;
    objects: number;
    users: number;
    groups: number;
    datasets: number;
    functions: number;
    actions: number;
  };
  recentActivity: Array<{
    timestamp: string;
    user: string;
    action: string;
    resourceType: string;
    resourceRid: string;
  }>;
}

interface StatCardDef {
  title: string;
  icon: IconName;
  countKey: keyof StatsResponse["counts"];
  link: string;
}

/* ------------------------------------------------------------------ */
/*  Card definitions (2 rows x 4 cols)                                 */
/* ------------------------------------------------------------------ */

const STAT_CARDS: StatCardDef[] = [
  { title: "Ontologies", icon: "diagram-tree", countKey: "ontologies", link: "/ontology" },
  { title: "Object Types", icon: "cube", countKey: "objectTypes", link: "/ontology" },
  { title: "Objects", icon: "th", countKey: "objects", link: "/ontology" },
  { title: "Users", icon: "people", countKey: "users", link: "/admin/users" },
  { title: "Groups", icon: "group-objects", countKey: "groups", link: "/admin/groups" },
  { title: "Datasets", icon: "database", countKey: "datasets", link: "/datasets" },
  { title: "Functions", icon: "function", countKey: "functions", link: "/functions" },
  { title: "Actions", icon: "play", countKey: "actions", link: "/actions" },
];

/* ------------------------------------------------------------------ */
/*  Action intent mapping                                              */
/* ------------------------------------------------------------------ */

function intentForAction(action: string): Intent {
  switch (action) {
    case "CREATE":
      return Intent.SUCCESS;
    case "UPDATE":
      return Intent.PRIMARY;
    case "DELETE":
      return Intent.DANGER;
    default:
      return Intent.NONE;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, refetch } = useApi<StatsResponse>("/api/v2/admin/stats");

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const counts = data?.counts;
  const recentActivity = data?.recentActivity ?? [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your OpenFoundry platform — ontologies, objects, datasets, and more."
        actions={
          <Button minimal icon="refresh" text="Refresh" onClick={handleRefresh} />
        }
      />

      {/* ---------- Loading State ---------- */}
      {loading && !data && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Spinner size={50} />
        </div>
      )}

      {/* ---------- Stat Cards Grid ---------- */}
      {counts && (
        <div className="dashboard-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {STAT_CARDS.map((card) => (
            <Card
              key={card.title}
              className="dashboard-card"
              elevation={Elevation.TWO}
              interactive
              onClick={() => navigate(card.link)}
              aria-label={`${counts[card.countKey]} ${card.title}`}
            >
              <Icon icon={card.icon} size={24} style={{ marginBottom: 8, color: "#5c7080" }} />
              <div className="count" role="status">{counts[card.countKey]}</div>
              <div style={{ color: "#5c7080", fontSize: "0.9rem" }}>{card.title}</div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Bottom panels: Recent Activity + Quick Actions ---------- */}
      {data && (
        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          {/* Recent Activity */}
          <Card
            elevation={Elevation.ONE}
            style={{ flex: 2, overflow: "auto" }}
          >
            <h4 style={{ marginTop: 0 }}>Recent Activity</h4>
            {recentActivity.length === 0 ? (
              <p style={{ color: "#5c7080" }}>No recent activity.</p>
            ) : (
              <HTMLTable bordered compact striped style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((entry, idx) => (
                    <tr key={idx}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td>{entry.user}</td>
                      <td>
                        <Tag minimal intent={intentForAction(entry.action)}>
                          {entry.action}
                        </Tag>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{entry.resourceType}</span>
                        <br />
                        <code style={{ fontSize: "0.8rem" }}>{entry.resourceRid}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </Card>

          {/* Quick Actions */}
          <Card elevation={Elevation.ONE} style={{ flex: 1, minWidth: 220 }}>
            <h4 style={{ marginTop: 0 }}>Quick Actions</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Button
                icon="diagram-tree"
                text="Create Ontology"
                intent={Intent.PRIMARY}
                fill
                onClick={() => navigate("/ontology")}
              />
              <Button
                icon="database"
                text="Upload Dataset"
                intent={Intent.SUCCESS}
                fill
                onClick={() => navigate("/datasets")}
              />
              <Button
                icon="people"
                text="Manage Users"
                fill
                onClick={() => navigate("/admin/users")}
              />
              <Button
                icon="group-objects"
                text="Manage Groups"
                fill
                onClick={() => navigate("/admin/groups")}
              />
              <Button
                icon="document"
                text="View Audit Log"
                minimal
                fill
                onClick={() => navigate("/admin/audit")}
              />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
