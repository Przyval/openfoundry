import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Elevation,
  HTMLTable,
  Icon,
  Intent,
  ProgressBar,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Customer {
  customerId: string;
  name: string;
  status: string;
  monthlyRate: number;
  address?: string;
}

interface Technician {
  technicianId: string;
  name: string;
  status: string;
  rating: number;
  activeJobCount: number;
  phone?: string;
  specialization?: string;
}

interface ServiceJob {
  jobId: string;
  customerId: string;
  customerName?: string;
  technicianId: string;
  technicianName?: string;
  scheduledDate: string;
  scheduledTime?: string;
  pestType: string;
  priority: string;
  status: string;
  amountCharged: number;
  customerRating: number;
  followUpRequired: string;
  notes?: string;
  serviceType?: string;
  address?: string;
  treatmentUsed?: string;
}

interface TreatmentProduct {
  productId: string;
  name: string;
  stockQty: number;
  minStockLevel: number;
  unit?: string;
  category?: string;
  safetyClass?: string;
  supplier?: string;
}

interface DashboardData {
  customers: Customer[];
  technicians: Technician[];
  jobs: ServiceJob[];
  products: TreatmentProduct[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiah(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function renderStars(rating: number, size = 14): React.ReactNode {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(
        <Icon key={i} icon="star" size={size} style={{ color: "#FFC940" }} />,
      );
    } else if (i === full && half) {
      stars.push(
        <Icon
          key={i}
          icon="star"
          size={size}
          style={{ color: "#FFC940", opacity: 0.55 }}
        />,
      );
    } else {
      stars.push(
        <Icon
          key={i}
          icon="star-empty"
          size={size}
          style={{ color: "#CED9E0" }}
        />,
      );
    }
  }
  return <span style={{ whiteSpace: "nowrap" }}>{stars}</span>;
}

function priorityIntent(priority: string): Intent {
  switch (priority.toLowerCase()) {
    case "high":
    case "urgent":
      return Intent.DANGER;
    case "medium":
      return Intent.WARNING;
    case "low":
      return Intent.SUCCESS;
    default:
      return Intent.NONE;
  }
}

function statusBadgeColor(status: string): string {
  switch (status.toLowerCase()) {
    case "available":
      return "#0F9960";
    case "on-job":
    case "on_job":
    case "busy":
      return "#D9822B";
    case "off-duty":
    case "off_duty":
    case "offline":
      return "#8A9BA8";
    default:
      return "#5C7080";
  }
}

function jobStatusTag(status: string): React.ReactNode {
  let intent: Intent = Intent.NONE;
  switch (status.toLowerCase()) {
    case "completed":
      intent = Intent.SUCCESS;
      break;
    case "in-progress":
    case "in_progress":
      intent = Intent.PRIMARY;
      break;
    case "scheduled":
      intent = Intent.WARNING;
      break;
    case "cancelled":
      intent = Intent.DANGER;
      break;
  }
  return (
    <Tag minimal intent={intent} round>
      {status}
    </Tag>
  );
}

const PEST_COLORS: Record<string, string> = {
  Termites: "#D13913",
  Cockroaches: "#96620E",
  Rodents: "#634DBF",
  Ants: "#1F4B99",
  Mosquitoes: "#0A6640",
  Bedbugs: "#A82A2A",
  Flies: "#5C7080",
  Spiders: "#29A634",
  Wasps: "#BF7326",
  General: "#2B95D6",
};

function pestColor(pestType: string): string {
  return PEST_COLORS[pestType] ?? "#5C7080";
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = {
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 16,
    marginBottom: 24,
  } as React.CSSProperties,
  kpiCard: {
    textAlign: "center" as const,
    padding: "24px 16px",
    borderRadius: 8,
    position: "relative" as const,
    overflow: "hidden",
  } as React.CSSProperties,
  kpiValue: {
    fontSize: "2rem",
    fontWeight: 700,
    lineHeight: 1.2,
    marginBottom: 4,
  } as React.CSSProperties,
  kpiLabel: {
    fontSize: "0.85rem",
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  kpiAccent: (color: string) =>
    ({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      background: color,
    }) as React.CSSProperties,
  twoCol: {
    display: "grid",
    gridTemplateColumns: "3fr 2fr",
    gap: 20,
    marginTop: 0,
  } as React.CSSProperties,
  sectionCard: {
    marginBottom: 20,
    borderRadius: 8,
  } as React.CSSProperties,
  cardTitle: {
    margin: "0 0 16px 0",
    fontSize: "1.05rem",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  techRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #E1E8ED",
  } as React.CSSProperties,
  barContainer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  } as React.CSSProperties,
  barLabel: {
    minWidth: 100,
    fontSize: "0.85rem",
    fontWeight: 500,
    textAlign: "right" as const,
  } as React.CSSProperties,
  bar: (widthPct: number, color: string) =>
    ({
      height: 24,
      borderRadius: 4,
      background: color,
      width: `${widthPct}%`,
      minWidth: 2,
      transition: "width 0.6s ease",
    }) as React.CSSProperties,
  barValue: {
    fontSize: "0.8rem",
    fontWeight: 600,
    minWidth: 80,
  } as React.CSSProperties,
  stockRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #E1E8ED",
  } as React.CSSProperties,
  emptyState: {
    color: "#8A9BA8",
    textAlign: "center" as const,
    padding: "24px 0",
    fontSize: "0.9rem",
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Data fetching (demo data — falls back to mock when API unavailable)*/
/* ------------------------------------------------------------------ */

async function fetchOntologyData(): Promise<DashboardData> {
  // Try to discover the pest-control ontology
  try {
    const ontRes = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: { "Content-Type": "application/json" },
    });
    if (ontRes.ok) {
      const ontologies = await ontRes.json();
      const pestOntology = ontologies?.data?.find(
        (o: any) =>
          o.displayName?.toLowerCase().includes("pest") ||
          o.apiName?.toLowerCase().includes("pest"),
      );
      if (pestOntology) {
        const rid = pestOntology.rid;
        const [customers, technicians, jobs, products] = await Promise.all([
          loadObjects(rid, "Customer"),
          loadObjects(rid, "Technician"),
          loadObjects(rid, "ServiceJob"),
          loadObjects(rid, "TreatmentProduct"),
        ]);
        return {
          customers: customers as Customer[],
          technicians: technicians as Technician[],
          jobs: jobs as ServiceJob[],
          products: products as TreatmentProduct[],
        };
      }
    }
  } catch {
    // Fall through to mock data
  }
  return getMockData();
}

async function loadObjects(ontologyRid: string, objectType: string): Promise<any[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectSet: { type: "base", objectType },
        select: [],
      }),
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.data ?? []).map((o: any) => o.properties ?? o);
}

function getMockData(): DashboardData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customers: [
      { customerId: "C001", name: "PT Maju Sejahtera", status: "active", monthlyRate: 2500000, address: "Jl. Sudirman No. 45" },
      { customerId: "C002", name: "CV Berkah Jaya", status: "active", monthlyRate: 1800000, address: "Jl. Thamrin No. 12" },
      { customerId: "C003", name: "Toko Makmur", status: "active", monthlyRate: 950000, address: "Jl. Gatot Subroto No. 8" },
      { customerId: "C004", name: "Restaurant Padang Sederhana", status: "active", monthlyRate: 1200000, address: "Jl. Rasuna Said No. 23" },
      { customerId: "C005", name: "Hotel Grand Palace", status: "active", monthlyRate: 4500000, address: "Jl. Kuningan No. 7" },
      { customerId: "C006", name: "Gudang Sentral Logistik", status: "inactive", monthlyRate: 0, address: "Jl. Cilandak KKO" },
      { customerId: "C007", name: "RS Medika Utama", status: "active", monthlyRate: 3200000, address: "Jl. HR Rasuna Said" },
      { customerId: "C008", name: "Sekolah Nusantara", status: "active", monthlyRate: 1500000, address: "Jl. Pramuka No. 33" },
      { customerId: "C009", name: "Mall Citra Plaza", status: "active", monthlyRate: 6000000, address: "Jl. Casablanca No. 1" },
      { customerId: "C010", name: "Kantor Hukum Pratama", status: "inactive", monthlyRate: 0, address: "Jl. Menteng Raya" },
    ],
    technicians: [
      { technicianId: "T001", name: "Budi Santoso", status: "on-job", rating: 4.8, activeJobCount: 2, specialization: "Termites" },
      { technicianId: "T002", name: "Agus Prayitno", status: "available", rating: 4.5, activeJobCount: 0, specialization: "General" },
      { technicianId: "T003", name: "Deni Kurniawan", status: "on-job", rating: 4.9, activeJobCount: 1, specialization: "Rodents" },
      { technicianId: "T004", name: "Eko Wahyudi", status: "available", rating: 4.2, activeJobCount: 0, specialization: "Mosquitoes" },
      { technicianId: "T005", name: "Fajar Nugroho", status: "off-duty", rating: 4.6, activeJobCount: 0, specialization: "Cockroaches" },
      { technicianId: "T006", name: "Gilang Ramadhan", status: "on-job", rating: 4.7, activeJobCount: 1, specialization: "Termites" },
    ],
    jobs: [
      { jobId: "J001", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "in-progress", amountCharged: 3500000, customerRating: 5, followUpRequired: "no", notes: "Building fumigation" },
      { jobId: "J002", customerId: "C004", customerName: "Restaurant Padang Sederhana", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: today, scheduledTime: "09:30", pestType: "Cockroaches", priority: "urgent", status: "scheduled", amountCharged: 1200000, customerRating: 0, followUpRequired: "no", notes: "Kitchen area" },
      { jobId: "J003", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "13:00", pestType: "Bedbugs", priority: "high", status: "scheduled", amountCharged: 4800000, customerRating: 0, followUpRequired: "no", notes: "Rooms 301-310" },
      { jobId: "J004", customerId: "C009", customerName: "Mall Citra Plaza", technicianId: "T006", technicianName: "Gilang Ramadhan", scheduledDate: today, scheduledTime: "10:00", pestType: "Rodents", priority: "medium", status: "in-progress", amountCharged: 2800000, customerRating: 0, followUpRequired: "no", notes: "Basement area" },
      { jobId: "J005", customerId: "C002", customerName: "CV Berkah Jaya", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: today, scheduledTime: "14:30", pestType: "Ants", priority: "low", status: "scheduled", amountCharged: 850000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J006", customerId: "C003", customerName: "Toko Makmur", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: today, scheduledTime: "15:00", pestType: "Mosquitoes", priority: "medium", status: "scheduled", amountCharged: 1100000, customerRating: 0, followUpRequired: "no" },
      // Completed jobs from earlier this month
      { jobId: "J007", customerId: "C007", customerName: "RS Medika Utama", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-02", scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "completed", amountCharged: 5200000, customerRating: 5, followUpRequired: "yes", notes: "Structural treatment needed" },
      { jobId: "J008", customerId: "C008", customerName: "Sekolah Nusantara", technicianId: "T005", technicianName: "Fajar Nugroho", scheduledDate: "2026-03-03", scheduledTime: "07:30", pestType: "Cockroaches", priority: "medium", status: "completed", amountCharged: 1600000, customerRating: 4, followUpRequired: "yes", notes: "Canteen area needs re-check" },
      { jobId: "J009", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: "2026-03-05", scheduledTime: "09:00", pestType: "Rodents", priority: "high", status: "completed", amountCharged: 3800000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J010", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T006", technicianName: "Gilang Ramadhan", scheduledDate: "2026-03-06", scheduledTime: "10:00", pestType: "Bedbugs", priority: "urgent", status: "completed", amountCharged: 6200000, customerRating: 5, followUpRequired: "yes", notes: "Follow-up in 2 weeks for re-inspection" },
      { jobId: "J011", customerId: "C009", customerName: "Mall Citra Plaza", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: "2026-03-08", scheduledTime: "08:30", pestType: "Flies", priority: "low", status: "completed", amountCharged: 950000, customerRating: 4, followUpRequired: "no" },
      { jobId: "J012", customerId: "C004", customerName: "Restaurant Padang Sederhana", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: "2026-03-09", scheduledTime: "11:00", pestType: "Cockroaches", priority: "high", status: "completed", amountCharged: 1450000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J013", customerId: "C002", customerName: "CV Berkah Jaya", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-10", scheduledTime: "09:00", pestType: "Termites", priority: "medium", status: "completed", amountCharged: 2900000, customerRating: 4, followUpRequired: "no" },
      { jobId: "J014", customerId: "C007", customerName: "RS Medika Utama", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: "2026-03-11", scheduledTime: "08:00", pestType: "Ants", priority: "low", status: "completed", amountCharged: 1100000, customerRating: 5, followUpRequired: "no" },
    ],
    products: [
      { productId: "P001", name: "Termidor SC", stockQty: 12, minStockLevel: 10, unit: "liters", category: "Termiticide" },
      { productId: "P002", name: "Demand CS", stockQty: 5, minStockLevel: 8, unit: "liters", category: "Insecticide" },
      { productId: "P003", name: "Contrac Blox", stockQty: 18, minStockLevel: 15, unit: "kg", category: "Rodenticide" },
      { productId: "P004", name: "Advion Gel", stockQty: 3, minStockLevel: 10, unit: "tubes", category: "Gel Bait" },
      { productId: "P005", name: "Temprid FX", stockQty: 8, minStockLevel: 6, unit: "liters", category: "Insecticide" },
      { productId: "P006", name: "Suspend Polyzone", stockQty: 2, minStockLevel: 5, unit: "liters", category: "Insecticide" },
      { productId: "P007", name: "Dragnet SFR", stockQty: 15, minStockLevel: 8, unit: "liters", category: "Insecticide" },
      { productId: "P008", name: "Gentrol IGR", stockQty: 6, minStockLevel: 10, unit: "units", category: "Growth Regulator" },
      { productId: "P009", name: "Phantom SC", stockQty: 4, minStockLevel: 6, unit: "liters", category: "Non-repellent" },
      { productId: "P010", name: "Sentricon Bait", stockQty: 22, minStockLevel: 12, unit: "stations", category: "Termite Bait" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PestControlDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchOntologyData();
      setData(result);
      setLastRefresh(new Date());
    } catch {
      // keep stale data on screen
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    intervalRef.current = setInterval(() => {
      void loadData();
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  /* ----- Derived metrics ----- */
  const completedJobs = data?.jobs.filter((j) => j.status === "completed") ?? [];
  const totalRevenue = completedJobs.reduce((s, j) => s + j.amountCharged, 0);
  const activeCustomers = data?.customers.filter((c) => c.status === "active").length ?? 0;
  const jobsThisMonth = data?.jobs.length ?? 0;
  const avgRating =
    completedJobs.length > 0
      ? completedJobs.reduce((s, j) => s + j.customerRating, 0) / completedJobs.length
      : 0;
  const mrr = data?.customers
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.monthlyRate, 0) ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  const todayJobs = data?.jobs
    .filter((j) => j.scheduledDate === today)
    .sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "")) ?? [];

  const followUpJobs = data?.jobs.filter(
    (j) => j.followUpRequired === "yes",
  ) ?? [];

  const lowStockProducts = data?.products
    .filter((p) => p.stockQty < p.minStockLevel * 2)
    .sort((a, b) => a.stockQty / a.minStockLevel - b.stockQty / b.minStockLevel) ?? [];

  /* Revenue by pest type */
  const revenueByPest: Record<string, number> = {};
  for (const j of completedJobs) {
    revenueByPest[j.pestType] = (revenueByPest[j.pestType] ?? 0) + j.amountCharged;
  }
  const pestEntries = Object.entries(revenueByPest).sort((a, b) => b[1] - a[1]);
  const maxPestRevenue = pestEntries.length > 0 ? pestEntries[0][1] : 1;

  /* ----- KPI definitions ----- */
  const kpis: Array<{
    label: string;
    value: React.ReactNode;
    icon: IconName;
    color: string;
    subtext?: string;
  }> = [
    {
      label: "Total Revenue",
      value: formatRupiah(totalRevenue),
      icon: "bank-account",
      color: "#0F9960",
      subtext: `${completedJobs.length} completed jobs`,
    },
    {
      label: "Active Customers",
      value: activeCustomers,
      icon: "people",
      color: "#2B95D6",
      subtext: `of ${data?.customers.length ?? 0} total`,
    },
    {
      label: "Jobs This Month",
      value: jobsThisMonth,
      icon: "clipboard",
      color: "#D9822B",
      subtext: `${todayJobs.length} today`,
    },
    {
      label: "Avg Rating",
      value: (
        <span>
          {avgRating.toFixed(1)} {renderStars(avgRating, 18)}
        </span>
      ),
      icon: "star",
      color: "#FFC940",
    },
    {
      label: "Monthly Recurring",
      value: formatRupiah(mrr),
      icon: "repeat",
      color: "#634DBF",
      subtext: "MRR",
    },
  ];

  return (
    <>
      <PageHeader
        title="Pest Control Dashboard"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "0.8rem", color: "#8A9BA8" }}>
              Last updated: {lastRefresh.toLocaleTimeString()} (auto-refreshes every 30s)
            </span>
            <Button
              minimal
              icon="refresh"
              text="Refresh"
              onClick={handleRefresh}
              loading={loading && !!data}
            />
          </div>
        }
      />

      {/* ---------- Loading State ---------- */}
      {loading && !data && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Spinner size={50} />
        </div>
      )}

      {data && (
        <>
          {/* ========== KPI CARDS ========== */}
          <div style={styles.kpiRow}>
            {kpis.map((kpi) => (
              <Card
                key={kpi.label}
                elevation={Elevation.TWO}
                style={styles.kpiCard}
              >
                <div style={styles.kpiAccent(kpi.color)} />
                <Icon
                  icon={kpi.icon}
                  size={28}
                  style={{ color: kpi.color, marginBottom: 12 }}
                />
                <div style={{ ...styles.kpiValue, color: kpi.color }}>
                  {kpi.value}
                </div>
                <div style={styles.kpiLabel}>{kpi.label}</div>
                {kpi.subtext && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#8A9BA8",
                      marginTop: 4,
                    }}
                  >
                    {kpi.subtext}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* ========== TWO-COLUMN LAYOUT ========== */}
          <div style={styles.twoCol}>
            {/* ---------- LEFT COLUMN (60%) ---------- */}
            <div>
              {/* Today's Schedule */}
              <Card
                elevation={Elevation.ONE}
                style={styles.sectionCard}
              >
                <h4 style={styles.cardTitle}>
                  <Icon icon="calendar" style={{ color: "#2B95D6" }} />
                  Today's Schedule
                  <Tag minimal round intent={Intent.PRIMARY} style={{ marginLeft: "auto" }}>
                    {todayJobs.length} jobs
                  </Tag>
                </h4>
                {todayJobs.length === 0 ? (
                  <div style={styles.emptyState}>No jobs scheduled for today.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <HTMLTable bordered compact striped style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Technician</th>
                          <th>Customer</th>
                          <th>Pest Type</th>
                          <th>Priority</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todayJobs.map((job) => (
                          <tr key={job.jobId}>
                            <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                              <Icon
                                icon="time"
                                size={12}
                                style={{ marginRight: 4, color: "#8A9BA8" }}
                              />
                              {job.scheduledTime ?? job.scheduledDate ?? "—"}
                            </td>
                            <td>
                              <Icon
                                icon="person"
                                size={12}
                                style={{ marginRight: 4, color: "#5C7080" }}
                              />
                              {job.technicianName ?? job.technicianId}
                            </td>
                            <td>{job.customerName ?? job.customerId}</td>
                            <td>
                              <Tag
                                minimal
                                round
                                style={{
                                  background: pestColor(job.pestType) + "22",
                                  color: pestColor(job.pestType),
                                }}
                              >
                                <Icon icon="bug" size={10} style={{ marginRight: 4 }} />
                                {job.pestType}
                              </Tag>
                            </td>
                            <td>
                              <Tag
                                intent={priorityIntent(job.priority)}
                                round
                                style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.7rem" }}
                              >
                                {job.priority}
                              </Tag>
                            </td>
                            <td>{jobStatusTag(job.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </HTMLTable>
                  </div>
                )}
              </Card>

              {/* Follow-up Required */}
              <Card
                elevation={Elevation.ONE}
                style={{
                  ...styles.sectionCard,
                  borderLeft: "4px solid #D9822B",
                }}
              >
                <h4 style={styles.cardTitle}>
                  <Icon icon="warning-sign" style={{ color: "#D9822B" }} />
                  Jobs Requiring Follow-up
                  <Tag minimal round intent={Intent.WARNING} style={{ marginLeft: "auto" }}>
                    {followUpJobs.length}
                  </Tag>
                </h4>
                {followUpJobs.length === 0 ? (
                  <div style={styles.emptyState}>All clear! No follow-ups pending.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {followUpJobs.map((job) => (
                      <div
                        key={job.jobId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "#FFF8E1",
                          borderRadius: 6,
                          border: "1px solid #FFE0B2",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>
                            {job.customerName ?? job.customerId}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#5C7080" }}>
                            <Icon icon="bug" size={10} style={{ marginRight: 4 }} />
                            {job.pestType} &middot; {job.scheduledDate} &middot; {job.technicianName ?? job.technicianId}
                          </div>
                          {job.notes && (
                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "#96620E",
                                marginTop: 4,
                                fontStyle: "italic",
                              }}
                            >
                              "{job.notes}"
                            </div>
                          )}
                        </div>
                        <Tag intent={Intent.WARNING} icon="arrow-right" round>
                          Follow-up
                        </Tag>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ---------- RIGHT COLUMN (40%) ---------- */}
            <div>
              {/* Technician Status */}
              <Card elevation={Elevation.ONE} style={styles.sectionCard}>
                <h4 style={styles.cardTitle}>
                  <Icon icon="people" style={{ color: "#634DBF" }} />
                  Technician Status
                </h4>
                {(data.technicians ?? []).map((tech) => (
                  <div key={tech.technicianId} style={styles.techRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: statusBadgeColor(tech.status) + "22",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon
                            icon="person"
                            size={16}
                            style={{ color: statusBadgeColor(tech.status) }}
                          />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                            {tech.name}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#8A9BA8" }}>
                            {renderStars(tech.rating, 11)}{" "}
                            <span style={{ marginLeft: 4 }}>
                              {tech.rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {tech.activeJobCount > 0 && (
                        <Tag minimal round intent={Intent.PRIMARY}>
                          {tech.activeJobCount} job{tech.activeJobCount > 1 ? "s" : ""}
                        </Tag>
                      )}
                      <Tag
                        round
                        style={{
                          background: statusBadgeColor(tech.status),
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "0.72rem",
                          textTransform: "uppercase",
                        }}
                      >
                        {tech.status.replace(/[-_]/g, " ")}
                      </Tag>
                    </div>
                  </div>
                ))}
              </Card>

              {/* Low Stock Alert */}
              <Card
                elevation={Elevation.ONE}
                style={{
                  ...styles.sectionCard,
                  borderLeft: "4px solid #D13913",
                }}
              >
                <h4 style={styles.cardTitle}>
                  <Icon icon="warning-sign" style={{ color: "#D13913" }} />
                  Low Stock Alert
                  <Tag minimal round intent={Intent.DANGER} style={{ marginLeft: "auto" }}>
                    {lowStockProducts.length} items
                  </Tag>
                </h4>
                {lowStockProducts.length === 0 ? (
                  <div style={styles.emptyState}>Stock levels are healthy.</div>
                ) : (
                  lowStockProducts.map((product) => {
                    const ratio = product.stockQty / (product.minStockLevel * 2);
                    const isCritical = product.stockQty < product.minStockLevel;
                    return (
                      <div key={product.productId} style={styles.stockRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                              {product.name}
                            </span>
                            <span
                              style={{
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                color: isCritical ? "#D13913" : "#D9822B",
                              }}
                            >
                              {product.stockQty} / {product.minStockLevel * 2} {product.unit}
                            </span>
                          </div>
                          <ProgressBar
                            value={ratio}
                            intent={isCritical ? Intent.DANGER : Intent.WARNING}
                            stripes={isCritical}
                            animate={isCritical}
                          />
                          {isCritical && (
                            <div
                              style={{
                                fontSize: "0.72rem",
                                color: "#D13913",
                                fontWeight: 600,
                                marginTop: 2,
                              }}
                            >
                              CRITICAL — Below minimum level ({product.minStockLevel} {product.unit})
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </Card>

              {/* Revenue by Pest Type */}
              <Card elevation={Elevation.ONE} style={styles.sectionCard}>
                <h4 style={styles.cardTitle}>
                  <Icon icon="horizontal-bar-chart" style={{ color: "#2B95D6" }} />
                  Revenue by Pest Type
                </h4>
                {pestEntries.length === 0 ? (
                  <div style={styles.emptyState}>No revenue data yet.</div>
                ) : (
                  pestEntries.map(([pest, revenue]) => (
                    <div key={pest} style={styles.barContainer}>
                      <div style={styles.barLabel}>{pest}</div>
                      <div
                        style={{
                          flex: 1,
                          background: "#EBF1F5",
                          borderRadius: 4,
                          overflow: "hidden",
                          height: 24,
                        }}
                      >
                        <div
                          style={styles.bar(
                            (revenue / maxPestRevenue) * 100,
                            pestColor(pest),
                          )}
                        />
                      </div>
                      <div style={styles.barValue}>{formatRupiah(revenue)}</div>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
