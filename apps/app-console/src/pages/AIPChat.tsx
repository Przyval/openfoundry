import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Colors,
  HTMLTable,
  Icon,
  InputGroup,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: "user" | "aip";
  content: string;
  /** If present, render as an HTML table instead of markdown-ish text. */
  table?: { headers: string[]; rows: string[][] };
  timestamp: Date;
}

interface OntologyObject {
  properties: Record<string, unknown>;
}

interface LoadObjectsResponse {
  data: OntologyObject[];
  totalCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatRupiah(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function thinkingDelay(): Promise<void> {
  const ms = 500 + Math.random() * 1000; // 500-1500ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Discover the pest-control ontology RID (cached). */
let _cachedRid: string | null = null;
async function getOntologyRid(): Promise<string | null> {
  if (_cachedRid) return _cachedRid;
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE_URL}/api/v2/ontologies`, { headers });
    if (!res.ok) return null;
    const body = await res.json();
    const ont = (body?.data ?? []).find(
      (o: any) =>
        o.displayName?.toLowerCase().includes("pest") ||
        o.apiName?.toLowerCase().includes("pest"),
    );
    if (ont) {
      _cachedRid = ont.rid;
      return ont.rid;
    }
    // fallback: use the first ontology available
    if (body?.data?.length > 0) {
      _cachedRid = body.data[0].rid;
      return _cachedRid;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function loadObjects(objectType: string): Promise<any[]> {
  const rid = await getOntologyRid();
  if (!rid) return [];
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      `${API_BASE_URL}/api/v2/ontologies/${rid}/objectSets/loadObjects`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          objectSet: { type: "base", objectType },
          select: [],
        }),
      },
    );
    if (!res.ok) return [];
    const data: LoadObjectsResponse = await res.json();
    return (data?.data ?? []).map((o) => o.properties ?? o);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  svc-aip LLM Backend                                                */
/* ------------------------------------------------------------------ */

interface AipChatResponse {
  message: { role: string; content: string };
  model?: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Try calling the svc-aip chat endpoint for a real LLM-powered response.
 *
 * Returns the assistant message content on success, or `null` if the service
 * is unavailable, running in mock mode, or any error occurs — letting the
 * caller fall back to the local pattern-matching engine.
 */
async function tryAipService(
  query: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<string | null> {
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const ontologyRid = await getOntologyRid();

    // Build messages array with conversation history + new user message
    const messages = [
      ...conversationHistory,
      { role: "user", content: query },
    ];

    const res = await fetch(`${API_BASE_URL}/api/v2/aip/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        ontologyRid: ontologyRid ?? undefined,
      }),
    });

    if (!res.ok) return null;

    const data: AipChatResponse = await res.json();

    // If the service is running in mock mode, fall back to pattern matching
    // which provides richer, data-driven responses from the actual ontology.
    if (data.model === "mock") return null;

    return data.message?.content ?? null;
  } catch {
    // svc-aip unreachable or errored — fall back silently
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Smart Query Engine (pattern-matching fallback)                     */
/* ------------------------------------------------------------------ */

interface QueryResult {
  content: string;
  table?: { headers: string[]; rows: string[][] };
}

/** Normalise a query string for matching. */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

function matchesAny(q: string, patterns: string[]): boolean {
  return patterns.some((p) => q.includes(p));
}

async function processQuery(query: string): Promise<QueryResult> {
  const q = norm(query);

  // --- Customer count ---
  if (
    matchesAny(q, [
      "jumlah customer",
      "berapa customer",
      "how many customer",
      "customer count",
      "total customer",
      "jumlah pelanggan",
      "berapa pelanggan",
    ])
  ) {
    const customers = await loadObjects("Customer");
    const active = customers.filter(
      (c: any) => c.status?.toLowerCase() === "active",
    );
    return {
      content:
        `Terdapat **${customers.length} customers** dalam sistem, ` +
        `**${active.length}** berstatus aktif dan **${customers.length - active.length}** tidak aktif.`,
    };
  }

  // --- Show all technicians ---
  if (
    matchesAny(q, [
      "tampilkan technician",
      "tampilkan teknisi",
      "show technician",
      "list technician",
      "semua teknisi",
      "daftar teknisi",
      "all technician",
    ])
  ) {
    const techs = await loadObjects("Technician");
    if (techs.length === 0)
      return { content: "Tidak ada data Technician yang ditemukan." };
    return {
      content: `Berikut adalah **${techs.length} technicians** yang terdaftar:`,
      table: {
        headers: ["ID", "Nama", "Status", "Rating", "Spesialisasi"],
        rows: techs.map((t: any) => [
          t.technicianId ?? "-",
          t.name ?? "-",
          t.status ?? "-",
          t.rating != null ? String(t.rating) : "-",
          t.specialization ?? "-",
        ]),
      },
    };
  }

  // --- Best / top technician ---
  if (
    matchesAny(q, [
      "teknisi terbaik",
      "teknisi rating tertinggi",
      "best technician",
      "top technician",
      "highest rated",
      "rating tertinggi",
      "teknisi rating",
    ])
  ) {
    const techs = await loadObjects("Technician");
    if (techs.length === 0)
      return { content: "Tidak ada data Technician yang ditemukan." };
    const sorted = [...techs].sort(
      (a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0),
    );
    const best = sorted[0];
    return {
      content:
        `Teknisi dengan rating tertinggi: **${best.name}** dengan rating **${best.rating}** ` +
        `(spesialisasi: ${best.specialization ?? "-"}).`,
      table: {
        headers: ["#", "Nama", "Rating", "Status", "Spesialisasi"],
        rows: sorted.slice(0, 5).map((t: any, i: number) => [
          String(i + 1),
          t.name ?? "-",
          t.rating != null ? String(t.rating) : "-",
          t.status ?? "-",
          t.specialization ?? "-",
        ]),
      },
    };
  }

  // --- Pending / incomplete jobs ---
  if (
    matchesAny(q, [
      "job belum selesai",
      "job pending",
      "pekerjaan belum",
      "belum selesai",
      "pending job",
      "incomplete job",
      "unfinished job",
      "open job",
      "job yang belum",
      "in progress",
      "in-progress",
      "scheduled job",
      "job aktif",
      "active job",
    ])
  ) {
    const jobs = await loadObjects("ServiceJob");
    const pending = jobs.filter(
      (j: any) =>
        j.status?.toLowerCase() !== "completed" &&
        j.status?.toLowerCase() !== "cancelled",
    );
    if (pending.length === 0)
      return { content: "Semua job sudah selesai! Tidak ada job pending." };
    return {
      content: `Terdapat **${pending.length} job** yang belum selesai:`,
      table: {
        headers: [
          "Job ID",
          "Customer",
          "Technician",
          "Tanggal",
          "Jenis Hama",
          "Prioritas",
          "Status",
        ],
        rows: pending.map((j: any) => [
          j.jobId ?? "-",
          j.customerName ?? j.customerId ?? "-",
          j.technicianName ?? j.technicianId ?? "-",
          j.scheduledDate ?? "-",
          j.pestType ?? "-",
          j.priority ?? "-",
          j.status ?? "-",
        ]),
      },
    };
  }

  // --- Total revenue ---
  if (
    matchesAny(q, [
      "total revenue",
      "total pendapatan",
      "total pemasukan",
      "revenue",
      "omset",
      "omzet",
      "income",
      "earnings",
      "total amount",
    ])
  ) {
    const jobs = await loadObjects("ServiceJob");
    const completed = jobs.filter(
      (j: any) => j.status?.toLowerCase() === "completed",
    );
    const total = completed.reduce(
      (sum: number, j: any) => sum + (j.amountCharged ?? 0),
      0,
    );
    const count = completed.length;

    // Try Invoice objects too
    const invoices = await loadObjects("Invoice");
    if (invoices.length > 0) {
      const invTotal = invoices.reduce(
        (sum: number, inv: any) => sum + (inv.totalAmount ?? inv.amount ?? 0),
        0,
      );
      return {
        content:
          `Total revenue dari **${invoices.length} invoices**: **${formatRupiah(invTotal)}**\n\n` +
          `Tambahan dari completed jobs: **${count} job** selesai dengan total **${formatRupiah(total)}**.`,
      };
    }

    return {
      content:
        `Total revenue dari **${count} completed jobs**: **${formatRupiah(total)}**.\n\n` +
        `Rata-rata per job: **${formatRupiah(count > 0 ? Math.round(total / count) : 0)}**.`,
    };
  }

  // --- Low stock ---
  if (
    matchesAny(q, [
      "stok rendah",
      "low stock",
      "stock rendah",
      "stok kurang",
      "stock kurang",
      "perlu restock",
      "need restock",
      "stok habis",
      "out of stock",
      "stok menipis",
      "produk stok",
    ])
  ) {
    const products = await loadObjects("TreatmentProduct");
    const low = products.filter(
      (p: any) => (p.stockQty ?? 0) < (p.minStockLevel ?? Infinity),
    );
    if (low.length === 0)
      return {
        content:
          "Semua produk memiliki stok yang cukup. Tidak ada produk dengan stok rendah.",
      };
    return {
      content: `Terdapat **${low.length} produk** dengan stok di bawah level minimum:`,
      table: {
        headers: [
          "ID",
          "Nama Produk",
          "Stok Saat Ini",
          "Min. Stok",
          "Satuan",
          "Kategori",
        ],
        rows: low.map((p: any) => [
          p.productId ?? "-",
          p.name ?? "-",
          String(p.stockQty ?? 0),
          String(p.minStockLevel ?? "-"),
          p.unit ?? "-",
          p.category ?? "-",
        ]),
      },
    };
  }

  // --- Today's schedule ---
  if (
    matchesAny(q, [
      "jadwal hari ini",
      "today schedule",
      "today's schedule",
      "schedule today",
      "jadwal today",
      "hari ini",
      "agenda hari ini",
      "job hari ini",
    ])
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const jobs = await loadObjects("ServiceJob");
    const todayJobs = jobs.filter((j: any) => j.scheduledDate === today);

    // Also try Schedule objects
    const schedules = await loadObjects("Schedule");
    const todaySchedules = schedules.filter(
      (s: any) => s.date === today || s.scheduledDate === today,
    );

    if (todayJobs.length === 0 && todaySchedules.length === 0) {
      return {
        content: `Tidak ada jadwal untuk hari ini (${today}).`,
      };
    }

    const rows = todayJobs.map((j: any) => [
      j.scheduledTime ?? "-",
      j.jobId ?? "-",
      j.customerName ?? j.customerId ?? "-",
      j.technicianName ?? j.technicianId ?? "-",
      j.pestType ?? "-",
      j.priority ?? "-",
      j.status ?? "-",
    ]);

    // Append schedule objects if any
    todaySchedules.forEach((s: any) => {
      rows.push([
        s.time ?? s.scheduledTime ?? "-",
        s.scheduleId ?? "-",
        s.customerName ?? s.customerId ?? "-",
        s.technicianName ?? s.technicianId ?? "-",
        s.type ?? s.serviceType ?? "-",
        s.priority ?? "-",
        s.status ?? "-",
      ]);
    });

    return {
      content: `Jadwal hari ini (${today}): **${rows.length} kegiatan**`,
      table: {
        headers: [
          "Waktu",
          "ID",
          "Customer",
          "Technician",
          "Jenis",
          "Prioritas",
          "Status",
        ],
        rows,
      },
    };
  }

  // --- Customer by city / filter ---
  const cityMatch = q.match(
    /customer\s+(?:di|dari|in|from|at)\s+(\w[\w\s]*)/i,
  );
  if (cityMatch) {
    const city = cityMatch[1].trim().toLowerCase();
    const customers = await loadObjects("Customer");
    const filtered = customers.filter(
      (c: any) =>
        (c.address ?? "").toLowerCase().includes(city) ||
        (c.city ?? "").toLowerCase().includes(city),
    );
    if (filtered.length === 0)
      return {
        content: `Tidak ditemukan customer di **${cityMatch[1].trim()}**.`,
      };
    return {
      content: `Ditemukan **${filtered.length} customer** di **${cityMatch[1].trim()}**:`,
      table: {
        headers: ["ID", "Nama", "Status", "Alamat", "Rate Bulanan"],
        rows: filtered.map((c: any) => [
          c.customerId ?? "-",
          c.name ?? "-",
          c.status ?? "-",
          c.address ?? c.city ?? "-",
          c.monthlyRate != null ? formatRupiah(c.monthlyRate) : "-",
        ]),
      },
    };
  }

  // --- Show all customers ---
  if (
    matchesAny(q, [
      "tampilkan customer",
      "tampilkan pelanggan",
      "show customer",
      "list customer",
      "semua customer",
      "daftar customer",
      "all customer",
      "daftar pelanggan",
      "semua pelanggan",
    ])
  ) {
    const customers = await loadObjects("Customer");
    if (customers.length === 0)
      return { content: "Tidak ada data Customer yang ditemukan." };
    return {
      content: `Berikut adalah **${customers.length} customers** yang terdaftar:`,
      table: {
        headers: ["ID", "Nama", "Status", "Alamat", "Rate Bulanan"],
        rows: customers.map((c: any) => [
          c.customerId ?? "-",
          c.name ?? "-",
          c.status ?? "-",
          c.address ?? "-",
          c.monthlyRate != null ? formatRupiah(c.monthlyRate) : "-",
        ]),
      },
    };
  }

  // --- Show all products ---
  if (
    matchesAny(q, [
      "tampilkan produk",
      "show product",
      "list product",
      "semua produk",
      "daftar produk",
      "all product",
      "treatment product",
    ])
  ) {
    const products = await loadObjects("TreatmentProduct");
    if (products.length === 0)
      return { content: "Tidak ada data TreatmentProduct yang ditemukan." };
    return {
      content: `Berikut adalah **${products.length} produk** treatment:`,
      table: {
        headers: [
          "ID",
          "Nama",
          "Stok",
          "Min. Stok",
          "Satuan",
          "Kategori",
          "Supplier",
        ],
        rows: products.map((p: any) => [
          p.productId ?? "-",
          p.name ?? "-",
          String(p.stockQty ?? 0),
          String(p.minStockLevel ?? "-"),
          p.unit ?? "-",
          p.category ?? "-",
          p.supplier ?? "-",
        ]),
      },
    };
  }

  // --- Show all jobs ---
  if (
    matchesAny(q, [
      "tampilkan job",
      "show job",
      "list job",
      "semua job",
      "daftar job",
      "all job",
      "semua pekerjaan",
      "show all service",
    ])
  ) {
    const jobs = await loadObjects("ServiceJob");
    if (jobs.length === 0)
      return { content: "Tidak ada data ServiceJob yang ditemukan." };
    return {
      content: `Berikut adalah **${jobs.length} service jobs**:`,
      table: {
        headers: [
          "Job ID",
          "Customer",
          "Technician",
          "Tanggal",
          "Jenis Hama",
          "Prioritas",
          "Status",
          "Amount",
        ],
        rows: jobs.map((j: any) => [
          j.jobId ?? "-",
          j.customerName ?? j.customerId ?? "-",
          j.technicianName ?? j.technicianId ?? "-",
          j.scheduledDate ?? "-",
          j.pestType ?? "-",
          j.priority ?? "-",
          j.status ?? "-",
          j.amountCharged != null ? formatRupiah(j.amountCharged) : "-",
        ]),
      },
    };
  }

  // --- Completed jobs ---
  if (
    matchesAny(q, [
      "job selesai",
      "job completed",
      "completed job",
      "pekerjaan selesai",
      "job yang sudah",
    ])
  ) {
    const jobs = await loadObjects("ServiceJob");
    const completed = jobs.filter(
      (j: any) => j.status?.toLowerCase() === "completed",
    );
    if (completed.length === 0)
      return { content: "Belum ada job yang selesai." };
    return {
      content: `Terdapat **${completed.length} job** yang sudah selesai:`,
      table: {
        headers: [
          "Job ID",
          "Customer",
          "Technician",
          "Tanggal",
          "Jenis Hama",
          "Rating",
          "Amount",
        ],
        rows: completed.map((j: any) => [
          j.jobId ?? "-",
          j.customerName ?? j.customerId ?? "-",
          j.technicianName ?? j.technicianId ?? "-",
          j.scheduledDate ?? "-",
          j.pestType ?? "-",
          j.customerRating != null ? String(j.customerRating) : "-",
          j.amountCharged != null ? formatRupiah(j.amountCharged) : "-",
        ]),
      },
    };
  }

  // --- Summary / overview ---
  if (
    matchesAny(q, [
      "ringkasan",
      "summary",
      "overview",
      "rangkuman",
      "statistik",
      "stats",
      "dashboard",
    ])
  ) {
    const [customers, technicians, jobs, products] = await Promise.all([
      loadObjects("Customer"),
      loadObjects("Technician"),
      loadObjects("ServiceJob"),
      loadObjects("TreatmentProduct"),
    ]);
    const activeCustomers = customers.filter(
      (c: any) => c.status?.toLowerCase() === "active",
    ).length;
    const completedJobs = jobs.filter(
      (j: any) => j.status?.toLowerCase() === "completed",
    );
    const totalRevenue = completedJobs.reduce(
      (sum: number, j: any) => sum + (j.amountCharged ?? 0),
      0,
    );
    const availableTechs = technicians.filter(
      (t: any) => t.status?.toLowerCase() === "available",
    ).length;
    const lowStockProducts = products.filter(
      (p: any) => (p.stockQty ?? 0) < (p.minStockLevel ?? Infinity),
    ).length;

    return {
      content:
        `**Ringkasan Sistem Pest Control:**\n\n` +
        `- **Customers:** ${customers.length} total (${activeCustomers} aktif)\n` +
        `- **Technicians:** ${technicians.length} total (${availableTechs} available)\n` +
        `- **Service Jobs:** ${jobs.length} total (${completedJobs.length} selesai)\n` +
        `- **Total Revenue:** ${formatRupiah(totalRevenue)}\n` +
        `- **Treatment Products:** ${products.length} total (${lowStockProducts} stok rendah)`,
    };
  }

  // --- Help ---
  if (matchesAny(q, ["help", "bantuan", "bisa apa", "apa saja", "what can"])) {
    return {
      content:
        `Saya bisa membantu Anda dengan query berikut:\n\n` +
        `- **Customers:** "Berapa jumlah customer?", "Tampilkan semua customer", "Customer di Jakarta"\n` +
        `- **Technicians:** "Tampilkan semua teknisi", "Siapa teknisi terbaik?"\n` +
        `- **Service Jobs:** "Job yang belum selesai", "Jadwal hari ini", "Job selesai"\n` +
        `- **Revenue:** "Total revenue", "Total pendapatan"\n` +
        `- **Products:** "Produk stok rendah", "Tampilkan semua produk"\n` +
        `- **Overview:** "Ringkasan", "Summary"`,
    };
  }

  // --- Default fallback ---
  return {
    content:
      "Maaf, saya belum bisa memproses query tersebut. Coba tanyakan tentang **customers**, **technicians**, **jobs**, **products**, **invoices**, atau **schedules**.\n\nKetik **help** untuk melihat contoh query yang didukung.",
  };
}

/* ------------------------------------------------------------------ */
/*  Markdown-ish renderer (bold, lists, newlines)                      */
/* ------------------------------------------------------------------ */

function renderMarkdown(text: string): React.ReactNode {
  // Split into lines for list handling
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (line.trim() === "") {
      elements.push(<br key={`br-${lineIdx}`} />);
      return;
    }

    const isBullet = line.trim().startsWith("- ");
    const displayLine = isBullet ? line.trim().slice(2) : line;

    // Parse bold (**text**) within a line
    const parts = displayLine.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${lineIdx}-${partIdx}`}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={`${lineIdx}-${partIdx}`}>{part}</span>;
    });

    if (isBullet) {
      elements.push(
        <div
          key={`line-${lineIdx}`}
          style={{ display: "flex", gap: 6, paddingLeft: 8, marginBottom: 2 }}
        >
          <span style={{ flexShrink: 0 }}>•</span>
          <span>{rendered}</span>
        </div>,
      );
    } else {
      elements.push(
        <div key={`line-${lineIdx}`} style={{ marginBottom: 2 }}>
          {rendered}
        </div>,
      );
    }
  });

  return <>{elements}</>;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "calc(100vh - 100px)",
    maxHeight: "calc(100vh - 100px)",
    overflow: "hidden",
  } as React.CSSProperties,

  chatArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  } as React.CSSProperties,

  userBubble: {
    alignSelf: "flex-end" as const,
    background: "#2B95D6",
    color: "#ffffff",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "70%",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
  } as React.CSSProperties,

  aipBubble: {
    alignSelf: "flex-start" as const,
    background: "#30404D",
    color: "#F5F8FA",
    padding: "12px 16px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "85%",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
    position: "relative" as const,
  } as React.CSSProperties,

  inputBar: {
    padding: "12px 24px 16px 24px",
    borderTop: `1px solid ${Colors.DARK_GRAY5}`,
    background: "#293742",
    display: "flex",
    gap: 8,
    alignItems: "center",
  } as React.CSSProperties,

  suggestionsRow: {
    padding: "8px 24px 0 24px",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  } as React.CSSProperties,

  poweredBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    fontSize: "0.7rem",
    color: "#8A9BA8",
    opacity: 0.7,
  } as React.CSSProperties,

  thinkingDots: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    background: "#30404D",
    borderRadius: "16px 16px 16px 4px",
    alignSelf: "flex-start" as const,
    color: "#A7B6C2",
    fontSize: "0.9rem",
  } as React.CSSProperties,

  tableWrapper: {
    marginTop: 8,
    overflowX: "auto" as const,
    maxWidth: "100%",
  } as React.CSSProperties,

  timestamp: {
    fontSize: "0.7rem",
    color: "#8A9BA8",
    marginTop: 4,
    textAlign: "right" as const,
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Suggested queries                                                  */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  "Berapa jumlah customer aktif?",
  "Tampilkan job yang belum selesai",
  "Siapa teknisi terbaik?",
  "Total revenue bulan ini",
  "Produk dengan stok rendah",
  "Jadwal hari ini",
];

/* ------------------------------------------------------------------ */
/*  Welcome message                                                    */
/* ------------------------------------------------------------------ */

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "aip",
  content:
    "Selamat datang di **AIP (AI Platform)**. Saya bisa membantu Anda meng-query data ontology menggunakan bahasa natural.\n\nTanyakan apa saja tentang **customers**, **technicians**, **jobs**, **products**, atau **invoices**.\n\nKetik pertanyaan Anda di bawah atau klik salah satu saran di atas input.",
  timestamp: new Date(),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIPChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-scroll to bottom */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatAreaRef.current) {
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking, scrollToBottom]);

  /* Send a message */
  const handleSend = useCallback(
    async (text?: string) => {
      const query = (text ?? input).trim();
      if (!query || thinking) return;

      const userMsg: ChatMessage = {
        id: msgId(),
        role: "user",
        content: query,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setThinking(true);

      try {
        // Build conversation history for svc-aip (exclude welcome message, tables, etc.)
        const conversationHistory = messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));

        // Try the real LLM service first; falls back to null if unavailable or mock
        const [llmResponse] = await Promise.all([
          tryAipService(query, conversationHistory),
          thinkingDelay(),
        ]);

        let aipMsg: ChatMessage;

        if (llmResponse) {
          // Real LLM response from svc-aip
          aipMsg = {
            id: msgId(),
            role: "aip",
            content: llmResponse,
            timestamp: new Date(),
          };
        } else {
          // Fallback to pattern-matching engine
          const result = await processQuery(query);
          aipMsg = {
            id: msgId(),
            role: "aip",
            content: result.content,
            table: result.table,
            timestamp: new Date(),
          };
        }

        setMessages((prev) => [...prev, aipMsg]);
      } catch {
        const errMsg: ChatMessage = {
          id: msgId(),
          role: "aip",
          content:
            "Terjadi kesalahan saat memproses query. Silakan coba lagi.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setThinking(false);
        inputRef.current?.focus();
      }
    },
    [input, thinking, messages],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      void handleSend(suggestion);
    },
    [handleSend],
  );

  const handleClearChat = useCallback(() => {
    setMessages([
      {
        ...WELCOME_MESSAGE,
        id: msgId(),
        timestamp: new Date(),
      },
    ]);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <PageHeader
        title="AIP Chat"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tag
              icon="globe-network"
              minimal
              intent="success"
              round
              large
            >
              Ontology Connected
            </Tag>
            <Button
              icon="trash"
              text="Clear Chat"
              minimal
              small
              onClick={handleClearChat}
            />
          </div>
        }
      />

      <Card
        style={{
          padding: 0,
          borderRadius: 8,
          overflow: "hidden",
          background: "#1F2933",
        }}
      >
        <div style={styles.container}>
          {/* -------- AIP Header Bar -------- */}
          <div
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, #1F4B99 0%, #2B95D6 100%)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Icon icon="chat" size={20} color="#fff" />
            <div>
              <div
                style={{
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "1rem",
                }}
              >
                AIP — AI Platform
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.75rem" }}>
                Natural Language Ontology Interface
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Tag
              minimal
              round
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "none",
              }}
            >
              <Icon
                icon="symbol-circle"
                size={8}
                style={{ color: "#3DCC91", marginRight: 4 }}
              />
              Online
            </Tag>
          </div>

          {/* -------- Chat messages -------- */}
          <div ref={chatAreaRef} style={styles.chatArea}>
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  /* User bubble */
                  <div style={styles.userBubble}>{msg.content}</div>
                ) : (
                  /* AIP bubble */
                  <div style={styles.aipBubble}>
                    {renderMarkdown(msg.content)}

                    {msg.table && (
                      <div style={styles.tableWrapper}>
                        <HTMLTable
                          bordered
                          condensed
                          striped
                          style={{
                            marginTop: 8,
                            width: "100%",
                            fontSize: "0.82rem",
                            background: "#263238",
                          }}
                        >
                          <thead>
                            <tr>
                              {msg.table.headers.map((h, i) => (
                                <th
                                  key={i}
                                  style={{
                                    color: "#A7B6C2",
                                    fontWeight: 600,
                                    padding: "6px 10px",
                                    borderBottom: "1px solid #5C7080",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.table.rows.map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td
                                    key={ci}
                                    style={{
                                      padding: "5px 10px",
                                      color: "#E1E8ED",
                                      borderBottom: "1px solid #394B59",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </HTMLTable>
                      </div>
                    )}

                    {/* Powered by Ontology badge */}
                    <div style={styles.poweredBadge}>
                      <Icon icon="database" size={10} />
                      Powered by Ontology
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div
                  style={{
                    ...styles.timestamp,
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  {msg.timestamp.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && (
              <div style={styles.thinkingDots}>
                <Spinner size={16} intent="primary" />
                <span>AIP sedang berpikir...</span>
              </div>
            )}
          </div>

          {/* -------- Suggestion chips -------- */}
          {messages.length <= 1 && !thinking && (
            <div style={styles.suggestionsRow}>
              {SUGGESTIONS.map((s) => (
                <Tag
                  key={s}
                  interactive
                  round
                  minimal
                  intent="primary"
                  onClick={() => handleSuggestionClick(s)}
                  style={{
                    cursor: "pointer",
                    padding: "4px 12px",
                    fontSize: "0.82rem",
                  }}
                >
                  {s}
                </Tag>
              ))}
            </div>
          )}

          {/* -------- Input bar -------- */}
          <div style={styles.inputBar}>
            <InputGroup
              inputRef={inputRef as any}
              fill
              large
              placeholder="Tanyakan sesuatu tentang data Anda..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={thinking}
              leftIcon="search"
              style={{
                background: "#1F2933",
                borderRadius: 8,
              }}
              rightElement={
                <Button
                  icon="arrow-right"
                  intent="primary"
                  minimal
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || thinking}
                />
              }
            />
          </div>
        </div>
      </Card>
    </>
  );
}
