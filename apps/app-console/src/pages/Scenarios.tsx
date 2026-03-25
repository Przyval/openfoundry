import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Callout,
  Card,
  Dialog,
  Elevation,
  HTMLSelect,
  HTMLTable,
  Icon,
  InputGroup,
  Intent,
  Spinner,
  Tag,
} from "@blueprintjs/core";
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
}

interface TreatmentProduct {
  productId: string;
  name: string;
  stockQty: number;
  minStockLevel: number;
  unit?: string;
  category?: string;
}

interface ProductionData {
  customers: Customer[];
  technicians: Technician[];
  jobs: ServiceJob[];
  products: TreatmentProduct[];
}

type ChangeKind = "added" | "modified" | "deleted";

interface ChangeEntry {
  objectType: string;
  objectId: string;
  objectName: string;
  kind: ChangeKind;
  field?: string;
  oldValue?: string;
  newValue?: string;
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  data: ProductionData;
  changes: ChangeEntry[];
}

interface KPIs {
  totalRevenue: number;
  activeCustomers: number;
  totalJobs: number;
  scheduledJobs: number;
  completedJobs: number;
  technicianCount: number;
  totalStock: number;
  avgJobValue: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRupiah(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

function computeKPIs(data: ProductionData): KPIs {
  const activeCustomers = data.customers.filter(
    (c) => c.status.toLowerCase() === "active",
  ).length;
  const totalRevenue = data.jobs.reduce((s, j) => s + j.amountCharged, 0);
  const scheduledJobs = data.jobs.filter(
    (j) => j.status.toLowerCase() === "scheduled",
  ).length;
  const completedJobs = data.jobs.filter(
    (j) => j.status.toLowerCase() === "completed",
  ).length;
  const totalStock = data.products.reduce((s, p) => s + p.stockQty, 0);
  const avgJobValue =
    data.jobs.length > 0 ? totalRevenue / data.jobs.length : 0;
  return {
    totalRevenue,
    activeCustomers,
    totalJobs: data.jobs.length,
    scheduledJobs,
    completedJobs,
    technicianCount: data.technicians.length,
    totalStock,
    avgJobValue,
  };
}

function kpiDelta(
  prod: number,
  scenario: number,
): { delta: number; pct: number; direction: "up" | "down" | "same" } {
  const delta = scenario - prod;
  const pct = prod !== 0 ? (delta / prod) * 100 : scenario !== 0 ? 100 : 0;
  return {
    delta,
    pct,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "same",
  };
}

/* ------------------------------------------------------------------ */
/*  API / Data loading                                                 */
/* ------------------------------------------------------------------ */

async function loadObjects(
  ontologyRid: string,
  objectType: string,
): Promise<any[]> {
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

async function fetchProductionData(): Promise<ProductionData> {
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

function getMockData(): ProductionData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customers: [
      { customerId: "C001", name: "PT Maju Sejahtera", status: "active", monthlyRate: 2500000, address: "Jl. Sudirman No. 45, Jakarta" },
      { customerId: "C002", name: "CV Berkah Jaya", status: "active", monthlyRate: 1800000, address: "Jl. Thamrin No. 12, Jakarta" },
      { customerId: "C003", name: "Toko Makmur", status: "active", monthlyRate: 950000, address: "Jl. Gatot Subroto No. 8, Jakarta" },
      { customerId: "C004", name: "Restaurant Padang Sederhana", status: "active", monthlyRate: 1200000, address: "Jl. Rasuna Said No. 23, Jakarta" },
      { customerId: "C005", name: "Hotel Grand Palace", status: "active", monthlyRate: 4500000, address: "Jl. Kuningan No. 7, Jakarta" },
      { customerId: "C006", name: "Gudang Sentral Logistik", status: "inactive", monthlyRate: 0, address: "Jl. Cilandak KKO, Jakarta" },
      { customerId: "C007", name: "RS Medika Utama", status: "active", monthlyRate: 3200000, address: "Jl. HR Rasuna Said, Jakarta" },
      { customerId: "C008", name: "Sekolah Nusantara", status: "active", monthlyRate: 1500000, address: "Jl. Pramuka No. 33, Jakarta" },
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
      { jobId: "J001", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "in-progress", amountCharged: 3500000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J002", customerId: "C004", customerName: "Restaurant Padang Sederhana", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: today, scheduledTime: "09:30", pestType: "Cockroaches", priority: "urgent", status: "scheduled", amountCharged: 1200000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J003", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "13:00", pestType: "Bedbugs", priority: "high", status: "scheduled", amountCharged: 4800000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J004", customerId: "C007", customerName: "RS Medika Utama", technicianId: "T006", technicianName: "Gilang Ramadhan", scheduledDate: today, scheduledTime: "10:00", pestType: "Rodents", priority: "medium", status: "in-progress", amountCharged: 2800000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J005", customerId: "C002", customerName: "CV Berkah Jaya", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: "2026-03-18", scheduledTime: "14:30", pestType: "Ants", priority: "low", status: "completed", amountCharged: 850000, customerRating: 4, followUpRequired: "no" },
      { jobId: "J006", customerId: "C003", customerName: "Toko Makmur", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: "2026-03-15", scheduledTime: "15:00", pestType: "Mosquitoes", priority: "medium", status: "completed", amountCharged: 1100000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J007", customerId: "C008", customerName: "Sekolah Nusantara", technicianId: "T005", technicianName: "Fajar Nugroho", scheduledDate: "2026-03-12", scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "completed", amountCharged: 5200000, customerRating: 5, followUpRequired: "yes" },
      { jobId: "J008", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-10", scheduledTime: "09:00", pestType: "Rodents", priority: "high", status: "completed", amountCharged: 3800000, customerRating: 5, followUpRequired: "no" },
    ],
    products: [
      { productId: "P001", name: "Termidor SC", stockQty: 12, minStockLevel: 10, unit: "liters", category: "Termiticide" },
      { productId: "P002", name: "Demand CS", stockQty: 5, minStockLevel: 8, unit: "liters", category: "Insecticide" },
      { productId: "P003", name: "Contrac Blox", stockQty: 18, minStockLevel: 15, unit: "kg", category: "Rodenticide" },
      { productId: "P004", name: "Advion Gel", stockQty: 3, minStockLevel: 10, unit: "tubes", category: "Gel Bait" },
      { productId: "P005", name: "Temprid FX", stockQty: 8, minStockLevel: 6, unit: "liters", category: "Insecticide" },
      { productId: "P006", name: "Suspend Polyzone", stockQty: 2, minStockLevel: 5, unit: "liters", category: "Insecticide" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Scenario Templates                                                 */
/* ------------------------------------------------------------------ */

function applyExpandSurabaya(base: ProductionData): { data: ProductionData; changes: ChangeEntry[] } {
  const data = deepClone(base);
  const changes: ChangeEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 3 new customers in Surabaya
  const newCustomers: Customer[] = [
    { customerId: "C-SBY-01", name: "PT Pelabuhan Surabaya Makmur", status: "active", monthlyRate: 3200000, address: "Jl. Perak Timur No. 12, Surabaya" },
    { customerId: "C-SBY-02", name: "Mall Galaxy Surabaya", status: "active", monthlyRate: 5500000, address: "Jl. Dharmahusada No. 45, Surabaya" },
    { customerId: "C-SBY-03", name: "Hotel Majapahit Heritage", status: "active", monthlyRate: 4200000, address: "Jl. Tunjungan No. 65, Surabaya" },
  ];
  newCustomers.forEach((c) => {
    data.customers.push(c);
    changes.push({ objectType: "Customer", objectId: c.customerId, objectName: c.name, kind: "added" });
  });

  // 2 new technicians in Surabaya
  const newTechs: Technician[] = [
    { technicianId: "T-SBY-01", name: "Haris Surabaya", status: "available", rating: 4.3, activeJobCount: 0, specialization: "General" },
    { technicianId: "T-SBY-02", name: "Irfan Surabaya", status: "available", rating: 4.5, activeJobCount: 0, specialization: "Termites" },
  ];
  newTechs.forEach((t) => {
    data.technicians.push(t);
    changes.push({ objectType: "Technician", objectId: t.technicianId, objectName: t.name, kind: "added" });
  });

  // 5 new scheduled jobs in Surabaya
  const newJobs: ServiceJob[] = [
    { jobId: "J-SBY-01", customerId: "C-SBY-01", customerName: "PT Pelabuhan Surabaya Makmur", technicianId: "T-SBY-01", technicianName: "Haris Surabaya", scheduledDate: today, scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "scheduled", amountCharged: 3500000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-SBY-02", customerId: "C-SBY-02", customerName: "Mall Galaxy Surabaya", technicianId: "T-SBY-02", technicianName: "Irfan Surabaya", scheduledDate: today, scheduledTime: "09:30", pestType: "Cockroaches", priority: "medium", status: "scheduled", amountCharged: 2200000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-SBY-03", customerId: "C-SBY-03", customerName: "Hotel Majapahit Heritage", technicianId: "T-SBY-01", technicianName: "Haris Surabaya", scheduledDate: today, scheduledTime: "13:00", pestType: "Bedbugs", priority: "high", status: "scheduled", amountCharged: 2800000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-SBY-04", customerId: "C-SBY-01", customerName: "PT Pelabuhan Surabaya Makmur", technicianId: "T-SBY-02", technicianName: "Irfan Surabaya", scheduledDate: today, scheduledTime: "14:00", pestType: "Rodents", priority: "medium", status: "scheduled", amountCharged: 1800000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-SBY-05", customerId: "C-SBY-02", customerName: "Mall Galaxy Surabaya", technicianId: "T-SBY-01", technicianName: "Haris Surabaya", scheduledDate: today, scheduledTime: "16:00", pestType: "Ants", priority: "low", status: "scheduled", amountCharged: 2200000, customerRating: 0, followUpRequired: "no" },
  ];
  newJobs.forEach((j) => {
    data.jobs.push(j);
    changes.push({ objectType: "ServiceJob", objectId: j.jobId, objectName: `${j.customerName} - ${j.pestType}`, kind: "added" });
  });

  return { data, changes };
}

function applyPriceIncrease(base: ProductionData): { data: ProductionData; changes: ChangeEntry[] } {
  const data = deepClone(base);
  const changes: ChangeEntry[] = [];
  data.jobs.forEach((j) => {
    const oldAmount = j.amountCharged;
    j.amountCharged = Math.round(oldAmount * 1.15);
    changes.push({
      objectType: "ServiceJob",
      objectId: j.jobId,
      objectName: `${j.customerName ?? j.jobId}`,
      kind: "modified",
      field: "amountCharged",
      oldValue: formatRupiah(oldAmount),
      newValue: formatRupiah(j.amountCharged),
    });
  });
  data.customers.forEach((c) => {
    if (c.monthlyRate > 0) {
      const oldRate = c.monthlyRate;
      c.monthlyRate = Math.round(oldRate * 1.15);
      changes.push({
        objectType: "Customer",
        objectId: c.customerId,
        objectName: c.name,
        kind: "modified",
        field: "monthlyRate",
        oldValue: formatRupiah(oldRate),
        newValue: formatRupiah(c.monthlyRate),
      });
    }
  });
  return { data, changes };
}

function applyPeakSeasonPrep(base: ProductionData): { data: ProductionData; changes: ChangeEntry[] } {
  const data = deepClone(base);
  const changes: ChangeEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // 5 new scheduled jobs for peak season
  const peakJobs: ServiceJob[] = [
    { jobId: "J-PK-01", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: today, scheduledTime: "07:00", pestType: "Termites", priority: "urgent", status: "scheduled", amountCharged: 4200000, customerRating: 0, followUpRequired: "yes" },
    { jobId: "J-PK-02", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: today, scheduledTime: "08:30", pestType: "Mosquitoes", priority: "high", status: "scheduled", amountCharged: 3800000, customerRating: 0, followUpRequired: "yes" },
    { jobId: "J-PK-03", customerId: "C007", customerName: "RS Medika Utama", technicianId: "T005", technicianName: "Fajar Nugroho", scheduledDate: today, scheduledTime: "10:00", pestType: "Cockroaches", priority: "high", status: "scheduled", amountCharged: 2900000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-PK-04", customerId: "C004", customerName: "Restaurant Padang Sederhana", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: today, scheduledTime: "13:00", pestType: "Flies", priority: "medium", status: "scheduled", amountCharged: 1500000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J-PK-05", customerId: "C008", customerName: "Sekolah Nusantara", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: today, scheduledTime: "15:00", pestType: "Ants", priority: "medium", status: "scheduled", amountCharged: 1200000, customerRating: 0, followUpRequired: "no" },
  ];
  peakJobs.forEach((j) => {
    data.jobs.push(j);
    changes.push({ objectType: "ServiceJob", objectId: j.jobId, objectName: `${j.customerName} - ${j.pestType}`, kind: "added" });
  });

  // Reorder products -- increase stock for key items
  data.products.forEach((p) => {
    if (p.stockQty < p.minStockLevel * 2) {
      const oldQty = p.stockQty;
      p.stockQty = p.minStockLevel * 3;
      changes.push({
        objectType: "TreatmentProduct",
        objectId: p.productId,
        objectName: p.name,
        kind: "modified",
        field: "stockQty",
        oldValue: `${oldQty} ${p.unit ?? ""}`,
        newValue: `${p.stockQty} ${p.unit ?? ""}`,
      });
    }
  });

  return { data, changes };
}

/* ------------------------------------------------------------------ */
/*  Template Card data                                                 */
/* ------------------------------------------------------------------ */

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  tags: string[];
}

const TEMPLATES: TemplateInfo[] = [
  {
    id: "expand-surabaya",
    name: "Expand to Surabaya",
    description: "Add 3 new customers, 2 technicians, and 5 scheduled jobs in the Surabaya region. Projects +Rp 12.5M additional revenue.",
    icon: "globe",
    color: "#1F4B99",
    tags: ["Growth", "+3 Customers", "+2 Techs", "+5 Jobs"],
  },
  {
    id: "price-increase",
    name: "Price Increase 15%",
    description: "Increase all job amounts and monthly customer rates by 15%. Analyze total revenue impact across the portfolio.",
    icon: "trending-up",
    color: "#0A6640",
    tags: ["Revenue", "+15% Pricing", "All Jobs"],
  },
  {
    id: "peak-season",
    name: "Peak Season Prep",
    description: "Add 5 new high-priority scheduled jobs and restock treatment products to 3x minimum levels for rainy season surge.",
    icon: "calendar",
    color: "#BF7326",
    tags: ["Operations", "+5 Jobs", "Restock"],
  },
  {
    id: "custom",
    name: "Custom Scenario",
    description: "Start from a blank branch of production data. Manually add, modify, or remove objects to model any business scenario.",
    icon: "edit",
    color: "#5C7080",
    tags: ["Blank", "Manual"],
  },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S = {
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
    marginBottom: 24,
  } as React.CSSProperties,
  templateCard: (color: string, hover: boolean) =>
    ({
      borderRadius: 8,
      cursor: "pointer",
      border: `2px solid ${hover ? color : "transparent"}`,
      transition: "all 0.2s ease",
      position: "relative" as const,
      overflow: "hidden",
    }) as React.CSSProperties,
  templateAccent: (color: string) =>
    ({
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      background: color,
    }) as React.CSSProperties,
  templateIcon: (color: string) =>
    ({
      width: 44,
      height: 44,
      borderRadius: 10,
      background: color + "18",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    }) as React.CSSProperties,
  editorLayout: {
    display: "grid",
    gridTemplateColumns: "260px 1fr 300px",
    gap: 16,
    minHeight: 500,
  } as React.CSSProperties,
  panel: {
    borderRadius: 8,
    padding: 16,
    overflowY: "auto" as const,
    maxHeight: 600,
  } as React.CSSProperties,
  changeItem: (kind: ChangeKind) => {
    const colors = { added: "#0A6640", modified: "#BF7326", deleted: "#A82A2A" };
    return {
      padding: "8px 10px",
      borderRadius: 6,
      marginBottom: 6,
      borderLeft: `3px solid ${colors[kind]}`,
      background: colors[kind] + "0A",
      fontSize: "0.85rem",
    } as React.CSSProperties;
  },
  kpiCard: (direction: "up" | "down" | "same") => {
    const bg = direction === "up" ? "#0A664010" : direction === "down" ? "#A82A2A10" : "#5C708010";
    return {
      padding: "14px 16px",
      borderRadius: 8,
      marginBottom: 10,
      background: bg,
    } as React.CSSProperties;
  },
  deltaText: (direction: "up" | "down" | "same") => {
    const color = direction === "up" ? "#0A6640" : direction === "down" ? "#A82A2A" : "#5C7080";
    return {
      color,
      fontWeight: 700,
      fontSize: "0.9rem",
    } as React.CSSProperties;
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  } as React.CSSProperties,
  compareColumn: {
    borderRadius: 8,
    padding: 20,
  } as React.CSSProperties,
  barOuter: {
    height: 28,
    background: "#E1E8ED",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative" as const,
  } as React.CSSProperties,
  barInner: (pct: number, color: string) =>
    ({
      height: "100%",
      width: `${Math.min(pct, 100)}%`,
      background: color,
      borderRadius: 4,
      transition: "width 0.5s ease",
    }) as React.CSSProperties,
  modifiedCell: {
    background: "#FFF3CD",
    borderRadius: 3,
    padding: "2px 6px",
  } as React.CSSProperties,
  addedBadge: {
    display: "inline-block",
    background: "#0A664018",
    color: "#0A6640",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: "0.75rem",
    fontWeight: 600,
    marginLeft: 6,
  } as React.CSSProperties,
  deletedRow: {
    textDecoration: "line-through",
    opacity: 0.5,
    color: "#A82A2A",
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Scenarios() {
  const [loading, setLoading] = useState(true);
  const [production, setProduction] = useState<ProductionData | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [editObjectType, setEditObjectType] = useState<string>("Customer");
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProductionData();
      setProduction(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;
  const prodKPIs = production ? computeKPIs(production) : null;
  const scenarioKPIs = activeScenario ? computeKPIs(activeScenario.data) : null;

  /* ------ Scenario CRUD ------ */

  function createScenario(name: string, templateId?: string) {
    if (!production) return;
    const id = generateId();
    let data = deepClone(production);
    let changes: ChangeEntry[] = [];

    if (templateId === "expand-surabaya") {
      const result = applyExpandSurabaya(production);
      data = result.data;
      changes = result.changes;
    } else if (templateId === "price-increase") {
      const result = applyPriceIncrease(production);
      data = result.data;
      changes = result.changes;
    } else if (templateId === "peak-season") {
      const result = applyPeakSeasonPrep(production);
      data = result.data;
      changes = result.changes;
    }

    const scenario: Scenario = {
      id,
      name,
      description: templateId
        ? TEMPLATES.find((t) => t.id === templateId)?.description ?? ""
        : "Custom scenario",
      createdAt: new Date().toISOString(),
      data,
      changes,
    };
    setScenarios((prev) => [...prev, scenario]);
    setActiveScenarioId(id);
    setCompareMode(false);
  }

  function deleteScenario(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (activeScenarioId === id) {
      setActiveScenarioId(null);
      setCompareMode(false);
    }
  }

  function updateScenarioData(scenarioId: string, newData: ProductionData, newChanges: ChangeEntry[]) {
    setScenarios((prev) =>
      prev.map((s) => (s.id === scenarioId ? { ...s, data: newData, changes: newChanges } : s)),
    );
  }

  /* ------ Inline Editing ------ */

  function startEdit(row: number, col: string, currentValue: string) {
    setEditingCell({ row, col });
    setEditingValue(currentValue);
  }

  function commitEdit() {
    if (!editingCell || !activeScenario || !production) return;

    const newData = deepClone(activeScenario.data);
    const newChanges = [...activeScenario.changes];
    const { row, col } = editingCell;

    if (editObjectType === "Customer" && newData.customers[row]) {
      const c = newData.customers[row];
      const origCustomer = production.customers.find((pc) => pc.customerId === c.customerId);
      const oldValue = String((c as any)[col]);
      if (col === "monthlyRate") {
        (c as any)[col] = parseInt(editingValue, 10) || 0;
      } else {
        (c as any)[col] = editingValue;
      }
      if (origCustomer && !newChanges.find((ch) => ch.objectId === c.customerId && ch.kind === "added")) {
        const existingChange = newChanges.findIndex(
          (ch) => ch.objectId === c.customerId && ch.field === col,
        );
        if (existingChange >= 0) {
          newChanges[existingChange].newValue = editingValue;
        } else {
          newChanges.push({
            objectType: "Customer",
            objectId: c.customerId,
            objectName: c.name,
            kind: "modified",
            field: col,
            oldValue,
            newValue: editingValue,
          });
        }
      }
    } else if (editObjectType === "ServiceJob" && newData.jobs[row]) {
      const j = newData.jobs[row];
      const origJob = production.jobs.find((pj) => pj.jobId === j.jobId);
      const oldValue = String((j as any)[col]);
      if (col === "amountCharged") {
        (j as any)[col] = parseInt(editingValue, 10) || 0;
      } else {
        (j as any)[col] = editingValue;
      }
      if (origJob && !newChanges.find((ch) => ch.objectId === j.jobId && ch.kind === "added")) {
        const existingChange = newChanges.findIndex(
          (ch) => ch.objectId === j.jobId && ch.field === col,
        );
        if (existingChange >= 0) {
          newChanges[existingChange].newValue = editingValue;
        } else {
          newChanges.push({
            objectType: "ServiceJob",
            objectId: j.jobId,
            objectName: j.customerName ?? j.jobId,
            kind: "modified",
            field: col,
            oldValue,
            newValue: editingValue,
          });
        }
      }
    } else if (editObjectType === "TreatmentProduct" && newData.products[row]) {
      const p = newData.products[row];
      const origProduct = production.products.find((pp) => pp.productId === p.productId);
      const oldValue = String((p as any)[col]);
      if (col === "stockQty" || col === "minStockLevel") {
        (p as any)[col] = parseInt(editingValue, 10) || 0;
      } else {
        (p as any)[col] = editingValue;
      }
      if (origProduct && !newChanges.find((ch) => ch.objectId === p.productId && ch.kind === "added")) {
        const existingChange = newChanges.findIndex(
          (ch) => ch.objectId === p.productId && ch.field === col,
        );
        if (existingChange >= 0) {
          newChanges[existingChange].newValue = editingValue;
        } else {
          newChanges.push({
            objectType: "TreatmentProduct",
            objectId: p.productId,
            objectName: p.name,
            kind: "modified",
            field: col,
            oldValue,
            newValue: editingValue,
          });
        }
      }
    }

    updateScenarioData(activeScenario.id, newData, newChanges);
    setEditingCell(null);
    setEditingValue("");
  }

  /* ------ Check if cell was modified ------ */

  function isModified(objectId: string, field: string): boolean {
    if (!activeScenario) return false;
    return activeScenario.changes.some(
      (ch) => ch.objectId === objectId && ch.field === field && ch.kind === "modified",
    );
  }

  function isAdded(objectId: string): boolean {
    if (!activeScenario) return false;
    return activeScenario.changes.some(
      (ch) => ch.objectId === objectId && ch.kind === "added",
    );
  }

  /* ------ Render helpers ------ */

  function renderDeltaArrow(d: { delta: number; pct: number; direction: "up" | "down" | "same" }, isCurrency = false) {
    const arrow = d.direction === "up" ? "\u2191" : d.direction === "down" ? "\u2193" : "";
    const sign = d.delta > 0 ? "+" : "";
    const valStr = isCurrency ? formatRupiah(Math.abs(d.delta)) : Math.abs(d.delta).toLocaleString("id-ID");
    return (
      <span style={S.deltaText(d.direction)}>
        {arrow} {sign}{d.direction === "down" ? "-" : ""}{valStr} ({d.pct >= 0 ? "+" : ""}{d.pct.toFixed(1)}%)
      </span>
    );
  }

  function renderCompareBar(label: string, prodVal: number, scenVal: number, maxVal: number, color: string) {
    const prodPct = maxVal > 0 ? (prodVal / maxVal) * 100 : 0;
    const scenPct = maxVal > 0 ? (scenVal / maxVal) * 100 : 0;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: "0.75rem", width: 70, color: "#5C7080" }}>Production</span>
          <div style={{ ...S.barOuter, flex: 1 }}>
            <div style={S.barInner(prodPct, "#5C7080")} />
          </div>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: 90, textAlign: "right" as const }}>
            {prodVal.toLocaleString("id-ID")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.75rem", width: 70, color: color }}>Scenario</span>
          <div style={{ ...S.barOuter, flex: 1 }}>
            <div style={S.barInner(scenPct, color)} />
          </div>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: 90, textAlign: "right" as const, color }}>
            {scenVal.toLocaleString("id-ID")}
          </span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Loading                                                  */
  /* ---------------------------------------------------------------- */

  if (loading || !production) {
    return (
      <div style={{ padding: 30 }}>
        <PageHeader title="Scenarios (What-if Analysis)" />
        <div style={{ textAlign: "center", padding: 80 }}>
          <Spinner size={40} />
          <p style={{ marginTop: 16, color: "#5C7080" }}>Loading production data...</p>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Compare View                                             */
  /* ---------------------------------------------------------------- */

  function renderCompareView() {
    if (!prodKPIs || !scenarioKPIs || !activeScenario) return null;

    const maxRev = Math.max(prodKPIs.totalRevenue, scenarioKPIs.totalRevenue) * 1.1;
    const maxJobs = Math.max(prodKPIs.totalJobs, scenarioKPIs.totalJobs) * 1.1;
    const maxCust = Math.max(prodKPIs.activeCustomers, scenarioKPIs.activeCustomers) * 1.1;
    const maxTech = Math.max(prodKPIs.technicianCount, scenarioKPIs.technicianCount) * 1.1;
    const maxStock = Math.max(prodKPIs.totalStock, scenarioKPIs.totalStock) * 1.1;

    return (
      <div>
        <Callout intent={Intent.PRIMARY} icon="comparison" style={{ marginBottom: 20 }}>
          Comparing <strong>Production</strong> with <strong>Scenario: {activeScenario.name}</strong>
          {" \u2014 "}{activeScenario.changes.length} change(s) applied
        </Callout>

        {/* Side-by-side KPI cards */}
        <div style={S.compareGrid}>
          <Card elevation={Elevation.TWO} style={S.compareColumn}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Tag intent={Intent.SUCCESS} large round>PRODUCTION</Tag>
              <span style={{ fontSize: "0.85rem", color: "#5C7080" }}>Current live data</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                ["Total Revenue", formatRupiah(prodKPIs.totalRevenue)],
                ["Active Customers", prodKPIs.activeCustomers],
                ["Total Jobs", prodKPIs.totalJobs],
                ["Scheduled Jobs", prodKPIs.scheduledJobs],
                ["Technicians", prodKPIs.technicianCount],
                ["Total Stock", prodKPIs.totalStock],
              ] as [string, string | number][]).map(([label, val]) => (
                <div key={label} style={{ padding: 10, background: "#F5F8FA", borderRadius: 6, textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card elevation={Elevation.TWO} style={S.compareColumn}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Tag intent={Intent.WARNING} large round>SCENARIO</Tag>
              <span style={{ fontSize: "0.85rem", color: "#5C7080" }}>{activeScenario.name}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {([
                ["Total Revenue", formatRupiah(scenarioKPIs.totalRevenue), kpiDelta(prodKPIs.totalRevenue, scenarioKPIs.totalRevenue)],
                ["Active Customers", scenarioKPIs.activeCustomers, kpiDelta(prodKPIs.activeCustomers, scenarioKPIs.activeCustomers)],
                ["Total Jobs", scenarioKPIs.totalJobs, kpiDelta(prodKPIs.totalJobs, scenarioKPIs.totalJobs)],
                ["Scheduled Jobs", scenarioKPIs.scheduledJobs, kpiDelta(prodKPIs.scheduledJobs, scenarioKPIs.scheduledJobs)],
                ["Technicians", scenarioKPIs.technicianCount, kpiDelta(prodKPIs.technicianCount, scenarioKPIs.technicianCount)],
                ["Total Stock", scenarioKPIs.totalStock, kpiDelta(prodKPIs.totalStock, scenarioKPIs.totalStock)],
              ] as [string, string | number, ReturnType<typeof kpiDelta>][]).map(([label, val, delta]) => (
                <div key={label} style={{ padding: 10, background: delta.direction === "up" ? "#0A664010" : delta.direction === "down" ? "#A82A2A10" : "#F5F8FA", borderRadius: 6, textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 4 }}>{val}</div>
                  <div style={{ marginTop: 2 }}>{renderDeltaArrow(delta, label === "Total Revenue")}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Bar chart comparison */}
        <Card elevation={Elevation.ONE} style={{ marginTop: 20, padding: 24, borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon="horizontal-bar-chart" /> Metric Comparison
          </h4>
          {renderCompareBar("Revenue (Rp)", prodKPIs.totalRevenue, scenarioKPIs.totalRevenue, maxRev, "#2B95D6")}
          {renderCompareBar("Total Jobs", prodKPIs.totalJobs, scenarioKPIs.totalJobs, maxJobs, "#D9822B")}
          {renderCompareBar("Active Customers", prodKPIs.activeCustomers, scenarioKPIs.activeCustomers, maxCust, "#0A6640")}
          {renderCompareBar("Technicians", prodKPIs.technicianCount, scenarioKPIs.technicianCount, maxTech, "#634DBF")}
          {renderCompareBar("Stock Units", prodKPIs.totalStock, scenarioKPIs.totalStock, maxStock, "#A82A2A")}
        </Card>

        {/* Diff view: changes list */}
        <Card elevation={Elevation.ONE} style={{ marginTop: 20, padding: 24, borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon="delta" /> Change Diff
          </h4>
          {activeScenario.changes.length === 0 ? (
            <p style={{ color: "#5C7080" }}>No changes in this scenario.</p>
          ) : (
            <HTMLTable bordered compact striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Object</th>
                  <th>Change</th>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {activeScenario.changes.map((ch, i) => (
                  <tr key={i}>
                    <td><Tag minimal>{ch.objectType}</Tag></td>
                    <td>{ch.objectName}</td>
                    <td>
                      <Tag
                        minimal
                        intent={ch.kind === "added" ? Intent.SUCCESS : ch.kind === "deleted" ? Intent.DANGER : Intent.WARNING}
                      >
                        {ch.kind}
                      </Tag>
                    </td>
                    <td>{ch.field ?? "\u2014"}</td>
                    <td style={ch.kind === "modified" ? { textDecoration: "line-through", color: "#A82A2A" } : undefined}>
                      {ch.oldValue ?? "\u2014"}
                    </td>
                    <td style={ch.kind === "modified" ? { fontWeight: 600, color: "#0A6640" } : undefined}>
                      {ch.newValue ?? (ch.kind === "added" ? "NEW" : "\u2014")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Scenario Editor                                          */
  /* ---------------------------------------------------------------- */

  function renderEditor() {
    if (!activeScenario || !prodKPIs || !scenarioKPIs) return null;

    const objectTypes = ["Customer", "ServiceJob", "TreatmentProduct", "Technician"];

    function renderObjectTable() {
      if (!activeScenario) return null;
      const d = activeScenario.data;

      const cellStyle = (objectId: string, field: string): React.CSSProperties | undefined => {
        if (isAdded(objectId)) return S.addedBadge;
        if (isModified(objectId, field)) return S.modifiedCell;
        return undefined;
      };

      const editableCell = (
        rowIdx: number,
        objectId: string,
        field: string,
        value: string,
      ) => {
        const isEdit = editingCell?.row === rowIdx && editingCell?.col === field;
        if (isEdit) {
          return (
            <InputGroup
              small
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") { setEditingCell(null); setEditingValue(""); }
              }}
              autoFocus
              style={{ minWidth: 80 }}
            />
          );
        }
        const modStyle = cellStyle(objectId, field);
        return (
          <span
            style={{ ...modStyle, cursor: "pointer" }}
            onDoubleClick={() => startEdit(rowIdx, field, value)}
            title="Double-click to edit"
          >
            {value}
            {isAdded(objectId) && field === "name" && <span style={S.addedBadge}>NEW</span>}
          </span>
        );
      };

      if (editObjectType === "Customer") {
        return (
          <HTMLTable bordered compact striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Monthly Rate</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {d.customers.map((c, i) => (
                <tr key={c.customerId} style={isAdded(c.customerId) ? { background: "#0A664008" } : undefined}>
                  <td><code style={{ fontSize: "0.8rem" }}>{c.customerId}</code></td>
                  <td>{editableCell(i, c.customerId, "name", c.name)}</td>
                  <td>
                    <Tag minimal intent={c.status === "active" ? Intent.SUCCESS : Intent.NONE} round>
                      {c.status}
                    </Tag>
                  </td>
                  <td>{editableCell(i, c.customerId, "monthlyRate", String(c.monthlyRate))}</td>
                  <td style={{ fontSize: "0.85rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.address ?? "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        );
      }

      if (editObjectType === "ServiceJob") {
        return (
          <HTMLTable bordered compact striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Technician</th>
                <th>Pest</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.jobs.map((j, i) => (
                <tr key={j.jobId} style={isAdded(j.jobId) ? { background: "#0A664008" } : undefined}>
                  <td><code style={{ fontSize: "0.8rem" }}>{j.jobId}</code></td>
                  <td>
                    {j.customerName ?? j.customerId}
                    {isAdded(j.jobId) && <span style={S.addedBadge}>NEW</span>}
                  </td>
                  <td>{j.technicianName ?? j.technicianId}</td>
                  <td><Tag minimal>{j.pestType}</Tag></td>
                  <td>
                    <Tag
                      minimal
                      round
                      intent={
                        j.status === "completed" ? Intent.SUCCESS
                          : j.status === "in-progress" ? Intent.PRIMARY
                          : j.status === "scheduled" ? Intent.WARNING
                          : Intent.NONE
                      }
                    >
                      {j.status}
                    </Tag>
                  </td>
                  <td>{editableCell(i, j.jobId, "amountCharged", String(j.amountCharged))}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        );
      }

      if (editObjectType === "TreatmentProduct") {
        return (
          <HTMLTable bordered compact striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Min Level</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {d.products.map((p, i) => (
                <tr key={p.productId} style={isAdded(p.productId) ? { background: "#0A664008" } : undefined}>
                  <td><code style={{ fontSize: "0.8rem" }}>{p.productId}</code></td>
                  <td>{p.name}</td>
                  <td><Tag minimal>{p.category ?? "\u2014"}</Tag></td>
                  <td>{editableCell(i, p.productId, "stockQty", String(p.stockQty))}</td>
                  <td>{p.minStockLevel}</td>
                  <td>{p.unit ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        );
      }

      // Technician
      return (
        <HTMLTable bordered compact striped style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Rating</th>
              <th>Active Jobs</th>
              <th>Specialization</th>
            </tr>
          </thead>
          <tbody>
            {d.technicians.map((t) => (
              <tr key={t.technicianId} style={isAdded(t.technicianId) ? { background: "#0A664008" } : undefined}>
                <td><code style={{ fontSize: "0.8rem" }}>{t.technicianId}</code></td>
                <td>
                  {t.name}
                  {isAdded(t.technicianId) && <span style={S.addedBadge}>NEW</span>}
                </td>
                <td>
                  <Tag minimal intent={t.status === "available" ? Intent.SUCCESS : t.status === "on-job" ? Intent.WARNING : Intent.NONE} round>
                    {t.status}
                  </Tag>
                </td>
                <td>{t.rating.toFixed(1)}</td>
                <td>{t.activeJobCount}</td>
                <td>{t.specialization ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      );
    }

    /* KPI deltas for the right panel */
    const deltas = {
      revenue: kpiDelta(prodKPIs.totalRevenue, scenarioKPIs.totalRevenue),
      customers: kpiDelta(prodKPIs.activeCustomers, scenarioKPIs.activeCustomers),
      jobs: kpiDelta(prodKPIs.totalJobs, scenarioKPIs.totalJobs),
      technicians: kpiDelta(prodKPIs.technicianCount, scenarioKPIs.technicianCount),
      stock: kpiDelta(prodKPIs.totalStock, scenarioKPIs.totalStock),
      avgJob: kpiDelta(prodKPIs.avgJobValue, scenarioKPIs.avgJobValue),
    };

    return (
      <div style={S.editorLayout}>
        {/* Left Panel: Changes list */}
        <Card elevation={Elevation.ONE} style={S.panel}>
          <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon icon="changes" size={14} /> Changes ({activeScenario.changes.length})
          </h4>
          {activeScenario.changes.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "#5C7080" }}>
              No changes yet. Double-click a cell to edit, or use a template.
            </p>
          ) : (
            activeScenario.changes.map((ch, i) => (
              <div key={i} style={S.changeItem(ch.kind)}>
                <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>
                  <Tag
                    minimal
                    intent={ch.kind === "added" ? Intent.SUCCESS : ch.kind === "deleted" ? Intent.DANGER : Intent.WARNING}
                    style={{ marginRight: 4, fontSize: "0.75rem" }}
                  >
                    {ch.kind.toUpperCase()}
                  </Tag>
                  {ch.objectType}
                </div>
                <div style={{ marginTop: 2 }}>{ch.objectName}</div>
                {ch.field && (
                  <div style={{ fontSize: "0.78rem", color: "#5C7080", marginTop: 2 }}>
                    {ch.field}: {ch.oldValue} {"\u2192"} <strong>{ch.newValue}</strong>
                  </div>
                )}
              </div>
            ))
          )}
        </Card>

        {/* Center: Object Editor */}
        <Card elevation={Elevation.ONE} style={{ ...S.panel, maxHeight: "none", overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon icon="th" size={16} />
              <HTMLSelect
                value={editObjectType}
                onChange={(e) => setEditObjectType(e.target.value)}
                options={objectTypes}
                minimal
              />
            </div>
            <span style={{ fontSize: "0.8rem", color: "#5C7080" }}>
              Double-click any value to edit
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            {renderObjectTable()}
          </div>
        </Card>

        {/* Right Panel: Impact Summary */}
        <Card elevation={Elevation.ONE} style={S.panel}>
          <h4 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon icon="dashboard" size={14} /> Impact Summary
          </h4>

          <div style={S.kpiCard(deltas.revenue.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Revenue Delta</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{formatRupiah(scenarioKPIs.totalRevenue)}</div>
            {renderDeltaArrow(deltas.revenue, true)}
          </div>

          <div style={S.kpiCard(deltas.customers.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Customer Count</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{scenarioKPIs.activeCustomers}</div>
            {renderDeltaArrow(deltas.customers)}
          </div>

          <div style={S.kpiCard(deltas.jobs.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Job Count</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{scenarioKPIs.totalJobs}</div>
            {renderDeltaArrow(deltas.jobs)}
          </div>

          <div style={S.kpiCard(deltas.technicians.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Technicians</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{scenarioKPIs.technicianCount}</div>
            {renderDeltaArrow(deltas.technicians)}
          </div>

          <div style={S.kpiCard(deltas.stock.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Stock Delta</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{scenarioKPIs.totalStock} units</div>
            {renderDeltaArrow(deltas.stock)}
          </div>

          <div style={S.kpiCard(deltas.avgJob.direction)}>
            <div style={{ fontSize: "0.75rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.04em" }}>Avg Job Value</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginTop: 2 }}>{formatRupiah(Math.round(scenarioKPIs.avgJobValue))}</div>
            {renderDeltaArrow(deltas.avgJob, true)}
          </div>

          <div style={{ marginTop: 16, borderTop: "1px solid #E1E8ED", paddingTop: 12 }}>
            <Button
              intent={Intent.PRIMARY}
              icon="tick"
              text="Apply to Production"
              fill
              style={{ marginBottom: 8 }}
              onClick={() => {
                // In a real app, this would POST changes to the API
                alert(
                  `Would apply ${activeScenario.changes.length} change(s) to production via API.\n\nIn demo mode, changes are local only.`,
                );
              }}
            />
            <Button
              intent={Intent.DANGER}
              icon="trash"
              text="Discard Scenario"
              fill
              minimal
              onClick={() => deleteScenario(activeScenario.id)}
            />
          </div>
        </Card>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{ padding: 30 }}>
      <PageHeader
        title="Scenarios (What-if Analysis)"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button icon="refresh" minimal onClick={loadData} />
          </div>
        }
      />

      {/* Top bar: scenario controls */}
      <div style={S.topBar}>
        <Tag intent={Intent.SUCCESS} large round icon="tick-circle">
          Production
        </Tag>

        {scenarios.length > 0 && (
          <>
            <Icon icon="chevron-right" color="#5C7080" />
            <HTMLSelect
              value={activeScenarioId ?? ""}
              onChange={(e) => {
                setActiveScenarioId(e.target.value || null);
                setCompareMode(false);
              }}
              style={{ minWidth: 200 }}
            >
              <option value="">Select a scenario...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.changes.length} changes)
                </option>
              ))}
            </HTMLSelect>
          </>
        )}

        {activeScenario && (
          <Button
            icon="comparison"
            intent={compareMode ? Intent.PRIMARY : Intent.NONE}
            text={compareMode ? "Hide Compare" : "Compare Scenarios"}
            onClick={() => setCompareMode(!compareMode)}
            outlined={!compareMode}
          />
        )}

        <div style={{ flex: 1 }} />

        <Button
          intent={Intent.PRIMARY}
          icon="git-branch"
          text="Create Scenario"
          onClick={() => setShowCreateDialog(true)}
        />
      </div>

      {/* Scenario branch indicator */}
      {activeScenario && (
        <Callout
          intent={Intent.WARNING}
          icon="git-branch"
          style={{ marginBottom: 20 }}
        >
          <strong>Branch: {activeScenario.name}</strong> {" \u2014 "}
          Editing in sandbox mode. Changes are local and do not affect production data.
          <span style={{ float: "right", fontSize: "0.8rem", color: "#5C7080" }}>
            Created {new Date(activeScenario.createdAt).toLocaleString()}
          </span>
        </Callout>
      )}

      {/* Compare mode */}
      {compareMode && activeScenario && renderCompareView()}

      {/* Editor mode */}
      {!compareMode && activeScenario && renderEditor()}

      {/* No active scenario: show templates */}
      {!activeScenario && (
        <>
          <Callout icon="info-sign" style={{ marginBottom: 20 }}>
            <strong>Scenarios</strong> let you branch your ontology like Git for data.
            Create a sandbox, modify objects without affecting production, and compare outcomes side-by-side.
            Foundry calls this "Treating Your Business Like Code."
          </Callout>

          <h4 style={{ margin: "0 0 16px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon="layout-grid" size={16} /> Scenario Templates
          </h4>

          <div style={S.templateGrid}>
            {TEMPLATES.map((tpl) => (
              <Card
                key={tpl.id}
                elevation={hoveredTemplate === tpl.id ? Elevation.THREE : Elevation.ONE}
                style={S.templateCard(tpl.color, hoveredTemplate === tpl.id)}
                interactive
                onMouseEnter={() => setHoveredTemplate(tpl.id)}
                onMouseLeave={() => setHoveredTemplate(null)}
                onClick={() => {
                  if (tpl.id === "custom") {
                    setShowCreateDialog(true);
                  } else {
                    createScenario(tpl.name, tpl.id);
                  }
                }}
              >
                <div style={S.templateAccent(tpl.color)} />
                <div style={{ paddingTop: 8 }}>
                  <div style={S.templateIcon(tpl.color)}>
                    <Icon icon={tpl.icon as any} size={22} color={tpl.color} />
                  </div>
                  <h4 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 600 }}>{tpl.name}</h4>
                  <p style={{ fontSize: "0.85rem", color: "#5C7080", margin: "0 0 12px", lineHeight: 1.4 }}>
                    {tpl.description}
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tpl.tags.map((tag) => (
                      <Tag key={tag} minimal round style={{ fontSize: "0.75rem" }}>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Production KPI summary */}
          {prodKPIs && (
            <Card elevation={Elevation.ONE} style={{ padding: 24, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 16px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon icon="dashboard" size={16} /> Production Baseline
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                {([
                  ["Total Revenue", formatRupiah(prodKPIs.totalRevenue), "#2B95D6"],
                  ["Active Customers", String(prodKPIs.activeCustomers), "#0A6640"],
                  ["Total Jobs", String(prodKPIs.totalJobs), "#D9822B"],
                  ["Scheduled", String(prodKPIs.scheduledJobs), "#BF7326"],
                  ["Completed", String(prodKPIs.completedJobs), "#0F9960"],
                  ["Technicians", String(prodKPIs.technicianCount), "#634DBF"],
                  ["Stock Units", String(prodKPIs.totalStock), "#A82A2A"],
                  ["Avg Job Value", formatRupiah(Math.round(prodKPIs.avgJobValue)), "#5C7080"],
                ] as [string, string, string][]).map(([label, val, color]) => (
                  <div key={label} style={{ textAlign: "center", padding: 14, background: "#F5F8FA", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color }} />
                    <div style={{ fontSize: "0.7rem", color: "#5C7080", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{val}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Create scenario dialog */}
      <Dialog
        isOpen={showCreateDialog}
        onClose={() => { setShowCreateDialog(false); setNewScenarioName(""); }}
        title="Create New Scenario"
        icon="git-branch"
        style={{ width: 440 }}
      >
        <div style={{ padding: 20 }}>
          <p style={{ marginBottom: 16, color: "#5C7080" }}>
            This will create a sandbox branch of your current production data.
            All edits remain local until you choose to apply them.
          </p>
          <InputGroup
            placeholder="Scenario name (e.g., Q2 Budget Plan)"
            value={newScenarioName}
            onChange={(e) => setNewScenarioName(e.target.value)}
            large
            leftIcon="label"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newScenarioName.trim()) {
                createScenario(newScenarioName.trim());
                setShowCreateDialog(false);
                setNewScenarioName("");
              }
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button text="Cancel" onClick={() => { setShowCreateDialog(false); setNewScenarioName(""); }} />
            <Button
              intent={Intent.PRIMARY}
              icon="git-branch"
              text="Create Branch"
              disabled={!newScenarioName.trim()}
              onClick={() => {
                createScenario(newScenarioName.trim());
                setShowCreateDialog(false);
                setNewScenarioName("");
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
