import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Mock LLM client — smart pest-control-aware responses for dev / demo
// ---------------------------------------------------------------------------

/** Normalise text for keyword matching. */
function norm(s: string): string {
  return s.toLowerCase().trim();
}

function has(q: string, ...keywords: string[]): boolean {
  return keywords.some((k) => q.includes(k));
}

/**
 * Try to fetch live data from svc-objects via the local service mesh.
 * Falls back to canned data when the service is unreachable.
 */
async function fetchObjects(
  objectType: string,
): Promise<Record<string, unknown>[]> {
  try {
    // Try well-known local svc-objects ports (direct or through gateway)
    const urls = [
      "http://localhost:8080/api/v2/ontologies",
      "http://localhost:8085/api/v2/ontologies",
    ];

    for (const base of urls) {
      try {
        const ontRes = await fetch(base, {
          signal: AbortSignal.timeout(2000),
        });
        if (!ontRes.ok) continue;
        const ontBody = (await ontRes.json()) as {
          data?: Array<{ rid: string }>;
        };
        const rid = ontBody?.data?.[0]?.rid;
        if (!rid) continue;

        const objRes = await fetch(
          `${base.replace("/ontologies", "")}/ontologies/${rid}/objectSets/loadObjects`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectSet: { type: "base", objectType },
              select: [],
            }),
            signal: AbortSignal.timeout(3000),
          },
        );
        if (!objRes.ok) continue;
        const objBody = (await objRes.json()) as {
          data?: Array<{ properties?: Record<string, unknown> }>;
        };
        return (objBody?.data ?? []).map((o) => o.properties ?? o);
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

// ---------------------------------------------------------------------------
// Canned data — used when svc-objects is not reachable
// ---------------------------------------------------------------------------

const CANNED_CUSTOMERS = [
  { customerId: "C001", name: "PT Maju Jaya", status: "Active", city: "Jakarta", monthlyRate: 2500000 },
  { customerId: "C002", name: "CV Berkah Sentosa", status: "Active", city: "Surabaya", monthlyRate: 1800000 },
  { customerId: "C003", name: "Hotel Bintang Lima", status: "Active", city: "Bali", monthlyRate: 4500000 },
  { customerId: "C004", name: "Restoran Sederhana", status: "Inactive", city: "Bandung", monthlyRate: 1200000 },
  { customerId: "C005", name: "Mall Central Park", status: "Active", city: "Jakarta", monthlyRate: 6000000 },
];

const CANNED_TECHNICIANS = [
  { technicianId: "T001", name: "Budi Santoso", status: "Available", rating: 4.8, specialization: "Termite Control" },
  { technicianId: "T002", name: "Andi Pratama", status: "On Job", rating: 4.5, specialization: "Rodent Control" },
  { technicianId: "T003", name: "Dewi Sari", status: "Available", rating: 4.9, specialization: "General Pest" },
  { technicianId: "T004", name: "Riko Hermawan", status: "On Leave", rating: 4.2, specialization: "Fumigation" },
];

const CANNED_JOBS = [
  { jobId: "J001", customerName: "PT Maju Jaya", technicianName: "Budi Santoso", scheduledDate: "2026-03-24", pestType: "Termite", priority: "High", status: "Scheduled", amountCharged: 3500000 },
  { jobId: "J002", customerName: "Hotel Bintang Lima", technicianName: "Dewi Sari", scheduledDate: "2026-03-24", pestType: "Cockroach", priority: "Medium", status: "In Progress", amountCharged: 2000000 },
  { jobId: "J003", customerName: "CV Berkah Sentosa", technicianName: "Andi Pratama", scheduledDate: "2026-03-22", pestType: "Rat", priority: "High", status: "Completed", amountCharged: 2800000, customerRating: 5 },
  { jobId: "J004", customerName: "Mall Central Park", technicianName: "Budi Santoso", scheduledDate: "2026-03-25", pestType: "Termite", priority: "Critical", status: "Scheduled", amountCharged: 5500000 },
  { jobId: "J005", customerName: "Restoran Sederhana", technicianName: "Dewi Sari", scheduledDate: "2026-03-20", pestType: "Cockroach", priority: "Low", status: "Completed", amountCharged: 1500000, customerRating: 4 },
];

const CANNED_PRODUCTS = [
  { productId: "P001", name: "Termidor SC", stockQty: 15, minStockLevel: 20, unit: "Liter", category: "Termiticide", supplier: "BASF" },
  { productId: "P002", name: "Demand CS", stockQty: 45, minStockLevel: 10, unit: "Liter", category: "Insecticide", supplier: "Syngenta" },
  { productId: "P003", name: "Contrac Blox", stockQty: 8, minStockLevel: 15, unit: "Kg", category: "Rodenticide", supplier: "Bell Labs" },
  { productId: "P004", name: "Gentrol IGR", stockQty: 30, minStockLevel: 10, unit: "Liter", category: "Growth Regulator", supplier: "Zoecon" },
];

const CANNED_VEHICLES = [
  { vehicleId: "V001", plateNumber: "B 1234 ABC", type: "Van", status: "available", assignedTo: null, mileage: 45200 },
  { vehicleId: "V002", plateNumber: "B 5678 DEF", type: "Pickup", status: "in-use", assignedTo: "T001", mileage: 62800 },
  { vehicleId: "V003", plateNumber: "B 9012 GHI", type: "Motorcycle", status: "in-use", assignedTo: "T003", mileage: 18500 },
  { vehicleId: "V004", plateNumber: "B 3456 JKL", type: "Van", status: "maintenance", assignedTo: null, mileage: 89100 },
];

// ---------------------------------------------------------------------------
// Smart response generator
// ---------------------------------------------------------------------------

function formatRupiah(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => "---");
  const lines = [
    "| " + headers.join(" | ") + " |",
    "| " + sep.join(" | ") + " |",
    ...rows.map((r) => "| " + r.join(" | ") + " |"),
  ];
  return lines.join("\n");
}

async function generateSmartResponse(
  userMessage: string,
  _conversationHistory: ChatMessage[],
): Promise<string> {
  const q = norm(userMessage);

  // --- Greeting ---
  if (has(q, "hello", "hi", "halo", "hey", "selamat")) {
    return (
      "Hello! I'm your **Pest Control AI Assistant**. I have access to your ontology data including:\n\n" +
      "- **Customers** - client information and contracts\n" +
      "- **Technicians** - field staff profiles and ratings\n" +
      "- **Service Jobs** - scheduled and completed pest control jobs\n" +
      "- **Treatment Products** - inventory and stock levels\n" +
      "- **Vehicles** - fleet management and assignments\n" +
      "- **Invoices** - billing and payment tracking\n" +
      "- **Schedules** - daily technician scheduling\n\n" +
      "What would you like to know?"
    );
  }

  // --- Help ---
  if (has(q, "help", "bantuan", "what can", "bisa apa")) {
    return (
      "I can help you with the following:\n\n" +
      "**Customers**\n" +
      "- How many customers do we have?\n" +
      "- Show all customers\n" +
      "- Which customers are in Jakarta?\n\n" +
      "**Technicians**\n" +
      "- List all technicians\n" +
      "- Who is our best-rated technician?\n\n" +
      "**Service Jobs**\n" +
      "- Show pending/incomplete jobs\n" +
      "- What jobs are completed?\n" +
      "- Today's schedule\n\n" +
      "**Revenue & Products**\n" +
      "- Total revenue\n" +
      "- Low stock products\n" +
      "- Show all products\n\n" +
      "**Fleet & Vehicles**\n" +
      "- Show all vehicles\n" +
      "- Which vehicles are available?\n\n" +
      "**Overview**\n" +
      "- Give me a summary / dashboard overview"
    );
  }

  // --- Customer count ---
  if (has(q, "how many customer", "customer count", "jumlah customer", "berapa customer", "total customer")) {
    let customers = await fetchObjects("Customer");
    if (customers.length === 0) customers = CANNED_CUSTOMERS;
    const active = customers.filter((c: any) => norm(c.status ?? "") === "active");
    return (
      `There are **${customers.length} customers** in the system:\n\n` +
      `- **${active.length}** active\n` +
      `- **${customers.length - active.length}** inactive\n\n` +
      `Active customer rate: **${((active.length / customers.length) * 100).toFixed(0)}%**`
    );
  }

  // --- Show customers ---
  if (has(q, "show customer", "list customer", "all customer", "tampilkan customer", "daftar customer", "semua customer")) {
    let customers = await fetchObjects("Customer");
    if (customers.length === 0) customers = CANNED_CUSTOMERS;
    const table = mdTable(
      ["ID", "Name", "Status", "City", "Monthly Rate"],
      customers.map((c: any) => [
        c.customerId ?? "-",
        c.name ?? "-",
        c.status ?? "-",
        c.city ?? c.address ?? "-",
        c.monthlyRate != null ? formatRupiah(c.monthlyRate) : "-",
      ]),
    );
    return `Here are all **${customers.length} customers**:\n\n${table}`;
  }

  // --- Technicians ---
  if (has(q, "technician", "teknisi", "tech list", "field staff")) {
    let techs = await fetchObjects("Technician");
    if (techs.length === 0) techs = CANNED_TECHNICIANS;

    // Best technician
    if (has(q, "best", "top", "terbaik", "highest", "rating")) {
      const sorted = [...techs].sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0));
      const best: any = sorted[0];
      const table = mdTable(
        ["#", "Name", "Rating", "Specialization", "Status"],
        sorted.slice(0, 5).map((t: any, i) => [
          String(i + 1),
          t.name ?? "-",
          t.rating != null ? String(t.rating) : "-",
          t.specialization ?? "-",
          t.status ?? "-",
        ]),
      );
      return (
        `The **top-rated technician** is **${best.name}** with a rating of **${best.rating}/5.0** ` +
        `(specialization: ${best.specialization ?? "General"}).\n\n` +
        `**Top Technicians:**\n\n${table}`
      );
    }

    // List all
    const table = mdTable(
      ["ID", "Name", "Status", "Rating", "Specialization"],
      techs.map((t: any) => [
        t.technicianId ?? "-",
        t.name ?? "-",
        t.status ?? "-",
        t.rating != null ? String(t.rating) : "-",
        t.specialization ?? "-",
      ]),
    );
    return `Here are all **${techs.length} technicians**:\n\n${table}`;
  }

  // --- Pending / incomplete jobs ---
  if (has(q, "pending", "incomplete", "belum selesai", "in progress", "open job", "active job", "scheduled")) {
    let jobs = await fetchObjects("ServiceJob");
    if (jobs.length === 0) jobs = CANNED_JOBS;
    const pending = jobs.filter(
      (j: any) => norm(j.status ?? "") !== "completed" && norm(j.status ?? "") !== "cancelled",
    );
    if (pending.length === 0) return "All jobs are completed! No pending jobs found.";
    const table = mdTable(
      ["Job ID", "Customer", "Technician", "Date", "Pest Type", "Priority", "Status"],
      pending.map((j: any) => [
        j.jobId ?? "-",
        j.customerName ?? j.customerId ?? "-",
        j.technicianName ?? j.technicianId ?? "-",
        j.scheduledDate ?? "-",
        j.pestType ?? "-",
        j.priority ?? "-",
        j.status ?? "-",
      ]),
    );
    return `There are **${pending.length} pending jobs**:\n\n${table}`;
  }

  // --- Completed jobs ---
  if (has(q, "completed", "selesai", "finished", "done job")) {
    let jobs = await fetchObjects("ServiceJob");
    if (jobs.length === 0) jobs = CANNED_JOBS;
    const completed = jobs.filter((j: any) => norm(j.status ?? "") === "completed");
    if (completed.length === 0) return "No completed jobs found yet.";
    const table = mdTable(
      ["Job ID", "Customer", "Technician", "Date", "Pest", "Rating", "Amount"],
      completed.map((j: any) => [
        j.jobId ?? "-",
        j.customerName ?? j.customerId ?? "-",
        j.technicianName ?? j.technicianId ?? "-",
        j.scheduledDate ?? "-",
        j.pestType ?? "-",
        j.customerRating != null ? String(j.customerRating) : "-",
        j.amountCharged != null ? formatRupiah(j.amountCharged) : "-",
      ]),
    );
    return `There are **${completed.length} completed jobs**:\n\n${table}`;
  }

  // --- All jobs ---
  if (has(q, "show job", "list job", "all job", "tampilkan job", "semua job", "service job")) {
    let jobs = await fetchObjects("ServiceJob");
    if (jobs.length === 0) jobs = CANNED_JOBS;
    const table = mdTable(
      ["Job ID", "Customer", "Technician", "Date", "Pest", "Priority", "Status", "Amount"],
      jobs.map((j: any) => [
        j.jobId ?? "-",
        j.customerName ?? j.customerId ?? "-",
        j.technicianName ?? j.technicianId ?? "-",
        j.scheduledDate ?? "-",
        j.pestType ?? "-",
        j.priority ?? "-",
        j.status ?? "-",
        j.amountCharged != null ? formatRupiah(j.amountCharged) : "-",
      ]),
    );
    return `Here are all **${jobs.length} service jobs**:\n\n${table}`;
  }

  // --- Revenue ---
  if (has(q, "revenue", "pendapatan", "income", "omset", "earnings", "total amount")) {
    let jobs = await fetchObjects("ServiceJob");
    if (jobs.length === 0) jobs = CANNED_JOBS;
    const completed = jobs.filter((j: any) => norm(j.status ?? "") === "completed");
    const total = completed.reduce((sum: number, j: any) => sum + (j.amountCharged ?? 0), 0);
    const avg = completed.length > 0 ? Math.round(total / completed.length) : 0;
    return (
      `**Revenue Summary:**\n\n` +
      `- Total revenue from **${completed.length} completed jobs**: **${formatRupiah(total)}**\n` +
      `- Average per job: **${formatRupiah(avg)}**\n` +
      `- Total jobs in system: **${jobs.length}**\n` +
      `- Completion rate: **${((completed.length / jobs.length) * 100).toFixed(0)}%**`
    );
  }

  // --- Low stock ---
  if (has(q, "low stock", "stok rendah", "restock", "out of stock", "stok menipis", "stock")) {
    let products = await fetchObjects("TreatmentProduct");
    if (products.length === 0) products = CANNED_PRODUCTS;
    const low = products.filter((p: any) => (p.stockQty ?? 0) < (p.minStockLevel ?? Infinity));
    if (low.length === 0) return "All products have sufficient stock levels. No restocking needed.";
    const table = mdTable(
      ["ID", "Product", "Current Stock", "Min Required", "Unit", "Category"],
      low.map((p: any) => [
        p.productId ?? "-",
        p.name ?? "-",
        String(p.stockQty ?? 0),
        String(p.minStockLevel ?? "-"),
        p.unit ?? "-",
        p.category ?? "-",
      ]),
    );
    return (
      `**Warning:** There are **${low.length} products** below minimum stock levels:\n\n${table}\n\n` +
      `These items should be reordered soon to avoid service disruptions.`
    );
  }

  // --- Vehicles ---
  if (has(q, "vehicle", "kendaraan", "fleet", "car", "van", "truck", "motorcycle", "plate")) {
    let vehicles = await fetchObjects("Vehicle");
    if (vehicles.length === 0) vehicles = CANNED_VEHICLES;
    const available = vehicles.filter((v: any) => norm(v.status ?? "") === "available");
    const inUse = vehicles.filter((v: any) => norm(v.status ?? "") === "in-use");
    const maintenance = vehicles.filter((v: any) => norm(v.status ?? "") === "maintenance");
    const table = mdTable(
      ["ID", "Plate", "Type", "Status", "Assigned To", "Mileage (km)"],
      vehicles.map((v: any) => [
        v.vehicleId ?? "-",
        v.plateNumber ?? "-",
        v.type ?? "-",
        v.status ?? "-",
        v.assignedTo ?? "—",
        v.mileage != null ? v.mileage.toLocaleString("id-ID") : "-",
      ]),
    );
    return (
      `**Fleet Overview:** ${vehicles.length} vehicles\n\n` +
      `- **${available.length}** available\n` +
      `- **${inUse.length}** in use\n` +
      `- **${maintenance.length}** in maintenance\n\n` +
      table
    );
  }

  // --- Products ---
  if (has(q, "product", "produk", "treatment", "inventory", "chemical")) {
    let products = await fetchObjects("TreatmentProduct");
    if (products.length === 0) products = CANNED_PRODUCTS;
    const table = mdTable(
      ["ID", "Product", "Stock", "Min Stock", "Unit", "Category", "Supplier"],
      products.map((p: any) => [
        p.productId ?? "-",
        p.name ?? "-",
        String(p.stockQty ?? 0),
        String(p.minStockLevel ?? "-"),
        p.unit ?? "-",
        p.category ?? "-",
        p.supplier ?? "-",
      ]),
    );
    return `Here are all **${products.length} treatment products**:\n\n${table}`;
  }

  // --- Today's schedule ---
  if (has(q, "today", "hari ini", "schedule today", "jadwal")) {
    let jobs = await fetchObjects("ServiceJob");
    if (jobs.length === 0) jobs = CANNED_JOBS;
    const today = new Date().toISOString().slice(0, 10);
    const todayJobs = jobs.filter((j: any) => j.scheduledDate === today);
    if (todayJobs.length === 0) return `No jobs scheduled for today (${today}).`;
    const table = mdTable(
      ["Job ID", "Customer", "Technician", "Pest Type", "Priority", "Status"],
      todayJobs.map((j: any) => [
        j.jobId ?? "-",
        j.customerName ?? j.customerId ?? "-",
        j.technicianName ?? j.technicianId ?? "-",
        j.pestType ?? "-",
        j.priority ?? "-",
        j.status ?? "-",
      ]),
    );
    return `**Today's Schedule (${today}):** ${todayJobs.length} jobs\n\n${table}`;
  }

  // --- Summary / overview ---
  if (has(q, "summary", "overview", "ringkasan", "dashboard", "stats", "statistik")) {
    let [customers, technicians, jobs, products, vehicles] = await Promise.all([
      fetchObjects("Customer"),
      fetchObjects("Technician"),
      fetchObjects("ServiceJob"),
      fetchObjects("TreatmentProduct"),
      fetchObjects("Vehicle"),
    ]);
    if (customers.length === 0) customers = CANNED_CUSTOMERS;
    if (technicians.length === 0) technicians = CANNED_TECHNICIANS;
    if (jobs.length === 0) jobs = CANNED_JOBS;
    if (products.length === 0) products = CANNED_PRODUCTS;
    if (vehicles.length === 0) vehicles = CANNED_VEHICLES;

    const activeCustomers = customers.filter((c: any) => norm(c.status ?? "") === "active").length;
    const availableTechs = technicians.filter((t: any) => norm(t.status ?? "") === "available").length;
    const completedJobs = jobs.filter((j: any) => norm(j.status ?? "") === "completed");
    const totalRevenue = completedJobs.reduce((sum: number, j: any) => sum + (j.amountCharged ?? 0), 0);
    const lowStock = products.filter((p: any) => (p.stockQty ?? 0) < (p.minStockLevel ?? Infinity)).length;
    const availableVehicles = vehicles.filter((v: any) => norm(v.status ?? "") === "available").length;

    return (
      `**Pest Control System Overview:**\n\n` +
      `| Metric | Value |\n| --- | --- |\n` +
      `| Customers | ${customers.length} total (${activeCustomers} active) |\n` +
      `| Technicians | ${technicians.length} total (${availableTechs} available) |\n` +
      `| Service Jobs | ${jobs.length} total (${completedJobs.length} completed) |\n` +
      `| Total Revenue | ${formatRupiah(totalRevenue)} |\n` +
      `| Products | ${products.length} total (${lowStock} low stock) |\n` +
      `| Vehicles | ${vehicles.length} total (${availableVehicles} available) |\n\n` +
      `The system is running smoothly. ${lowStock > 0 ? `**${lowStock} product(s) need restocking.**` : "All stock levels are healthy."}`
    );
  }

  // --- Fallback ---
  return (
    "I can help you explore your **pest control ontology data**. Here are some things you can ask:\n\n" +
    "- *\"How many customers do we have?\"*\n" +
    "- *\"Show all technicians\"*\n" +
    "- *\"What jobs are pending?\"*\n" +
    "- *\"Total revenue\"*\n" +
    "- *\"Low stock products\"*\n" +
    "- *\"Show fleet vehicles\"*\n" +
    "- *\"Give me a summary\"*\n\n" +
    "Feel free to ask in English or Indonesian!"
  );
}

// ---------------------------------------------------------------------------
// MockLlmClient
// ---------------------------------------------------------------------------

export class MockLlmClient implements LlmClient {
  /** The most recent messages passed to chat(). Useful for test assertions. */
  lastMessages: ChatMessage[] = [];

  async chat(
    messages: ChatMessage[],
    _options?: ChatOptions,
  ): Promise<ChatResponse> {
    this.lastMessages = messages;

    // Find the last user message
    const userMessages = messages.filter((m) => m.role === "user");
    const lastUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

    // Code generation requests (keep existing behavior for generate-function)
    if (lastUserMessage.includes("generate") || lastUserMessage.includes("Generate")) {
      if (lastUserMessage.includes("TypeScript") || lastUserMessage.includes("function")) {
        return {
          message: {
            role: "assistant",
            content: "return args.x + args.y;",
          },
          usage: { promptTokens: 50, completionTokens: 20 },
          model: "mock",
        };
      }
    }

    // Check if this is a chat conversation (has system message with ontology context)
    const systemMsg = messages.find((m) => m.role === "system");
    const isOntologyChat =
      systemMsg?.content?.includes("ontology") ||
      systemMsg?.content?.includes("OpenFoundry");

    if (isOntologyChat) {
      // Generate a smart, ontology-aware response
      const content = await generateSmartResponse(lastUserMessage, messages);
      const tokens = content.length;
      return {
        message: { role: "assistant", content },
        usage: {
          promptTokens: Math.round(tokens * 0.8),
          completionTokens: Math.round(tokens * 0.3),
        },
        model: "mock-smart",
      };
    }

    // Default: structured JSON response (for /aip/query endpoint)
    return {
      message: {
        role: "assistant",
        content: JSON.stringify({
          answer: "The ontology contains 3 object types.",
          sources: [
            {
              type: "objectType",
              rid: "ri.ontology.main.object-type.abc",
              name: "Employee",
            },
          ],
          confidence: 0.92,
        }),
      },
      usage: { promptTokens: 100, completionTokens: 50 },
      model: "mock",
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Return deterministic fake embeddings (4 dimensions for testing)
    return texts.map((text) => {
      const seed = text.length;
      return [
        Math.sin(seed),
        Math.cos(seed),
        Math.sin(seed * 2),
        Math.cos(seed * 2),
      ];
    });
  }
}
