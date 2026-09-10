# OpenFoundry — Panduan Pengguna

> Platform intelijen operasional kelas Palantir untuk UKM Indonesia.
> Login: `admin` / `admin123` | Console: http://localhost:3000

---

## Daftar Isi

1. [Quick Start](#quick-start)
2. [Login & Autentikasi](#login--autentikasi)
3. [Dashboard Utama](#dashboard-utama)
4. [Dashboard Pest Control](#dashboard-pest-control)
5. [Navigasi & Menu](#navigasi--menu)
6. [Fitur Data](#fitur-data)
7. [Fitur Build](#fitur-build)
8. [Fitur Automation](#fitur-automation)
9. [Fitur Admin](#fitur-admin)
10. [AIP Chat (AI Assistant)](#aip-chat-ai-assistant)
11. [Workflow Umum](#workflow-umum)
12. [Panduan Deploy untuk Client](#panduan-deploy-untuk-client)
13. [API Reference](#api-reference)

---

## Quick Start

```bash
# 1. Clone & install
git clone <repo> && cd openfoundry
pnpm install

# 2. Start semua services (9 backend + frontend)
bash start.sh

# 3. Buka browser
open http://localhost:3000

# 4. Login
Username: admin
Password: admin123
```

Selesai. Dashboard langsung tampil dengan data demo pest control (8 customer, 5 teknisi, 8 job, 8 produk).

---

## Login & Autentikasi

### Mode Development (default)
Buka http://localhost:3000 → form login muncul:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |
| Role | Administrator (full access) |

User lain yang tersedia di dev mode:
- `developer` / `dev123` (Editor — bisa edit data, tidak bisa manage users)
- `analyst` / `analyst123` (Viewer — read-only)

### Mode Production
Dev users di-disable otomatis. Buat admin pertama:

```bash
bash scripts/bootstrap-admin.sh \
  --username admin \
  --password <password-aman> \
  --org "Nama Perusahaan"
```

### OAuth2 PKCE (untuk integrasi SDK)
```bash
# Client credentials grant
curl -X POST http://localhost:8080/multipass/api/oauth2/token \
  -d "grant_type=client_credentials&client_id=admin&client_secret=admin123"
```

---

## Dashboard Utama

**URL:** http://localhost:3000/ (halaman pertama setelah login)

```
┌──────────────────────────────────────────────────────────────┐
│                     OpenFoundry Dashboard                      │
├──────────┬──────────┬──────────┬──────────┐                   │
│ Ontologi │ Object   │ Objects  │ Users    │  ← 8 stat cards   │
│    2     │ Types 14 │   47     │    3     │                   │
├──────────┼──────────┼──────────┼──────────┤                   │
│ Groups   │ Datasets │Functions │ Actions  │                   │
│    2     │    5     │    3     │    4     │                   │
├──────────┴──────────┴──────────┴──────────┤                   │
│                                            │                   │
│  Recent Activity                           │  Quick Actions    │
│  ┌────────────────────────────────────┐    │  ┌─────────────┐ │
│  │ 10:05 admin CREATE Customer       │    │  │Create Ontol.│ │
│  │ 10:04 admin CREATE ServiceJob     │    │  │Upload Data  │ │
│  │ 10:03 admin CREATE Technician     │    │  │Manage Users │ │
│  └────────────────────────────────────┘    │  │Audit Log    │ │
│                                            │  └─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Stat cards** — klik untuk langsung ke halaman terkait.
**Recent Activity** — log aktivitas terbaru (CREATE/UPDATE/DELETE).
**Quick Actions** — shortcut ke fungsi yang sering dipakai.

---

## Dashboard Pest Control

**URL:** http://localhost:3000/pest-control

Dashboard operasional harian untuk bisnis pest control. **Ini yang client buka setiap pagi jam 8.**

```
┌──────────────────────────────────────────────────────────────┐
│            🏠 Pest Control Operations Dashboard               │
├──────────────────────────┬───────────────────────────────────┤
│  Customers (8)           │  Technicians (5)                  │
│  ┌──────────────────┐    │  ┌────────────────────────────┐   │
│  │ PT Maju Jaya Food│    │  │ Agus  ★★★★☆  Termite     │   │
│  │ Hotel Grand Merc.│    │  │ Dedi  ★★★★★  General     │   │
│  │ Budi Hartono     │    │  │ Rizky ★★★☆☆  Fumigation  │   │
│  │ Restoran Padang  │    │  │ Wahyu ★★★★☆  Rodent      │   │
│  │ ...              │    │  │ Fajar ★★★★☆  Mosquito    │   │
│  └──────────────────┘    │  └────────────────────────────┘   │
├──────────────────────────┴───────────────────────────────────┤
│  Service Jobs                                                 │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ JOB-001  PT Maju Jaya   Termite   Agus    COMPLETED  │   │
│  │ JOB-002  Hotel Grand    Rodent    Wahyu   IN-PROGRESS│   │
│  │ JOB-003  Budi Hartono   Cockroach Dedi    SCHEDULED  │   │
│  │ ...                                                    │   │
│  └───────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  Treatment Products (Stock)                                   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Advion Cockroach Gel  █████████░  90/100  OK         │   │
│  │ Brodifacoum           ████░░░░░░  40/100  WARNING    │   │
│  │ Termidor SC           ██░░░░░░░░  20/100  CRITICAL   │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Customer list** — nama, alamat, tipe (residential/commercial), status kontrak.
**Technician list** — rating bintang, spesialisasi, jumlah job aktif.
**Service Jobs** — status real-time (scheduled → in-progress → completed).
**Stock levels** — warning otomatis kalau stok di bawah minimum.

---

## Navigasi & Menu

Sidebar di sebelah kiri, 5 section:

### Platform
| Menu | URL | Fungsi |
|------|-----|--------|
| Dashboard | `/` | Overview statistik dan aktivitas |
| Pest Control | `/pest-control` | Dashboard operasional harian |
| AIP Chat | `/aip` | Tanya jawab AI tentang data bisnis |
| Compass | `/compass` | Browse resource tree (folder, project) |
| Notifications | `/notifications` | Pusat notifikasi (Info/Warning/Error/Critical) |

### Data
| Menu | URL | Fungsi |
|------|-----|--------|
| Ontology | `/ontology` | Browse definisi object types, link types |
| Object Explorer | `/objects` | Cari, filter, agregasi data objects |
| Network Graph | `/graph` | Visualisasi relasi antar objects |
| Contour | `/contour` | Interactive data boards (tabel, chart, pivot) |
| Data Lineage | `/lineage` | Visualisasi alur data (source → transform → target) |
| Data Health | `/data-health` | Cek kualitas data (completeness, consistency) |
| Datasets | `/datasets` | Kelola datasets dan branches |
| Data Connection | `/data-connection` | Import data dari CSV, JSON, database |
| Pipelines | `/pipelines` | Pipeline ETL multi-step dengan scheduling |

### Build
| Menu | URL | Fungsi |
|------|-----|--------|
| Workshop | `/workshop` | Visual dashboard builder (drag & drop widgets) |
| Code Workbook | `/workbook` | Notebook SQL/JavaScript (seperti Jupyter) |
| Scenarios | `/scenarios` | Tracking perubahan dan rollback |
| Actions | `/actions` | Browse dan execute business actions |
| Functions | `/functions` | Register dan jalankan reusable functions |

### Automation
| Menu | URL | Fungsi |
|------|-----|--------|
| Monitors | `/monitors` | Scheduled/event-based triggers |
| Webhooks | `/webhooks` | Outbound webhooks ke external systems |

### Admin
| Menu | URL | Fungsi |
|------|-----|--------|
| Users | `/admin/users` | CRUD user management |
| Groups | `/admin/groups` | Group management + member assignment |
| Audit Log | `/admin/audit` | Log semua aktivitas (siapa, kapan, apa) |

---

## Fitur Data

### Object Explorer (`/objects`)
Fitur paling powerful — cari dan analisis data bisnis:

**Tab Browse** — pilih ontology → pilih object type → lihat data paginasi
```
Ontology: [pest-control ▼]  Object Type: [Customer ▼]  Search: [________]

│ customerId │ name                │ city     │ status │ monthlyRate │
├────────────┼─────────────────────┼──────────┼────────┼─────────────┤
│ CUST-001   │ PT Maju Jaya Food   │ Jakarta  │ active │ Rp 2.500.000│
│ CUST-002   │ Hotel Grand Mercure │ Jakarta  │ active │ Rp 5.000.000│
```

**Tab Filters** — build query kompleks:
```
Field: [status]  Operator: [eq]  Value: [active]     [+ Add Filter]
Field: [city]    Operator: [contains] Value: [Jakarta] [+ Add Filter]

→ 5 results matching all filters
```

Operator yang tersedia: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `isNull`

**Tab Aggregation** — metrik bisnis:
```
Group by: [pestType]    Metric: [count]

pestType    │ count
────────────┼──────
termite     │ 3
cockroach   │ 2
rodent      │ 2
mosquito    │ 1
```

Metrik: `count`, `sum`, `avg`, `min`, `max`, `approximateDistinct`

**Tab Links** — navigasi relasi:
```
Customer "PT Maju Jaya" → CustomerHasJobs → [JOB-001, JOB-005, JOB-008]
                        → CustomerHasInvoices → [INV-001, INV-005]
```

### Network Graph (`/graph`)
Visualisasi force-directed graph:
- Node = object (warna per tipe)
- Edge = link relationship
- Pilih link type untuk filter tampilan
- Hover untuk detail, klik untuk navigate

### Contour (`/contour`)
Interactive data boards — buat analisis kustom:

1. **Table Board** — tabel data dengan kolom yang bisa dipilih
2. **GroupBy Board** — group data per field, tampilkan agregat
3. **Aggregate Board** — pivot table dengan metrik
4. **Chart Board** — bar chart atau pie chart
5. **Filter Board** — filter yang berlaku ke semua board

### Data Connection (`/data-connection`)
Import data dari file:

```
Step 1: Upload file (drag & drop CSV/JSON)
Step 2: Preview data (auto-detect kolom)
Step 3: Map kolom ke object type properties
Step 4: Import (progress bar)
Step 5: Selesai — data masuk ke ontology
```

---

## Fitur Build

### Workshop (`/workshop`)
Visual dashboard builder — buat dashboard kustom tanpa coding:

**Widget types:**
- KPI Card — angka besar + label (contoh: "47 Active Jobs")
- Data Table — tabel dengan kolom yang bisa dipilih
- Bar Chart — grafik batang
- Pie Chart — grafik lingkaran
- Status List — list dengan warna status
- Action Button — tombol yang trigger business action
- Filter Bar — filter yang berlaku ke semua widget
- Text/Header — teks statis

**Pre-built templates:**
- Pest Control Operations Center
- Customer 360
- Technician Performance
- Inventory Management

### Code Workbook (`/workbook`)
Jupyter-style notebook:

```
┌─────────────────────────────────────────────┐
│ [Markdown]  ## Analisis Revenue Bulanan      │
├─────────────────────────────────────────────┤
│ [SQL]  SELECT pestType, SUM(amountCharged)   │
│        FROM ServiceJob                       │
│        GROUP BY pestType                     │
│        ORDER BY SUM(amountCharged) DESC      │
│                                    [▶ Run]   │
├─────────────────────────────────────────────┤
│ [Output]                                     │
│  pestType  │ total_revenue                   │
│  termite   │ Rp 15.000.000                   │
│  cockroach │ Rp  8.500.000                   │
└─────────────────────────────────────────────┘
```

Cell types: Markdown, SQL, JavaScript

### Actions (`/actions`)
Execute business actions dengan form parameter:

**Contoh: Complete Service Job**
```
┌─────────────────────────────┐
│ complete-service-job         │
│                              │
│ Job ID:     [JOB-003    ]   │
│ Product ID: [PRD-001    ]   │
│ Quantity:   [2           ]  │
│                              │
│           [Execute Action]   │
│                              │
│ ✓ Job completed             │
│ ✓ Stock deducted (-2 units) │
│ ✓ Invoice generated (11% tax)│
│ ✓ Technician job count -1   │
└─────────────────────────────┘
```

4 action types tersedia:
1. `complete-service-job` — selesaikan job, kurangi stok, buat invoice
2. `schedule-new-job` — jadwalkan job baru, assign teknisi
3. `assign-technician` — reassign teknisi ke job lain
4. `reorder-product` — tambah stok produk

---

## Fitur Automation

### Monitors (`/monitors`)
Buat trigger otomatis:

**Trigger types:**
- Schedule (cron / interval) — contoh: "setiap hari jam 8 pagi"
- Event — contoh: "ketika stock di bawah minimum"

**Effects:**
- Execute action
- Update objects
- Send notification

### Webhooks (`/webhooks`)
Kirim event ke external system:

```
Name:   stock-alert-webhook
URL:    https://hooks.slack.com/services/...
Events: [object.updated, action.executed]
Secret: ********
Status: ACTIVE
```

Fitur: delivery history, retry otomatis, pause/resume

---

## Fitur Admin

### User Management (`/admin/users`)
```
│ Username  │ First Name │ Last Name │ Email              │ Actions │
├───────────┼────────────┼───────────┼────────────────────┼─────────┤
│ admin     │ Admin      │ User      │ admin@openfoundry  │ [Edit]  │
│ developer │ Dev        │ User      │ dev@openfoundry    │ [Edit]  │
│ analyst   │ Analyst    │ User      │ analyst@openfoundry│ [Edit]  │

[+ Create User]
```

### Audit Log (`/admin/audit`)
Semua aktivitas tercatat:

```
Filters: Action [All ▼]  User [All ▼]  From [____]  To [____]

│ Time     │ User  │ Action │ Resource     │ RID              │
├──────────┼───────┼────────┼──────────────┼──────────────────┤
│ 10:05:23 │ admin │ CREATE │ Customer     │ ri.objects.main..│
│ 10:04:15 │ admin │ UPDATE │ ServiceJob   │ ri.objects.main..│
│ 10:03:00 │ admin │ EXECUTE│ complete-job │ ri.actions.main..│
```

---

## AIP Chat (AI Assistant)

**URL:** http://localhost:3000/aip

Chat AI yang memahami data bisnis Anda:

```
┌─────────────────────────────────────────────┐
│ 🤖 AIP Chat    Ontology: [pest-control ▼]   │
├─────────────────────────────────────────────┤
│                                              │
│ You: Berapa total revenue bulan ini?         │
│                                              │
│ AI: Berdasarkan data ServiceJob yang sudah   │
│ completed bulan ini:                         │
│                                              │
│ │ Pest Type  │ Jobs │ Revenue      │        │
│ ├────────────┼──────┼──────────────┤        │
│ │ Termite    │  3   │ Rp 15.000.000│        │
│ │ Cockroach  │  2   │ Rp  8.500.000│        │
│ │ Rodent     │  2   │ Rp  6.000.000│        │
│ │ Total      │  7   │ Rp 29.500.000│        │
│                                              │
│ You: Teknisi mana yang paling produktif?     │
│                                              │
│ AI: Dedi memiliki rating tertinggi (★★★★★)  │
│ dengan 3 job completed bulan ini...          │
│                                              │
│ [Type a message...                ] [Send]   │
└─────────────────────────────────────────────┘
```

AI memahami seluruh ontology — object types, properties, relationships, dan business actions.

---

## Workflow Umum

### 1. Cek Operasional Pagi
```
Login → Pest Control Dashboard → cek:
  ✓ Ada berapa job hari ini?
  ✓ Stok produk aman?
  ✓ Teknisi siapa yang available?
```

### 2. Selesaikan Job
```
Actions → complete-service-job → isi Job ID + Product ID + Quantity
→ Otomatis: stok berkurang, invoice terbit, teknisi freed up
```

### 3. Analisis Data
```
Object Explorer → tab Aggregation
→ Group by: pestType, Metric: sum(amountCharged)
→ Lihat revenue per tipe hama
```

### 4. Import Data Baru
```
Data Connection → Upload CSV
→ Map kolom ke Customer properties
→ Import → data langsung muncul di Object Explorer
```

### 5. Buat Dashboard Kustom
```
Workshop → pilih template "Inventory Management"
→ Customize widgets → Save
→ Dashboard baru siap pakai
```

---

## Panduan Deploy untuk Client

### Setup Client Baru (15 menit)

```bash
# 1. Di VPS
git clone <repo> && cd openfoundry
docker compose up --build -d

# 2. Buat admin
bash scripts/bootstrap-admin.sh

# 3. Seed data industri
ORG_RID=<dari_step_2> bash scripts/demo/seed-pest-control.sh

# 4. Setup backup harian
DATABASE_URL=postgresql://openfoundry:openfoundry@localhost:5432/openfoundry \
  bash scripts/backup.sh --install-cron

# 5. Client login di http://<ip>:3000
```

### Ganti Industri
```bash
# Healthcare
ORG_RID=<org> bash scripts/demo/seed-healthcare.sh

# Logistics
ORG_RID=<org> bash scripts/demo/seed-logistics.sh

# Manufacturing
ORG_RID=<org> bash scripts/demo/seed-manufacturing.sh
```

### Multi-Tenant (Banyak Client di 1 VPS)
Setiap client = 1 organization. Data terisolasi total via Postgres RLS.
```bash
# Client 1
bash scripts/bootstrap-admin.sh --username admin-jkt --password ... --org "PT Jakarta"
ORG_RID=<org1> bash scripts/demo/seed-pest-control.sh

# Client 2
bash scripts/bootstrap-admin.sh --username admin-sby --password ... --org "PT Surabaya"
ORG_RID=<org2> bash scripts/demo/seed-pest-control.sh

# Client 1 TIDAK BISA lihat data Client 2. Guaranteed by database.
```

---

## API Reference

### Authentication
```
POST /api/v2/auth/signup              Daftar user baru + buat org
POST /multipass/api/auth/login        Login (dev mode)
POST /multipass/api/oauth2/token      OAuth2 token
GET  /multipass/api/auth/me           Info user saat ini
GET  /api/v2/admin/users/getCurrent   Info user (Palantir SDK compat)
```

### Ontologies
```
GET  /api/v2/ontologies                          List semua ontology
GET  /api/v2/ontologies/:rid                     Detail ontology
GET  /api/v2/ontologies/:rid/objectTypes          List object types
GET  /api/v2/ontologies/:rid/objectTypes/:name    Detail object type
GET  /api/v2/ontologies/:rid/linkTypes            List link types
GET  /api/v2/ontologies/:rid/actionTypes          List action types
```

### Objects
```
GET  /api/v2/ontologies/:rid/objects/:type              List objects
GET  /api/v2/ontologies/:rid/objects/:type/:pk           Get object
POST /api/v2/ontologies/:rid/objects/:type               Create object
PUT  /api/v2/ontologies/:rid/objects/:type/:pk           Update object
POST /api/v2/ontologies/:rid/objectSets/loadObjects      Query (ObjectSet)
POST /api/v2/ontologies/:rid/objectSets/aggregate        Aggregation
GET  /api/v2/ontologies/:rid/objects/:type/:pk/links/:lt Linked objects
```

### Actions
```
GET  /api/v2/ontologies/:rid/actionTypes                 List actions
POST /api/v2/ontologies/:rid/actions/:action/apply       Execute action
POST /api/v2/ontologies/:rid/actions/:action/validate    Validate action
```

### Datasets
```
GET  /api/v2/datasets                  List datasets
POST /api/v2/datasets                  Create dataset
GET  /api/v2/datasets/:rid             Detail dataset
GET  /api/v2/datasets/:rid/branches    List branches
```

### Functions
```
GET  /api/v2/functions                         List functions
POST /api/v2/functions/:apiName/execute        Execute function
```

### AIP Chat
```
POST /api/v2/aip/chat                 Multi-turn chat
GET  /api/v2/aip/agents               List AI agents
```

### Admin
```
GET  /api/v2/admin/stats              Dashboard statistics
GET  /api/v2/admin/users              List users
POST /api/v2/admin/users              Create user
PUT  /api/v2/admin/users/:id          Update user
GET  /api/v2/admin/groups             List groups
POST /api/v2/admin/groups             Create group
GET  /api/v2/admin/audit              Audit log (filtered)
```

### Health & Monitoring
```
GET  /status/health                   Health check
GET  /status/liveness                 Kubernetes liveness probe
GET  /status/readiness                Kubernetes readiness probe
GET  /status/alerts                   Alert system health
POST /status/alerts/heartbeat         Alert cron heartbeat
```

---

## Arsitektur

```
                          ┌──────────────────┐
                          │   app-console    │  React + Vite
                          │   localhost:3000  │  26 halaman
                          └────────┬─────────┘
                                   │
                          ┌────────┴─────────┐
                          │   svc-gateway    │  API gateway + auth
                          │   localhost:8080  │  Rate limit per-tenant
                          └────────┬─────────┘
                                   │
         ┌──────────┬─────────┬────┴────┬─────────┬──────────┐
         │          │         │         │         │          │
   ┌─────┴──┐ ┌────┴───┐ ┌───┴────┐ ┌──┴─────┐ ┌┴──────┐ ┌┴────────┐
   │multipass│ │ontology│ │objects │ │actions │ │datasets│ │  admin  │
   │  :8084  │ │ :8081  │ │ :8082  │ │ :8083  │ │ :8085  │ │ :8087   │
   └─────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └─────────┘
                                                      │
                                          ┌───────────┴───────────┐
                                          │    PostgreSQL 16       │
                                          │  RLS tenant isolation  │
                                          │  30+ tables + indexes  │
                                          └───────────────────────┘
```

---

*OpenFoundry — memberi value kelas Palantir ke UKM.*
