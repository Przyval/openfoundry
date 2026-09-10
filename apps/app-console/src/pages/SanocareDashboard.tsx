import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Elevation,
  HTMLTable,
  Icon,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types (mapped from Kelava ERP)                                     */
/* ------------------------------------------------------------------ */

interface KelavaKPI {
  kpiId: string;
  technicianId: string;
  yearMonth: string;
  totalPlanned: number;
  totalCompleted: number;
  completionRate: number;
  grade: string;
  avgDurationMin: number;
  activeDays: number;
  onTimeRate: number;
}

interface KelavaFlag {
  flagId: string;
  flagType: string;
  severity: string;
  detail: string;
  driftMeters: number;
  resolved: string;
  technicianId: string;
}

interface KelavaRoadPlan {
  roadPlanId: string;
  visitDate: string;
  status: string;
  title: string;
  type: string;
  customerId: string;
  userId: string;
}

interface KelavaTechnician {
  technicianId: string;
  fullname: string;
  segment: string;
  shiftType: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#0F9960";
    case "B": return "#2965CC";
    case "C": return "#D9822B";
    case "D": return "#DB3737";
    default: return "#8A9BA8";
  }
}

function severityIntent(sev: string): "danger" | "warning" | "none" {
  if (sev === "critical") return "danger";
  if (sev === "warning") return "warning";
  return "none";
}

function statusColor(status: string): string {
  switch (status) {
    case "Selesai": return "#0F9960";
    case "Berjalan": return "#2965CC";
    case "Terjadwal": return "#D9822B";
    default: return "#8A9BA8";
  }
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

interface DashboardState {
  kpis: KelavaKPI[];
  flags: KelavaFlag[];
  roadPlans: KelavaRoadPlan[];
  technicians: KelavaTechnician[];
  totalCustomers: number;
  totalVisits: number;
  totalRoadPlans: number;
}

async function fetchAllObjects<T>(ontologyRid: string, objectType: string, pageSize = 500): Promise<T[]> {
  const all: T[] = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = {
      objectSet: { type: "base", objectType },
      pageSize,
    };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(`${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.data ?? []).map((o: { properties: T }) => o.properties));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function fetchCount(ontologyRid: string, objectType: string): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectSet: { type: "base", objectType },
      aggregation: [{ type: "count" }],
    }),
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.data?.[0]?.value ?? data.data?.[0]?.metrics?.count ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function SanocareDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ontRes = await fetch(`${API_BASE_URL}/api/v2/ontologies`);
      if (!ontRes.ok) throw new Error(`API error: ${ontRes.status}`);
      const ontData = await ontRes.json();
      const ont = (ontData.data ?? []).find(
        (o: { apiName: string }) => o.apiName === "sanocare-kelava",
      );
      if (!ont) {
        setState(null);
        setLoading(false);
        return;
      }
      const rid = ont.rid;

      const [kpis, flags, roadPlans, technicians, totalCustomers, totalVisits, totalRoadPlans] =
        await Promise.all([
          fetchAllObjects<KelavaKPI>(rid, "KelavaKPI"),
          fetchAllObjects<KelavaFlag>(rid, "KelavaFlag"),
          fetchAllObjects<KelavaRoadPlan>(rid, "KelavaRoadPlan"),
          fetchAllObjects<KelavaTechnician>(rid, "KelavaTechnician"),
          fetchCount(rid, "KelavaCustomer"),
          fetchCount(rid, "KelavaVisit"),
          fetchCount(rid, "KelavaRoadPlan"),
        ]);

      setState({ kpis, flags, roadPlans, technicians, totalCustomers, totalVisits, totalRoadPlans });
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load Sanocare dashboard:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const timer = setInterval(() => { void loadData(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadData]);

  if (loading && !state) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Sanocare Operations" subtitle="Loading live data from Kelava ERP..." />
        <Spinner size={50} />
      </div>
    );
  }

  if (error && !state) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Sanocare Operations" subtitle="Failed to load data" />
        <Card elevation={1} style={{ padding: 20, maxWidth: 500 }}>
          <Icon icon="error" intent="danger" size={20} style={{ marginRight: 8 }} />
          <strong>Error:</strong> {error}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => void loadData()} style={{ cursor: "pointer" }}>
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Sanocare Operations" subtitle="Sanocare Kelava ontology not found. Run sync-kelava.sh first." />
      </div>
    );
  }

  const { kpis, flags, roadPlans, technicians, totalCustomers, totalVisits, totalRoadPlans } = state;

  // Compute KPIs
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthKpis = kpis.filter((k) => k.yearMonth === currentMonth);
  const avgCompletionRate = thisMonthKpis.length > 0
    ? thisMonthKpis.reduce((s, k) => s + (k.completionRate ?? 0), 0) / thisMonthKpis.length
    : 0;
  const gradeDistribution = thisMonthKpis.reduce<Record<string, number>>((acc, k) => {
    const g = k.grade || "?";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  // Unresolved flags
  const unresolvedFlags = flags.filter((f) => f.resolved === "false" || f.resolved === "f");
  const criticalFlags = unresolvedFlags.filter((f) => f.severity === "critical");

  // Recent road plans (sorted by date desc)
  const recentPlans = [...roadPlans]
    .sort((a, b) => (b.visitDate ?? "").localeCompare(a.visitDate ?? ""))
    .slice(0, 15);

  // Technician name lookup
  const techMap = new Map(technicians.map((t) => [t.technicianId, t]));

  // Top technicians by KPI this month
  const topTechs = [...thisMonthKpis]
    .sort((a, b) => (b.totalCompleted ?? 0) - (a.totalCompleted ?? 0))
    .slice(0, 10);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Sanocare Operations Dashboard"
        subtitle={`Live data from Kelava ERP${lastRefresh ? ` — last refresh ${lastRefresh.toLocaleTimeString("id-ID")}` : ""}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loading && <Spinner size={16} />}
            <Tag large intent="primary" icon="pulse" style={{ fontSize: 13 }}>
              LIVE
            </Tag>
          </div>
        }
      />

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Customers", value: totalCustomers.toLocaleString("id-ID"), icon: "people" as const, color: "#2965CC" },
          { label: "Road Plans", value: totalRoadPlans.toLocaleString("id-ID"), icon: "map-marker" as const, color: "#0F9960" },
          { label: "Visits", value: totalVisits.toLocaleString("id-ID"), icon: "walk" as const, color: "#D9822B" },
          { label: "Avg Completion", value: `${avgCompletionRate.toFixed(1)}%`, icon: "tick-circle" as const, color: "#0F9960" },
          { label: "Critical Flags", value: String(criticalFlags.length), icon: "warning-sign" as const, color: criticalFlags.length > 0 ? "#DB3737" : "#0F9960" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label} elevation={Elevation.TWO} style={{ padding: 16, textAlign: "center" }}>
            <Icon icon={icon} size={20} style={{ color, marginBottom: 6 }} />
            <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "#8A9BA8", marginTop: 2 }}>{label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ── Left Column ──────────────────────────────────── */}
        <div>
          {/* Technician Performance */}
          <Card elevation={Elevation.ONE} style={{ padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: "0 0 12px" }}>
              <Icon icon="person" style={{ marginRight: 6 }} />
              Technician Performance ({currentMonth})
            </h4>
            <HTMLTable condensed striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Segment</th>
                  <th style={{ textAlign: "right" }}>Completed</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {topTechs.map((k) => {
                  const tech = techMap.get(k.technicianId);
                  return (
                    <tr key={k.kpiId}>
                      <td style={{ fontWeight: 500 }}>{tech?.fullname ?? k.technicianId}</td>
                      <td>
                        <Tag minimal round>
                          {tech?.segment || "—"}
                        </Tag>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {k.totalCompleted}/{k.totalPlanned}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {(k.completionRate ?? 0).toFixed(1)}%
                      </td>
                      <td>
                        <Tag
                          round
                          minimal
                          style={{
                            background: gradeColor(k.grade),
                            color: "#fff",
                            fontWeight: 700,
                          }}
                        >
                          {k.grade || "—"}
                        </Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </HTMLTable>
            {/* Grade distribution */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
              {Object.entries(gradeDistribution)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([grade, count]) => (
                  <Tag
                    key={grade}
                    large
                    round
                    style={{ background: gradeColor(grade), color: "#fff" }}
                  >
                    {grade}: {count}
                  </Tag>
                ))}
            </div>
          </Card>

          {/* Verification Flags */}
          <Card elevation={Elevation.ONE} style={{ padding: 16 }}>
            <h4 style={{ margin: "0 0 12px" }}>
              <Icon icon="warning-sign" style={{ marginRight: 6, color: "#DB3737" }} />
              Unresolved Flags ({unresolvedFlags.length})
            </h4>
            <HTMLTable condensed striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Detail</th>
                  <th style={{ textAlign: "right" }}>Drift (m)</th>
                </tr>
              </thead>
              <tbody>
                {unresolvedFlags.slice(0, 15).map((f) => (
                  <tr key={f.flagId}>
                    <td>
                      <Tag minimal>{f.flagType}</Tag>
                    </td>
                    <td>
                      <Tag intent={severityIntent(f.severity)} minimal round>
                        {f.severity}
                      </Tag>
                    </td>
                    <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.detail}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {f.driftMeters > 0 ? Math.round(f.driftMeters).toLocaleString("id-ID") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </Card>
        </div>

        {/* ── Right Column ─────────────────────────────────── */}
        <div>
          {/* Recent Road Plans */}
          <Card elevation={Elevation.ONE} style={{ padding: 16 }}>
            <h4 style={{ margin: "0 0 12px" }}>
              <Icon icon="timeline-events" style={{ marginRight: 6 }} />
              Recent Road Plans
            </h4>
            <HTMLTable condensed striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPlans.map((rp) => (
                  <tr key={rp.roadPlanId}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12, fontFamily: "monospace" }}>
                      {(rp.visitDate ?? "").slice(0, 16).replace("T", " ")}
                    </td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rp.title}
                    </td>
                    <td>
                      <Tag minimal round>{rp.type}</Tag>
                    </td>
                    <td>
                      <Tag
                        minimal
                        round
                        style={{ background: statusColor(rp.status), color: "#fff" }}
                      >
                        {rp.status}
                      </Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </Card>
        </div>
      </div>
    </div>
  );
}
