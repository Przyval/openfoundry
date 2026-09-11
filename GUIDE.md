# OpenFoundry - Panduan Pengguna

> Platform intelijen operasional kelas Palantir untuk UKM Indonesia.
> Console: http://localhost:3000 · Gateway: http://localhost:8080

Panduan ini menjelaskan produk seperti adanya hari ini.
Setiap perintah di sini dijalankan ulang saat panduan ditulis; yang tidak bisa dijalankan di lingkungan penulis diberi tanda eksplisit.
Bagian [Batasan yang Diketahui](#batasan-yang-diketahui) mencatat apa yang belum berfungsi, supaya Anda tidak mengejar masalah yang memang belum dikerjakan.

---

## Daftar Isi

1. [Quick Start](#quick-start)
2. [Layanan yang Tidak Dinyalakan start.sh](#layanan-yang-tidak-dinyalakan-startsh)
3. [Login dan Autentikasi](#login-dan-autentikasi)
4. [Dashboard Utama](#dashboard-utama)
5. [Dashboard Sanocare (Live)](#dashboard-sanocare-live)
6. [Sinkronisasi Kelava](#sinkronisasi-kelava)
7. [Navigasi dan Menu](#navigasi-dan-menu)
8. [Fitur Data](#fitur-data)
9. [Fitur Build](#fitur-build)
10. [Fitur Automation](#fitur-automation)
11. [Fitur Admin](#fitur-admin)
12. [AIP Chat](#aip-chat)
13. [Mengganti Data Demo Industri](#mengganti-data-demo-industri)
14. [Panduan Deploy untuk Client](#panduan-deploy-untuk-client)
15. [API Reference](#api-reference)
16. [Arsitektur](#arsitektur)
17. [Batasan yang Diketahui](#batasan-yang-diketahui)

---

## Quick Start

```bash
git clone <repo> && cd openfoundry
pnpm install
bash start.sh
open http://localhost:3000
```

`start.sh` menyalakan sepuluh layanan backend lalu konsol di port 3000.
Urutannya: svc-ontology, svc-objects, svc-multipass, svc-admin, svc-actions, svc-datasets, svc-functions, svc-aip, svc-sentinel, svc-gateway.

Sebelum menyalakan apa pun, skrip itu **mematikan proses apa pun** yang memegang port 8080-8088, 8092, dan 3000.
Pastikan port-port itu memang milik Anda sebelum menjalankannya; kalau ada container atau aplikasi lain di sana, ia akan dimatikan tanpa bertanya.

Setelah layanan hidup, `start.sh` menyemai data demo pest control dari `scripts/demo/seed-pest-control.sh`.
Hasil semaian itu: 1 ontologi, 7 object type, 8 link type, 4 action type, dan 47 objek (8 customer, 5 teknisi, 8 job, 8 produk, 6 invoice, 4 kendaraan, 8 jadwal), plus 5 pipeline, 5 dataset, dan 3 function.

Flag yang tersedia:

| Flag | Arti |
|------|------|
| `--reseed` | Hapus data tersimpan lalu semai ulang |
| `--industry <nama>` | Pilih `pest-control`, `healthcare`, `logistics`, `manufacturing`, atau `all` |

Tanpa `DATABASE_URL`, semua layanan memakai penyimpanan in-memory atau berkas di `/tmp/openfoundry-data`.
Itulah mode yang demo ini dirancang untuknya.
`/tmp/openfoundry-data` adalah jalur tetap tanpa override lewat env, jadi dua checkout yang jalan bersamaan akan saling menimpa datanya.

> `bash start.sh` sendiri tidak dijalankan saat panduan ini ditulis, karena port 3000 di mesin penulis dipegang proses lain dan skrip itu akan mematikannya.
> Yang dijalankan adalah isinya: kesepuluh layanan dinyalakan satu per satu, penyemaian dijalankan, dan setiap perintah serta endpoint di panduan ini diuji terhadap tumpukan itu.

---

## Layanan yang Tidak Dinyalakan start.sh

Tiga layanan tidak ada di daftar `start.sh`: **svc-compass**, **svc-webhooks**, dan **svc-media**.
Selama ketiganya mati, gateway menjawab 502 untuk `/api/v2/compass/*`, `/api/v2/webhooks*`, dan `/api/v2/media*`.
Akibatnya halaman Compass menggantung di spinner dan halaman Webhooks tidak bisa memuat apa pun.

Nyalakan sendiri kalau Anda butuh halaman-halaman itu:

```bash
pnpm --filter @openfoundry/svc-compass  run dev &
pnpm --filter @openfoundry/svc-webhooks run dev &
pnpm --filter @openfoundry/svc-media    run dev &
```

Setelah ketiganya hidup, ketiga endpoint tadi menjawab 200 dan halamannya berfungsi.

svc-sentinel memang dinyalakan `start.sh`, tetapi ia mendengar di port 8091 sementara skrip itu hanya memeriksa 8080-8088 dan 8092.
Jadi baris status "Service status" tidak pernah menyebut svc-sentinel, hidup maupun mati.

---

## Login dan Autentikasi

### Mode pengembangan

Buka konsol, lalu isi form "Developer login form".
Tiga akun pengembangan didefinisikan pada konstanta `DEV_USERS` di `services/svc-multipass/src/routes/auth.ts`, masing-masing dengan peran ADMIN, EDITOR, dan VIEWER.
Baca nilainya langsung dari berkas itu; panduan ini sengaja tidak menyalin kredensial ke dalam repositori publik.

Ketiga akun itu hanya ada selama `NODE_ENV` bukan `production`.
Begitu `NODE_ENV=production`, `DEV_USERS` menjadi kosong dan form itu tidak bisa dipakai lagi.

### Token OAuth2

```bash
curl -X POST http://localhost:8080/multipass/api/oauth2/token \
  -d "grant_type=client_credentials&client_id=<id>&client_secret=<secret>"
```

Kredensial yang salah dijawab 400.
Respons berhasil memuat `access_token` berupa JWT ES256 dengan klaim `sub`, `org`, dan `scope`.

### Membuat admin pertama di produksi

`scripts/bootstrap-admin.sh` memanggil `POST /api/v2/auth/signup`.
Endpoint itu **tertutup secara default** dan menjawab 403 dengan nama galat `OpenSignupDisabled`.

Perhatikan letak variabelnya - ini sumber kebingungan yang paling sering:

```bash
# SALAH: variabel hanya diberikan ke skripnya, bukan ke layanannya.
# Signup tetap tertutup dan skrip berhenti dengan 403.
OPENFOUNDRY_ALLOW_OPEN_SIGNUP=1 bash scripts/bootstrap-admin.sh --username ...
```

`OPENFOUNDRY_ALLOW_OPEN_SIGNUP` dibaca oleh **svc-multipass dan gateway saat keduanya start**, bukan oleh skripnya.
Jadi nyalakan variabel itu di lingkungan kedua layanan tersebut, start ulang keduanya, lalu jalankan skripnya:

```bash
# Nyalakan pada kedua layanan, lalu start ulang keduanya.
OPENFOUNDRY_ALLOW_OPEN_SIGNUP=1 pnpm --filter @openfoundry/svc-multipass run dev &
OPENFOUNDRY_ALLOW_OPEN_SIGNUP=1 pnpm --filter @openfoundry/svc-gateway   run dev &

bash scripts/bootstrap-admin.sh \
  --username <username> \
  --password <password-aman> \
  --org "Nama Perusahaan"
```

Skrip mencetak `Org RID` yang dibuat.
Selama switch itu menyala, siapa pun yang bisa menjangkau gateway dapat menerbitkan token API yang sah, jadi matikan lagi dan start ulang kedua layanan begitu admin pertama jadi.

### Apa yang belum ditegakkan

Gateway **belum** menolak permintaan tanpa token.
Ini diverifikasi langsung: dengan `AUTH_PUBLIC_KEY` terisi sekalipun, `GET /api/v2/ontologies` tanpa header `Authorization` tetap dijawab 200, begitu juga dengan token karangan.
Penyebabnya ada di `services/svc-gateway/src/server.ts`: `authPlugin` didaftarkan lewat `app.register` tanpa `fastify-plugin`, sehingga hook `onRequest`-nya terkurung di dalam plugin itu dan tidak berlaku untuk satu rute pun.

Konsekuensinya:

- `request.claims` tidak pernah terisi, jadi tidak ada pemeriksaan izin berbasis token yang benar-benar berjalan.
- Pembatasan laju (rate limit) yang seharusnya per-tenant jatuh kembali ke kunci per-token atau per-IP, karena kunci per-org diambil dari klaim yang tidak pernah ada.
- `ENFORCE_PERMISSIONS=true` membuat setiap rute yang lewat gateway menjawab 403, karena hook izin tidak menemukan `x-user-id` maupun `request.claims`.

Gateway **memang** membuang setiap header `x-user-*` yang dikirim klien sebelum meneruskan permintaan ke layanan hilir.
Itu menutup jalan bagi pemanggil untuk mengarang perannya sendiri.
Yang dihapus adalah penegakan palsu, bukan penegakan yang bekerja; penegakan sungguhan menunggu hop tepercaya yang mengisi header itu dari token tervalidasi.

Perlakukan port layanan (8081-8092) sebagai jaringan internal.
Skrip penyemai dan sinkronisasi bicara langsung ke port-port itu, jadi pembuangan header di gateway tidak menjangkau mereka.

---

## Dashboard Utama

**URL:** `/` (halaman pertama setelah login)

Delapan kartu statistik, masing-masing bisa diklik menuju halamannya: Ontologies, Object Types, Objects, Users, Groups, Datasets, Functions, Actions.

Di bawahnya ada dua panel:

- **Recent Activity** dengan kolom Timestamp, User, Action, dan Resource.
- **Quick Actions** dengan lima tombol: Create Ontology, Upload Dataset, Manage Users, Manage Groups, dan View Audit Log.

Kartu **Actions** dan **Groups** menunjukkan 0 pada data demo bawaan.
Keduanya menghitung entitas lain dari yang Anda kira: Actions menghitung registrasi action, bukan action type dalam ontologi, dan tidak ada grup yang disemai.
Empat action type pest control tetap ada dan tetap bisa dijalankan dari halaman Actions.

Bilah atas memuat pintasan (Ontology, Objects, Datasets, Actions, Functions, Admin), kotak "Search everything...", dan tombol mode gelap.
Kotak pencarian itu memakai `GET /api/v2/search`, yang memerlukan Postgres; tanpa `DATABASE_URL` ia menjawab 500 dan tidak mengembalikan hasil apa pun.

---

## Dashboard Sanocare (Live)

**URL:** `/sanocare` · menu sidebar: **Sanocare (Live)**

Dashboard operasional harian yang membaca data Safe and Care (Kelava ERP) setelah disinkronkan ke ontologi.
Halaman ini menggantikan dashboard pest control lama yang memakai data demo.

Halaman lama tidak dihapus.
Berkasnya masih ada di `apps/app-console/src/pages/PestControlDashboard.tsx` sebagai arsip, tetapi sudah tidak diimpor dan rute `/pest-control` sudah dicabut dari `routes.tsx`.
Membuka `/pest-control` sekarang menampilkan halaman kosong, bukan pesan 404, karena konsol belum punya rute penampung.

Sumber datanya adalah ontologi dengan `apiName` `sanocare-kelava`.
Kalau ontologi itu belum ada, halaman hanya menampilkan `Sanocare Kelava ontology not found. Run sync-kelava.sh first.`
Data disegarkan otomatis setiap 5 menit.

**Lima kartu KPI di baris atas:**

| Kartu | Isi |
|-------|-----|
| Customers | Jumlah objek `KelavaCustomer` |
| Road Plans | Jumlah objek `KelavaRoadPlan` |
| Visits | Jumlah objek `KelavaVisit` |
| Avg Completion | Rata-rata `completionRate` teknisi bulan berjalan |
| Critical Flags | Jumlah `KelavaFlag` severity `critical` yang belum resolved |

**Technician Performance** menampilkan 10 teknisi teratas bulan berjalan berdasarkan jumlah kunjungan selesai: nama, segment, completed/planned, completion rate, dan grade A/B/C/D, ditutup sebaris ringkasan distribusi grade.
**Unresolved Flags** menampilkan maksimal 15 tanda verifikasi yang belum diselesaikan: tipe, severity, detail, dan drift dalam meter.
**Recent Road Plans** menampilkan 15 rencana kunjungan terbaru: tanggal, judul, tipe, dan status (Terjadwal / Berjalan / Selesai).

---

## Sinkronisasi Kelava

`scripts/sync-kelava.sh` menarik data operasional Sanocare dari Postgres Kelava ke dalam ontologi `sanocare-kelava`.
Ia membuat 8 object type (`KelavaCustomer`, `KelavaTechnician`, `KelavaRoadPlan`, `KelavaVisit`, `KelavaKPI`, `KelavaSchedule`, `KelavaFlag`, `KelavaServiceArea`) dan 8 link type di antaranya.

### Kredensial

Skrip ini membaca `.env` di akar repositori.
Kunci yang dibutuhkan terdaftar di `.env.example` pada bagian *Sanocare / Kelava sync*: `KELAVA_HOST`, `KELAVA_PORT`, `KELAVA_DB`, `KELAVA_USER`, `KELAVA_PASS`, `TUNNEL_DB_HOST`, dan `TUNNEL_JUMP_HOST`.

Alamat infrastruktur dan kata sandinya **tidak** ada di repositori ini dan tidak boleh pernah masuk ke sini.
Salin `.env.example` menjadi `.env`, isi nilainya dari sumber internal Anda, dan biarkan `.env` tetap gitignored.

Tanpa `KELAVA_PASS`, skrip berhenti sebelum melakukan apa pun dengan pesan
`KELAVA_PASS: ERROR: KELAVA_PASS not set. Add to .env or export KELAVA_PASS`.

### Menjalankan

```bash
# 1. Buka terowongan SSH ke Postgres Kelava.
#    Host dan jump host diambil dari .env (TUNNEL_DB_HOST, TUNNEL_JUMP_HOST).
ssh -f -N -L "${KELAVA_PORT}:${TUNNEL_DB_HOST}:5432" "root@${TUNNEL_JUMP_HOST}"

# 2. Sinkronisasi penuh.
bash scripts/sync-kelava.sh

# Hanya 30 hari terakhir:
bash scripts/sync-kelava.sh --recent
```

Kalau terowongan mati, skrip gagal cepat dan mencetak perintah untuk menyalakannya kembali.

`scripts/sync-kelava-incremental.sh` menarik hanya rekaman baru atau berubah dan dirancang untuk cron tiap 15 menit; ia menerima `--install-cron`.

`scripts/seed-kelava-alerts.sh` membuat lima monitor operasional lewat gateway: Technician Low Performance, GPS Drift Alert, Technician Over-Quota, Low Active Days, dan Missing Photo Evidence.
Skrip ini berjalan tanpa kredensial Kelava karena hanya bicara ke svc-sentinel, dan monitor yang dihasilkannya memang punya effect - berbeda dari monitor yang dibuat lewat konsol.

> Belum diuji di lingkungan penulisan panduan ini: ketiga skrip Kelava di atas butuh terowongan SSH dan kredensial basis data langsung ke sistem Sanocare.
> Yang sudah diverifikasi hanya `seed-kelava-alerts.sh` (berhasil membuat lima monitor) dan perilaku gagal-cepat `sync-kelava.sh` saat `KELAVA_PASS` kosong.

---

## Navigasi dan Menu

Sidebar kiri berisi 24 entri dalam 5 section.

### Platform
| Menu | URL | Fungsi |
|------|-----|--------|
| Dashboard | `/` | Statistik platform dan aktivitas terbaru |
| Sanocare (Live) | `/sanocare` | Dashboard operasional harian (data Kelava) |
| AIP Chat | `/aip` | Tanya jawab bahasa alami tentang data ontologi |
| Compass | `/compass` | Pohon resource (space, project, ontology, dataset) |
| Notifications | `/notifications` | Pusat notifikasi |

### Data
| Menu | URL | Fungsi |
|------|-----|--------|
| Ontology | `/ontology` | Definisi object type dan link type |
| Object Explorer | `/objects` | Telusuri, filter, dan urutkan objek |
| Network Graph | `/graph` | Visualisasi force-directed objek dan relasinya |
| Contour | `/contour` | Rantai langkah analisis interaktif |
| Data Lineage | `/lineage` | Alur data source, transform, target |
| Data Health | `/data-health` | Skor kualitas data per object type |
| Datasets | `/datasets` | Daftar dataset dan branch-nya |
| Data Connection | `/data-connection` | Galeri konektor dan impor berkas |
| Pipelines | `/pipelines` | Pipeline ETL multi-langkah |

### Build
| Menu | URL | Fungsi |
|------|-----|--------|
| Workshop | `/workshop` | Pembangun dashboard berbasis widget |
| Code Workbook | `/workbook` | Notebook Markdown, SQL, dan JavaScript |
| Scenarios | `/scenarios` | Analisis what-if di atas salinan data |
| Actions | `/actions` | Jalankan business action dengan form parameter |
| Functions | `/functions` | Daftar dan jalankan function |

### Automation
| Menu | URL | Fungsi |
|------|-----|--------|
| Monitors | `/monitors` | Trigger terjadwal atau berbasis event |
| Webhooks | `/webhooks` | Webhook keluar ke sistem eksternal |

### Admin
| Menu | URL | Fungsi |
|------|-----|--------|
| Users | `/admin/users` | Manajemen pengguna |
| Groups | `/admin/groups` | Manajemen grup dan anggotanya |
| Audit Log | `/admin/audit` | Catatan aktivitas (butuh `DATABASE_URL`) |

Dua rute tidak punya entri sidebar dan hanya dicapai dari halaman lain: `/ontology/:ontologyRid/objects/:objectType` (Object Browser) dan `/workshop/edit` (Workshop Editor).

---

## Fitur Data

### Object Explorer (`/objects`)

Halaman ini bukan kumpulan tab bernama Browse/Filters/Aggregation/Links.
Susunannya: pemilih ontologi di atas, daftar object type sebagai tab vertikal di kiri (masing-masing dengan jumlah objeknya), dan area data di kanan.

Kontrol di area data:

| Kontrol | Fungsi |
|---------|--------|
| Quick filter | Menyaring baris yang sedang tampil, di sisi klien |
| Server search | Pencarian teks penuh, dikirim ke layanan |
| Sort by + ASC/DESC | Urutkan berdasarkan satu properti |
| Add Filter | Menambah aturan filter, lalu **Apply Filters** |
| Export JSON | Unduh objek yang tampil |

Operator filter yang tersedia: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `isNull`.

Klik satu baris untuk membuka detailnya: daftar **Properties**, lalu bagian **Linked Objects** yang memuat objek terkait per link type.

Halaman ini bermaksud memunculkan satu baris ringkasan agregat di atas tabel, tetapi baris itu belum bisa dipakai.
Ia hanya muncul ketika object type punya properti numerik yang dideklarasikan dengan tipe huruf besar (`INTEGER`, `DOUBLE`, `FLOAT`, `LONG`), dan ketika muncul ia hanya menampilkan `type: COUNT` dan `value: <n>` alih-alih ringkasan count, avg, dan sum.
Keempat skrip demo di `scripts/demo/` mendeklarasikan tipenya dengan huruf kecil (`"type":"integer"`), jadi untuk data demo baris itu tidak muncul sama sekali.

Untuk agregasi yang sungguhan, pakai halaman Contour atau API `POST /api/v2/ontologies/:rid/objectSets/aggregate`, yang keduanya berfungsi penuh.

### Network Graph (`/graph`)

Node adalah objek, diwarnai per object type, dengan panel jumlah per tipe di kiri.

Halaman ini **belum menggambar satu edge pun**, meski link type dan link instance-nya ada.
Lihat [Batasan yang Diketahui](#batasan-yang-diketahui).

### Contour (`/contour`)

Contour adalah rantai langkah analisis, bukan papan-papan yang berdiri sendiri.
Pilih ontologi dan object type, lalu tambahkan langkah; setiap langkah bekerja di atas keluaran langkah sebelumnya.

Lima tipe langkah: **Table**, **Filter**, **Group By**, **Aggregate**, dan **Chart**.

### Data Lineage (`/lineage`)

Graf berlabel Source, Transform, Object Type, dan Application, dengan legenda dan jumlah node per kategori.

### Data Health (`/data-health`)

Skor kesehatan keseluruhan plus rincian per object type.
Tiga dimensi yang dihitung: **completeness** (kelengkapan nilai properti), **consistency** (referensi antar objek yang masih valid), dan **uniqueness** (primary key yang tidak duplikat).
Tiap dimensi diberi status pass / warn / fail beserta dampaknya.

### Data Connection (`/data-connection`)

Halaman ini membuka **Connector Gallery** berisi delapan konektor.
Hanya dua yang berfungsi, dan keduanya ditandai lencana **Functional**: **CSV File Upload** dan **JSON File Upload**.

REST API, PostgreSQL, dan MySQL tampil dengan status *Available* tetapi belum mengimpor apa pun.
Google Sheets, Salesforce, dan SAP ditandai *Coming Soon*.

Wizard impor berkas punya lima langkah: upload, preview, mapping kolom ke properti object type, importing, dan done.

### Datasets (`/datasets`)

Tabel dataset dengan kolom Name, RID, dan Parent Folder.
Branch dataset dikelola lewat API (`/api/v2/datasets/:rid/branches`).

---

## Fitur Build

### Workshop (`/workshop`)

Pembangun dashboard berbasis widget, tanpa menulis kode.

Palet widget berisi delapan jenis: KPI Card, Data Table, Bar Chart, Pie Chart, Status List, Action Button, Filter Bar, dan Text / Header.

Empat template siap pakai: **Pest Control Operations Center**, **Customer 360 View**, **Technician Performance Dashboard**, dan **Inventory Management**.
Keempatnya dirancang di atas object type pest control, jadi template itu kosong kalau ontologi yang aktif bukan pest control.

### Code Workbook (`/workbook`)

Notebook bergaya Jupyter dengan tiga jenis sel: **Markdown**, **SQL**, dan **JavaScript**.
Sel dieksekusi terhadap ontologi terpilih lewat API objek.

### Scenarios (`/scenarios`)

Analisis what-if: buat salinan data, ubah objeknya tanpa menyentuh produksi, lalu bandingkan hasilnya berdampingan.

Empat template bawaan: Expand to Surabaya, Price Increase 15%, Peak Season Prep, dan Custom Scenario.
Keempatnya menghitung dampaknya terhadap KPI pest control.

Halaman ini hanya membaca ontologi yang nama atau `apiName`-nya mengandung "pest".
Kalau tidak ada, ia diam-diam beralih ke data contoh yang ditulis langsung di dalam kode (`C001 PT Maju Sejahtera`, `T001 Budi Santoso`, dan seterusnya) tanpa memberi tahu Anda.
Jadi kalau ontologi yang aktif bukan pest control, angka di halaman ini bukan angka Anda.

Halaman ini juga tidak menyimpan apa pun ke belakang layar: skenario hilang saat halaman ditinggalkan.
Tidak ada branch ontologi di produk ini; setiap `branch` di repositori ini adalah branch **dataset**.

### Actions (`/actions`)

Setiap action type ditampilkan beserta status, jumlah parameter, dan deskripsinya, dengan form parameter untuk menjalankannya.

Empat action type pada data demo pest control:

| Action | Parameter wajib | Parameter opsional |
|--------|-----------------|--------------------|
| `complete-service-job` | `jobId`, `treatmentUsed`, `technicianNotes`, `customerRating` | `productId`, `quantityUsed` |
| `schedule-new-job` | `customerId`, `technicianId`, `serviceType`, `pestType`, `scheduledDate`, `priority`, `address` | - |
| `assign-technician` | `jobId`, `technicianId` | `vehicleId` |
| `reorder-product` | `productId`, `quantity` | `supplier` |

Menjalankan `complete-service-job` menandai job selesai, mengurangi stok produk, mengurangi jumlah job aktif teknisi, dan menerbitkan invoice dengan pajak 11 persen.

Action ini menurunkan nomor invoice dari nomor job (`JOB-2026-003` menjadi `INV-2026-003`), sedangkan semaian menomori invoice-nya sendiri tanpa mengikuti nomor job.
Akibatnya sebagian besar job bentrok dengan invoice yang sudah ada dan action menjawab 500 yang membungkus 409 dari layanan objek.
Pada data demo pest control yang baru disemai, satu-satunya job yang bisa diselesaikan adalah `JOB-2026-008`.

Kirim parameter tidak lengkap dan action menjawab 400 dengan daftar `REQUIRED_PARAMETER_MISSING` per parameter.
`POST .../validate` mengembalikan daftar yang sama dengan status 200 dan `valid: false`, jadi pakai itu untuk memeriksa form sebelum apply.

---

## Fitur Automation

### Monitors (`/monitors`)

Dialog **Create Monitor** meminta Name, Description, Trigger Type, dan - untuk trigger terjadwal - ekspresi cron.
Tiga trigger type: **Schedule (Cron)**, **Event**, dan **Condition**.

Monitor yang dibuat dari konsol selalu lahir **tanpa effect**, dan detailnya menampilkan "No effects configured."
Konsol belum punya UI untuk menambah effect, jadi monitor buatan konsol tidak melakukan apa-apa saat trigger-nya berbunyi.

Monitor yang punya effect dibuat lewat API, dan `scripts/seed-kelava-alerts.sh` adalah contoh yang bisa dijalankan.
Scheduler svc-sentinel berjalan tiap 60 detik.

### Webhooks (`/webhooks`)

Daftar webhook beserta riwayat pengiriman terakhirnya, dan tombol untuk menjeda atau mengaktifkan kembali sebuah webhook (ACTIVE / PAUSED).

Halaman ini butuh svc-webhooks hidup; lihat [Layanan yang Tidak Dinyalakan start.sh](#layanan-yang-tidak-dinyalakan-startsh).
Perhatikan bahwa ia tidak membedakan layanan yang mati dari daftar yang memang kosong: keduanya ditampilkan sebagai "No webhooks configured".
Kalau ragu, periksa `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/v2/webhooks`; 502 berarti layanannya belum jalan.

---

## Fitur Admin

### Users (`/admin/users`)

Tabel dengan kolom Username, First Name, Last Name, dan Email.
Pada mode demo, First Name dan Last Name tampil sebagai `-` karena akun pengembangan tidak menyimpan nama depan dan belakang.

### Groups (`/admin/groups`)

Manajemen grup dan anggotanya.
Data demo tidak menyemai grup apa pun, jadi halaman ini dimulai dari "No groups found".

Dengan `DATABASE_URL` terpasang, svc-admin beralih ke `PgUserStore` / `PgGroupStore` yang asinkron.
Sebagian besar rute user dan grup belum menunggu hasil store itu dan menjawab 500 dalam mode tersebut; yang tetap bekerja adalah rute audit, `GET /admin/groups/:groupRid/members`, dan ketiga rute `groupMembers`.

### Audit Log (`/admin/audit`)

Catatan aktivitas dengan penyaring action, user, dan rentang tanggal.

Audit trail hanya terisi kalau layanan berjalan dengan `DATABASE_URL`.
Tanpa basis data - yaitu mode demo bawaan `bash start.sh` - tidak ada yang menulis entri, dan halaman ini jujur menyebutnya:
"Audit log unavailable. This deployment runs without a database, so no audit trail is recorded. Set DATABASE_URL and restart the services to collect and read audit entries."
Endpoint-nya mengembalikan `{"data": [], "available": false}`, bukan tabel kosong yang menyesatkan.

---

## AIP Chat

**URL:** `/aip`

Chat bahasa alami di atas ontologi terpilih.
AIP membaca object type, properti, relasi, dan action type, lalu menjawab dengan ringkasan atau tabel.

Penyedia LLM dideteksi otomatis dari environment, berurutan: `GLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, lalu `OLLAMA_URL`.
Kalau tidak satu pun diset, AIP memakai penyedia bawaan bernama `mock`, dan setiap balasan ditandai `"model": "mock-smart"`.

Mode mock menjawab dari perhitungan langsung atas data ontologi, bukan dari model bahasa.
Ia menangani sejumlah bentuk pertanyaan yang umum dan tidak lebih dari itu, jadi jangan menilai kualitas AIP dari mode ini.
`.env.example` mencantumkan kunci `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, dan `OLLAMA_URL`.

---

## Mengganti Data Demo Industri

Tersedia empat skrip demo di `scripts/demo/`: `seed-pest-control.sh`, `seed-healthcare.sh`, `seed-logistics.sh`, dan `seed-manufacturing.sh`.

**Gunakan `start.sh --industry`, bukan skripnya langsung:**

```bash
bash start.sh --industry healthcare
```

Alasannya penting.
Keempat skrip itu **memakai ulang ontologi pertama yang sudah ada** dan hanya membuat ontologi baru kalau belum ada satu pun.
Menjalankan `bash scripts/demo/seed-healthcare.sh` di atas data pest control tidak mengganti industri: ia menumpahkan object type healthcare ke dalam ontologi pest control, dan Object Explorer lalu menampilkan Customer dan Patient dan Shipment berdampingan dalam satu ontologi.

`start.sh --industry` menghapus `ontology-store.json`, `object-store.json`, dan `link-store.json` lebih dulu, lalu menyemai, sehingga hasilnya bersih.
Urutan itu diverifikasi langsung: setelah ketiga berkas dihapus dan layanan distart ulang, `seed-healthcare.sh` membuat ontologi `healthcare` sendiri alih-alih menumpang yang lama.
`--industry all` sengaja menyemai keempatnya ke dalam satu ontologi.

Keempat skrip itu juga **mengabaikan `ORG_RID`**.
Hanya `scripts/seed-common.sh` yang membacanya, dan tak satu pun dari keempat skrip demo memakai berkas itu.
Jadi `ORG_RID=<org> bash scripts/demo/seed-healthcare.sh` menyemai persis sama seperti tanpa `ORG_RID`.

---

## Panduan Deploy untuk Client

> Belum diuji di lingkungan penulisan panduan ini: langkah `docker compose` memerlukan build image penuh dan port 3000 serta 8080 yang bebas.
> Bacalah bersama catatan di bawah dan di [Batasan yang Diketahui](#batasan-yang-diketahui).

```bash
# 1. Di VPS
git clone <repo> && cd openfoundry
cp .env.example .env      # isi nilainya, terutama DATABASE_URL
docker compose up --build -d

# 2. Terapkan migrasi, termasuk org_rid dan row-level security
pnpm db:migrate

# 3. Buat admin pertama (lihat "Membuat admin pertama di produksi")
bash scripts/bootstrap-admin.sh --username <username> --org "Nama Client"

# 4. Semai data industri
bash scripts/demo/seed-pest-control.sh

# 5. Backup harian; DATABASE_URL diambil dari .env
bash scripts/backup.sh --install-cron
```

Catatan yang menentukan berhasil-tidaknya:

- `docker-compose.yml` menyalakan Postgres dengan satu kata sandi tetapi menyusun `DATABASE_URL` aplikasi dengan kata sandi yang berbeda.
  Samakan keduanya sebelum menjalankan, atau kontainer aplikasi tidak akan bisa masuk ke basis datanya.
- Compose memuat `scripts/migrate.sql` saat basis data pertama kali dibuat, sedangkan `pnpm db:migrate` menerapkan `db/migrations/*.sql`.
  Keduanya sudah berbeda: hanya yang kedua menambahkan `org_rid` dan row-level security.
  Jalankan langkah 2 di atas; tanpa itu, penyimpanan objek akan menulis kolom yang tidak ada di skema Compose.
- Compose hanya membuka port 3000 dan 8080 ke host.
  Port layanan 8081-8092 sengaja tidak diekspos, dan memang harus begitu.
- Kontainer aplikasi berjalan dengan `NODE_ENV=production`, jadi akun pengembangan mati dan langkah 3 wajib.

### Multi-tenant

Setiap client dimaksudkan sebagai satu organization, dengan isolasi lewat kolom `org_rid` dan kebijakan row-level security di `db/migrations/009_multi_tenancy.sql`.

Jangan menjanjikan isolasi itu kepada client sebelum Anda mengujinya sendiri pada deployment Anda.
Dalam mode demo bawaan tidak ada basis data sama sekali, sehingga tidak ada RLS.
Skrip demo di `scripts/demo/` tidak menandai data yang dibuatnya dengan organization mana pun.
Lihat juga catatan tentang nama setelan sesi RLS di [Batasan yang Diketahui](#batasan-yang-diketahui).

---

## API Reference

Dua versi API disajikan berdampingan dan **bukan** satu API di balik dua prefiks.
Bentuk kawatnya berbeda persis di tempat yang penting.

Contoh: `GET .../objects/Customer/CUST-001`

```jsonc
// v1 - properti dibungkus, tanpa objectType/primaryKey/timestamp
{ "properties": { ... }, "rid": "ri.phonograph2-objects.main.object...." }

// v2 - objek utuh dengan metadata
{ "rid": "...", "objectType": "Customer", "primaryKey": "CUST-001",
  "properties": { ... }, "createdAt": "...", "updatedAt": "..." }
```

Perbedaan lain: `Branch` v1 memakai `branchId` sementara v2 memakai `name`, `ObjectType.primaryKey` v1 berupa daftar, dan `contains` dalam grammar filter v1 menguji keanggotaan array sedangkan `contains` v2 menguji substring.

### Autentikasi
```
POST /api/v2/auth/signup              Daftar user baru + buat org
                                      (403 kecuali OPENFOUNDRY_ALLOW_OPEN_SIGNUP
                                       diset pada svc-multipass DAN gateway)
POST /multipass/api/auth/login        Login mode pengembangan
POST /multipass/api/oauth2/token      Token OAuth2
GET  /multipass/api/auth/me           Info user saat ini
GET  /api/v2/admin/users/getCurrent   Info user (kompatibel SDK Palantir)
```

`GET /api/v2/admin/users/getCurrent` menjawab 401 `Missing bearer token` tanpa header `Authorization`.
Itu pemeriksaan milik svc-multipass sendiri, bukan penegakan di gateway.

### Ontologi
```
GET  /api/v2/ontologies                                       List ontologi
GET  /api/v2/ontologies/:rid                                  Detail ontologi
GET  /api/v2/ontologies/:rid/fullMetadata                     Object type + link type sekaligus
GET  /api/v2/ontologies/:rid/objectTypes                      List object type
GET  /api/v2/ontologies/:rid/objectTypes/:name                Detail object type
GET  /api/v2/ontologies/:rid/objectTypes/:name/outgoingLinkTypes
GET  /api/v2/ontologies/:rid/linkTypes                        List link type
GET  /api/v2/ontologies/:rid/actionTypes                      List action type
```

### Objek
```
GET  /api/v2/ontologies/:rid/objects/:type                    List objek
GET  /api/v2/ontologies/:rid/objects/:type/:pk                Ambil satu objek
POST /api/v2/ontologies/:rid/objects/:type                    Buat objek (201)
PUT  /api/v2/ontologies/:rid/objects/:type/:pk                Perbarui objek
POST /api/v2/ontologies/:rid/objectSets/loadObjects           Query ObjectSet
POST /api/v2/ontologies/:rid/objectSets/aggregate             Agregasi
GET  /api/v2/ontologies/:rid/objects/:type/:pk/links/:lt      Objek terkait
```

`.../links/:lt` mengembalikan **objek di ujung seberang link**, dalam bentuk objek penuh.
Ia tidak mengembalikan deskripsi link (sumber dan tujuan); pemanggil sudah tahu sisi sumbernya dari URL.

### Action
```
GET  /api/v2/ontologies/:rid/actionTypes                      List action type
POST /api/v2/ontologies/:rid/actions/:action/apply            Jalankan action
POST /api/v2/ontologies/:rid/actions/:action/validate         Validasi parameter
```

### Dataset, Function, AIP, Admin, Status
```
GET  /api/v2/datasets                        List dataset
POST /api/v2/datasets                        Buat dataset (201)
GET  /api/v2/datasets/:rid                   Detail dataset
GET  /api/v2/datasets/:rid/branches          List branch dataset

GET  /api/v2/functions                       List function
POST /api/v2/functions/:apiName/execute      Jalankan function

POST /api/v2/aip/chat                        Chat multi-giliran
GET  /api/v2/aip/agents                      List agent AI

GET  /api/v2/admin/stats                     Statistik dashboard
GET  /api/v2/admin/users                     List user
POST /api/v2/admin/users                     Buat user
PUT  /api/v2/admin/users/:id                 Perbarui user
GET  /api/v2/admin/groups                    List grup
POST /api/v2/admin/groups                    Buat grup
GET  /api/v2/admin/groups/:id/groupMembers        List anggota grup
POST /api/v2/admin/groups/:id/groupMembers/add    Tambah anggota (principalIds)
POST /api/v2/admin/groups/:id/groupMembers/remove Hapus anggota (principalIds)
GET  /api/v2/admin/audit                     Audit log (butuh DATABASE_URL)

GET  /api/v2/search                          Pencarian lintas entitas (butuh Postgres)

GET  /status/health                          Health check
GET  /status/liveness                        Kubernetes liveness probe
GET  /status/readiness                       Kubernetes readiness probe
GET  /status/alerts                          Kesehatan sistem alert
POST /status/alerts/heartbeat                Heartbeat cron alert
```

### API v1

```
GET  /api/v1/ontologies                                       List ontologi
GET  /api/v1/ontologies/:rid                                  Detail ontologi
GET  /api/v1/ontologies/:rid/objectTypes                      List object type
GET  /api/v1/ontologies/:rid/objectTypes/:type                Detail object type
GET  /api/v1/ontologies/:rid/objectTypes/:type/outgoingLinkTypes
GET  /api/v1/ontologies/:rid/actionTypes                      List action type
GET  /api/v1/ontologies/:rid/actionTypes/:apiName             Detail action type
GET  /api/v1/ontologies/:rid/queryTypes                       List query type

GET  /api/v1/ontologies/:rid/objects/:type                    List objek
GET  /api/v1/ontologies/:rid/objects/:type/:pk                Ambil satu objek
GET  /api/v1/ontologies/:rid/objects/:type/:pk/links/:lt      Objek terkait
POST /api/v1/ontologies/:rid/objects/:type/search             Cari (grammar filter v1)
POST /api/v1/ontologies/:rid/objects/:type/aggregate          Agregasi

POST /api/v1/ontologies/:rid/actions/:action/apply            Jalankan action
POST /api/v1/ontologies/:rid/actions/:action/applyBatch       Jalankan action berkelompok
POST /api/v1/ontologies/:rid/actions/:action/validate         Validasi parameter

POST   /api/v1/datasets                                       Buat dataset
GET    /api/v1/datasets/:rid                                  Detail dataset
GET    /api/v1/datasets/:rid/branches                         List branch
POST   /api/v1/datasets/:rid/branches                         Buat branch
GET    /api/v1/datasets/:rid/branches/:branchId               Detail branch
DELETE /api/v1/datasets/:rid/branches/:branchId               Hapus branch
POST   /api/v1/datasets/:rid/transactions                     Buka transaksi
POST   /api/v1/datasets/:rid/transactions/:rid/commit         Commit transaksi
POST   /api/v1/datasets/:rid/transactions/:rid/abort          Batalkan transaksi
DELETE /api/v1/datasets/:rid/files/*                          Hapus berkas
```

Filter v1 memakai bentuk `{"type": "<varian>", "field": "...", "value": ...}`, bukan bentuk v2.
Contoh yang berhasil: `{"query": {"type": "eq", "field": "city", "value": "Jakarta"}, "pageSize": 3}`.

**Tiga operasi v1 sengaja tidak disajikan**, dan semuanya menjawab 404 "Route not found":

| Operasi | Alasan |
|---------|--------|
| `GET /api/v1/datasets/:rid/files` | Model `File` v1 mewajibkan `updatedTime`, dan rekaman berkas belum mencatat waktu tulis |
| `GET /api/v1/datasets/:rid/files/:filePath` | Alasan yang sama |
| Seluruh namespace `/api/v1/attachments` | Tidak ada backend-nya; mem-proxy-kannya akan menjawab 502, padahal 404 yang benar |

Perhatikan bedanya: `DELETE /api/v1/datasets/:rid/files/*` **disajikan** dan menjawab 404 bernama `FileNotFound` ketika berkasnya tidak ada.
Itu 404 yang berbeda artinya dari 404 "Route not found" di tabel atas.

Operasi v1 juga menolak `branchId` dan `transactionRid` pada penghapusan berkas, karena file store tidak punya dimensi branch maupun transaksi; menerimanya berarti menghapus satu-satunya salinan sambil melaporkan penghapusan yang terbatas lingkup.

---

## Arsitektur

| Komponen | Port | Dinyalakan `start.sh` |
|----------|------|------------------------|
| app-console (React + Vite) | 3000 | ya |
| svc-gateway | 8080 | ya |
| svc-ontology | 8081 | ya |
| svc-objects | 8082 | ya |
| svc-actions | 8083 | ya |
| svc-multipass | 8084 | ya |
| svc-datasets | 8085 | ya |
| svc-compass | 8086 | **tidak** |
| svc-admin | 8087 | ya |
| svc-functions | 8088 | ya |
| svc-webhooks | 8089 | **tidak** |
| svc-media | 8090 | **tidak** |
| svc-sentinel | 8091 | ya (tidak diperiksa statusnya) |
| svc-aip | 8092 | ya |
| PostgreSQL (opsional) | 5434 lewat Docker Compose | tidak |

Konsol bicara hanya ke gateway.
Gateway mem-proxy ke layanan hilir dan membuang setiap header `x-user-*` yang datang dari klien.

Gateway juga membatasi laju permintaan: 100 permintaan per 60 detik secara bawaan, diatur lewat `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, dan `RATE_LIMIT_ENABLED`.
Batas itu mudah tersentuh oleh halaman konsol yang menembak banyak permintaan kecil, terutama Network Graph; kalau sebuah halaman tampak kehilangan data, periksa 429 di log gateway sebelum mencurigai datanya.

Konsol membaca alamat API dari variabel build `VITE_API_URL` dan jatuh ke `http://localhost:8080` kalau kosong.
Perhatikan: `.env.example` dan `deploy/docker/Dockerfile.console` menyetel `VITE_API_BASE_URL`, nama yang berbeda dan tidak dibaca kode konsol.

---

## Batasan yang Diketahui

Daftar ini adalah hal-hal yang diverifikasi tidak berfungsi, bukan dugaan.
Semuanya nyata pada `master` saat panduan ini ditulis.

**Autentikasi dan izin**

1. Gateway tidak menegakkan token. Permintaan tanpa `Authorization`, atau dengan token karangan, tetap dilayani, bahkan ketika `AUTH_PUBLIC_KEY` diset.
   `authPlugin` didaftarkan terkurung di `services/svc-gateway/src/server.ts`, jadi hook-nya tidak berlaku untuk rute mana pun.
2. Karena itu `request.claims` tidak pernah terisi, penegakan izin berbasis peran tidak aktif, dan `ENFORCE_PERMISSIONS=true` membuat setiap rute terproxy menjawab 403.
3. Rate limit per-tenant jatuh ke kunci per-token atau per-IP, karena kunci per-org bergantung pada klaim yang tidak pernah ada.

**Konsol**

4. **Network Graph tidak pernah menggambar edge.** Ada dua sebab yang berdiri sendiri.
   Pertama, halaman itu membaca `sourceObjectType` dan `targetPrimaryKey` dari respons `.../links/:lt`, padahal respons itu berisi objek terkait dan tidak punya field tersebut.
   Kedua, halaman itu menembak satu permintaan per pasangan objek dan link type, sehingga menabrak batas laju gateway dan sebagian besar permintaannya dijawab 429.
5. Baris ringkasan agregat di Object Explorer rusak dalam dua lapis.
    Ia hanya dipicu oleh tipe properti huruf besar (`INTEGER`), sedangkan skrip demo mendeklarasikan huruf kecil (`integer`), jadi untuk data demo ia tidak pernah muncul.
    Ketika dipicu dengan tipe huruf besar, ia menampilkan `type: COUNT` dan `value: <n>`: konsol membaca `data[0].metrics` berupa objek, sementara layanan mengembalikan daftar datar `{type, property, value}`, sehingga metrik avg dan sum hilang.
6. Kotak "Search everything..." memerlukan Postgres. Tanpa `DATABASE_URL`, `GET /api/v2/search` menjawab 500.
7. Compass menampilkan lencana **Offline Mode** dan pohon contoh bawaan ketika layanan compass mengembalikan daftar kosong, yang merupakan keadaan normal mode demo.
   Yang Anda lihat di situ bukan resource nyata Anda.
8. Monitor yang dibuat dari konsol selalu tanpa effect, dan tidak ada UI untuk menambahkannya.
9. URL yang tidak dikenal, termasuk `/pest-control` yang sudah dicabut, menampilkan halaman kosong alih-alih pesan 404.
10. Halaman Scenarios gagal dirender jika ada objek Customer atau ServiceJob yang tidak punya properti `status`.
    Ini mudah terpicu setelah impor CSV atau pembuatan objek lewat API yang melewatkan kolom itu.
    Halaman yang sama juga diam-diam beralih ke data contoh dalam kode ketika tidak ada ontologi bernama "pest", tanpa penanda apa pun di layar.
11. Dua tombol ikon pada kartu monitor tidak punya nama yang bisa dibaca pembaca layar.
12. Halaman Webhooks menampilkan "No webhooks configured" baik ketika daftar memang kosong maupun ketika svc-webhooks mati, tanpa membedakan keduanya.

**Data dan deployment**

13. Keempat skrip di `scripts/demo/` memakai ulang ontologi pertama yang ada dan mengabaikan `ORG_RID`. Gunakan `start.sh --industry` untuk berganti industri.
14. `docker-compose.yml` memakai kata sandi Postgres yang berbeda antara service basis data dan `DATABASE_URL` aplikasinya.
15. `scripts/migrate.sql` (dimuat Compose saat init) dan `db/migrations/*.sql` (diterapkan `pnpm db:migrate`) sudah berbeda: hanya yang kedua menambahkan `org_rid` dan RLS.
16. Isolasi RLS belum terbukti ujung ke ujung. Kebijakan di `db/migrations/009_multi_tenancy.sql` membaca setelan sesi `app.org_rid`, sedangkan `services/svc-objects/src/store/pg-object-store.ts` menyetel `app.current_org_rid`.
17. `.env.example` dan `deploy/docker/Dockerfile.console` menyetel `VITE_API_BASE_URL`, sementara konsol membaca `VITE_API_URL`.
18. `pnpm db:seed` menunjuk ke `scripts/seed.js`, yang tidak ada di repositori.
19. `complete-service-job` menurunkan `invoiceId` dari `jobId`, sementara semaian pest control menomori invoice secara terpisah.
    Nomornya bentrok untuk hampir semua job, dan action menjawab 500 yang membungkus 409 alih-alih konflik yang bisa ditindaklanjuti.
    Pada semaian baru hanya `JOB-2026-008` yang lolos.
20. Dengan `DATABASE_URL` terpasang, sebagian besar rute user dan grup di svc-admin menjawab 500 karena memanggil store asinkron secara sinkron.

---

*OpenFoundry - memberi value kelas Palantir ke UKM.*
