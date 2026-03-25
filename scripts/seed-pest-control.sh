#!/usr/bin/env bash
# =============================================================================
# Seed script: Pest Control demo data for OpenFoundry
# Usage: bash scripts/seed-pest-control.sh
# =============================================================================
set -uo pipefail

ONTOLOGY_SVC="${ONTOLOGY_SERVICE_URL:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SERVICE_URL:-http://localhost:8082}"
ACTIONS_SVC="${ACTIONS_SERVICE_URL:-http://localhost:8083}"

echo "Seeding Pest Control ontology..."

# --- Create or Reuse Ontology ---
EXISTING_ONT=$(curl -sf "$ONTOLOGY_SVC/api/v2/ontologies" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d[0]['rid'] if d else '')" 2>/dev/null || echo "")

if [ -n "$EXISTING_ONT" ]; then
  PEST_ONT="$EXISTING_ONT"
  echo "  Reusing existing ontology: $PEST_ONT"
else
  PEST_ONT=$(curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d '{"apiName":"pest-control","displayName":"Pest Control Management","description":"Complete pest control business management - customers, technicians, jobs, treatments, and inventory"}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['rid'])")
  echo "  Ontology created: $PEST_ONT"
fi

# --- Create Object Types ---
for OT in \
  '{"apiName":"Customer","displayName":"Customer","description":"Residential or commercial customer","primaryKey":"customerId","properties":{"customerId":{"type":"string","description":"Unique ID"},"name":{"type":"string","description":"Name"},"phone":{"type":"string","description":"Phone"},"email":{"type":"string","description":"Email"},"address":{"type":"string","description":"Address"},"city":{"type":"string","description":"City"},"customerType":{"type":"string","description":"residential/commercial"},"contractType":{"type":"string","description":"one-time/monthly/quarterly/annual"},"monthlyRate":{"type":"integer","description":"Monthly rate (IDR)"},"joinDate":{"type":"string","description":"Join date"},"status":{"type":"string","description":"active/inactive"},"notes":{"type":"string","description":"Notes"}}}' \
  '{"apiName":"Technician","displayName":"Technician","description":"Pest control technician","primaryKey":"technicianId","properties":{"technicianId":{"type":"string","description":"ID"},"name":{"type":"string","description":"Name"},"phone":{"type":"string","description":"Phone"},"specialization":{"type":"string","description":"Specialization"},"certificationLevel":{"type":"string","description":"Level"},"activeJobCount":{"type":"integer","description":"Active jobs"},"region":{"type":"string","description":"Region"},"status":{"type":"string","description":"Status"},"hireDate":{"type":"string","description":"Hire date"},"rating":{"type":"integer","description":"Rating x10"}}}' \
  '{"apiName":"ServiceJob","displayName":"Service Job","description":"Pest control service visit","primaryKey":"jobId","properties":{"jobId":{"type":"string","description":"Job ID"},"customerId":{"type":"string","description":"Customer"},"technicianId":{"type":"string","description":"Technician"},"serviceType":{"type":"string","description":"Type"},"pestType":{"type":"string","description":"Pest"},"scheduledDate":{"type":"string","description":"Date"},"completedDate":{"type":"string","description":"Completed"},"status":{"type":"string","description":"Status"},"priority":{"type":"string","description":"Priority"},"address":{"type":"string","description":"Address"},"treatmentUsed":{"type":"string","description":"Treatment"},"amountCharged":{"type":"integer","description":"Amount (IDR)"},"technicianNotes":{"type":"string","description":"Notes"},"customerRating":{"type":"integer","description":"Rating 1-5"},"followUpRequired":{"type":"string","description":"yes/no"}}}' \
  '{"apiName":"TreatmentProduct","displayName":"Treatment Product","description":"Chemical/treatment product inventory","primaryKey":"productId","properties":{"productId":{"type":"string","description":"Product ID"},"name":{"type":"string","description":"Name"},"category":{"type":"string","description":"Category"},"targetPest":{"type":"string","description":"Target pest"},"unitPrice":{"type":"integer","description":"Price (IDR)"},"stockQty":{"type":"integer","description":"Stock"},"minStockLevel":{"type":"integer","description":"Min stock"},"supplier":{"type":"string","description":"Supplier"},"safetyClass":{"type":"string","description":"Safety class"},"expiryDate":{"type":"string","description":"Expiry"}}}' \
  '{"apiName":"Invoice","displayName":"Invoice","description":"Customer billing invoice","primaryKey":"invoiceId","properties":{"invoiceId":{"type":"string","description":"Invoice ID"},"customerId":{"type":"string","description":"Customer ID"},"jobId":{"type":"string","description":"Job ID"},"invoiceDate":{"type":"string","description":"Invoice date"},"dueDate":{"type":"string","description":"Due date"},"amount":{"type":"integer","description":"Amount (IDR)"},"tax":{"type":"integer","description":"Tax (IDR)"},"totalAmount":{"type":"integer","description":"Total amount (IDR)"},"status":{"type":"string","description":"draft/sent/paid/overdue"},"paymentMethod":{"type":"string","description":"transfer/cash/credit"},"paidDate":{"type":"string","description":"Payment date"},"notes":{"type":"string","description":"Notes"}}}' \
  '{"apiName":"Vehicle","displayName":"Vehicle","description":"Company vehicle for technician transport","primaryKey":"vehicleId","properties":{"vehicleId":{"type":"string","description":"Vehicle ID"},"plateNumber":{"type":"string","description":"Plate number"},"type":{"type":"string","description":"van/pickup/motorcycle"},"brand":{"type":"string","description":"Brand"},"model":{"type":"string","description":"Model"},"year":{"type":"integer","description":"Year"},"assignedTechnicianId":{"type":"string","description":"Assigned technician"},"status":{"type":"string","description":"active/maintenance/retired"},"lastServiceDate":{"type":"string","description":"Last service date"},"nextServiceDate":{"type":"string","description":"Next service date"},"fuelType":{"type":"string","description":"Fuel type"},"odometerKm":{"type":"integer","description":"Odometer (km)"}}}' \
  '{"apiName":"Schedule","displayName":"Schedule","description":"Technician service schedule","primaryKey":"scheduleId","properties":{"scheduleId":{"type":"string","description":"Schedule ID"},"customerId":{"type":"string","description":"Customer ID"},"technicianId":{"type":"string","description":"Technician ID"},"vehicleId":{"type":"string","description":"Vehicle ID"},"date":{"type":"string","description":"Date"},"timeSlot":{"type":"string","description":"Time slot"},"jobId":{"type":"string","description":"Job ID"},"serviceType":{"type":"string","description":"Service type"},"status":{"type":"string","description":"confirmed/pending/cancelled"},"notes":{"type":"string","description":"Notes"}}}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$PEST_ONT/objectTypes" \
    -H "Content-Type: application/json" -d "$OT" > /dev/null
done
echo "  7 object types created"

# --- Create Link Types ---
echo "  Creating link types..."
for LT in \
  '{"apiName":"CustomerHasJobs","objectTypeApiName":"Customer","linkedObjectTypeApiName":"ServiceJob","cardinality":"MANY","foreignKeyPropertyApiName":"customerId"}' \
  '{"apiName":"CustomerHasInvoices","objectTypeApiName":"Customer","linkedObjectTypeApiName":"Invoice","cardinality":"MANY","foreignKeyPropertyApiName":"customerId"}' \
  '{"apiName":"CustomerHasSchedules","objectTypeApiName":"Customer","linkedObjectTypeApiName":"Schedule","cardinality":"MANY","foreignKeyPropertyApiName":"customerId"}' \
  '{"apiName":"TechnicianAssignedJobs","objectTypeApiName":"Technician","linkedObjectTypeApiName":"ServiceJob","cardinality":"MANY","foreignKeyPropertyApiName":"technicianId"}' \
  '{"apiName":"TechnicianDrivesVehicle","objectTypeApiName":"Technician","linkedObjectTypeApiName":"Vehicle","cardinality":"ONE","foreignKeyPropertyApiName":"assignedTechnicianId"}' \
  '{"apiName":"TechnicianHasSchedules","objectTypeApiName":"Technician","linkedObjectTypeApiName":"Schedule","cardinality":"MANY","foreignKeyPropertyApiName":"technicianId"}' \
  '{"apiName":"JobHasInvoice","objectTypeApiName":"ServiceJob","linkedObjectTypeApiName":"Invoice","cardinality":"ONE","foreignKeyPropertyApiName":"jobId"}' \
  '{"apiName":"ScheduleForJob","objectTypeApiName":"Schedule","linkedObjectTypeApiName":"ServiceJob","cardinality":"ONE","foreignKeyPropertyApiName":"jobId"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$PEST_ONT/linkTypes" \
    -H "Content-Type: application/json" -d "$LT" > /dev/null
done
echo "  8 link types created"

# --- Create Action Types ---
echo "  Creating action types..."
for AT in \
  '{"apiName":"complete-service-job","description":"Complete a service job: mark as completed, deduct product stock, decrement technician active jobs, and auto-generate an invoice with 11% tax","parameters":{"jobId":{"type":"string","required":true,"description":"The service job ID to complete"},"treatmentUsed":{"type":"string","required":true,"description":"Treatment method used"},"technicianNotes":{"type":"string","required":true,"description":"Technician observations and notes"},"customerRating":{"type":"integer","required":true,"description":"Customer satisfaction rating (1-5)"},"productId":{"type":"string","required":false,"description":"Product used (for stock deduction)"},"quantityUsed":{"type":"integer","required":false,"description":"Quantity of product used"}},"modifiedEntities":{"ServiceJob":{"created":false,"modified":true},"TreatmentProduct":{"created":false,"modified":true},"Technician":{"created":false,"modified":true},"Invoice":{"created":true,"modified":false}},"status":"ACTIVE"}' \
  '{"apiName":"schedule-new-job","description":"Schedule a new pest control service job: create the job, increment technician active jobs, and create a schedule entry","parameters":{"customerId":{"type":"string","required":true,"description":"Customer ID"},"technicianId":{"type":"string","required":true,"description":"Technician to assign"},"serviceType":{"type":"string","required":true,"description":"Service type (treatment/inspection/emergency/follow-up)"},"pestType":{"type":"string","required":true,"description":"Target pest type"},"scheduledDate":{"type":"string","required":true,"description":"Scheduled date (YYYY-MM-DD)"},"priority":{"type":"string","required":true,"description":"Priority (normal/high/emergency)"},"address":{"type":"string","required":true,"description":"Service address"}},"modifiedEntities":{"ServiceJob":{"created":true,"modified":false},"Technician":{"created":false,"modified":true},"Schedule":{"created":true,"modified":false}},"status":"ACTIVE"}' \
  '{"apiName":"assign-technician","description":"Reassign a service job to a different technician, adjusting active job counts on both old and new technicians","parameters":{"jobId":{"type":"string","required":true,"description":"The service job to reassign"},"technicianId":{"type":"string","required":true,"description":"New technician ID"},"vehicleId":{"type":"string","required":false,"description":"Vehicle to assign to the technician"}},"modifiedEntities":{"ServiceJob":{"created":false,"modified":true},"Technician":{"created":false,"modified":true},"Vehicle":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"reorder-product","description":"Reorder a treatment product: increase stock quantity and record the supplier","parameters":{"productId":{"type":"string","required":true,"description":"Product ID to reorder"},"quantity":{"type":"integer","required":true,"description":"Quantity to add to stock"},"supplier":{"type":"string","required":false,"description":"Override supplier name"}},"modifiedEntities":{"TreatmentProduct":{"created":false,"modified":true}},"status":"ACTIVE"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$PEST_ONT/actionTypes" \
    -H "Content-Type: application/json" -d "$AT" > /dev/null
done
echo "  4 action types created"

BASE="$OBJECTS_SVC/api/v2/ontologies/$PEST_ONT/objects"

# --- Customers ---
echo "  Inserting customers..."
for DATA in \
  '{"primaryKey":"CUST-001","properties":{"customerId":"CUST-001","name":"PT Maju Jaya Food","phone":"021-5551234","email":"ops@majujaya.co.id","address":"Jl. Industri Raya No.45, MM2100","city":"Bekasi","customerType":"commercial","contractType":"monthly","monthlyRate":3500000,"joinDate":"2024-06-15","status":"active","notes":"Pabrik makanan - sertifikat pest-free untuk audit BPOM"}}' \
  '{"primaryKey":"CUST-002","properties":{"customerId":"CUST-002","name":"Hotel Grand Mercure Kemayoran","phone":"021-5559876","email":"facility@grandmercure.id","address":"Jl. Benyamin Suaeb Blok D5","city":"Jakarta Pusat","customerType":"commercial","contractType":"monthly","monthlyRate":5000000,"joinDate":"2024-03-01","status":"active","notes":"Hotel bintang 4, 200 kamar"}}' \
  '{"primaryKey":"CUST-003","properties":{"customerId":"CUST-003","name":"Budi Hartono","phone":"0812-8877-6543","email":"budi.h@gmail.com","address":"Perumahan Graha Indah Blok C3 No.12","city":"Tangerang Selatan","customerType":"residential","contractType":"quarterly","monthlyRate":450000,"joinDate":"2025-01-10","status":"active","notes":"Rumah 2 lantai, masalah rayap di lantai kayu"}}' \
  '{"primaryKey":"CUST-004","properties":{"customerId":"CUST-004","name":"Restoran Padang Sederhana Sudirman","phone":"021-5708899","email":"mgr@padangsederhana.com","address":"Jl. Jend. Sudirman Kav.25","city":"Jakarta Selatan","customerType":"commercial","contractType":"monthly","monthlyRate":1800000,"joinDate":"2024-09-20","status":"active","notes":"Treatment hanya jam 23:00-05:00"}}' \
  '{"primaryKey":"CUST-005","properties":{"customerId":"CUST-005","name":"Siti Rahayu","phone":"0856-1234-5678","email":"siti.rahayu@yahoo.com","address":"Jl. Melati No.7 RT03/RW05","city":"Depok","customerType":"residential","contractType":"one-time","monthlyRate":0,"joinDate":"2026-02-28","status":"active","notes":"Infestasi kecoa parah di dapur"}}' \
  '{"primaryKey":"CUST-006","properties":{"customerId":"CUST-006","name":"Gudang Tokopedia Cikupa","phone":"021-29001234","email":"warehouse@tokopedia.com","address":"Jl. Raya Cikupa-Pasar Kemis KM.5","city":"Tangerang","customerType":"commercial","contractType":"monthly","monthlyRate":7500000,"joinDate":"2024-01-15","status":"active","notes":"Gudang 5000m2, fokus rodent control"}}' \
  '{"primaryKey":"CUST-007","properties":{"customerId":"CUST-007","name":"RS Pondok Indah","phone":"021-7657525","email":"facility@rspondokindah.co.id","address":"Jl. Metro Duta Kav. UE","city":"Jakarta Selatan","customerType":"commercial","contractType":"monthly","monthlyRate":8500000,"joinDate":"2023-11-01","status":"active","notes":"Sertifikat pest management untuk akreditasi JCI"}}' \
  '{"primaryKey":"CUST-008","properties":{"customerId":"CUST-008","name":"Ahmad Fauzi","phone":"0878-5544-3322","email":"fauzi.ahmad@gmail.com","address":"Cluster Anggrek No.15, Kota Wisata","city":"Bogor","customerType":"residential","contractType":"annual","monthlyRate":350000,"joinDate":"2025-06-01","status":"inactive","notes":"Kontrak habis, belum perpanjang"}}'; do
  curl -sf -X POST "$BASE/Customer" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Technicians ---
echo "  Inserting technicians..."
for DATA in \
  '{"primaryKey":"TECH-001","properties":{"technicianId":"TECH-001","name":"Agus Prasetyo","phone":"0813-1111-2222","specialization":"termite","certificationLevel":"lead","activeJobCount":3,"region":"Jakarta Selatan","status":"on-job","hireDate":"2020-03-15","rating":47}}' \
  '{"primaryKey":"TECH-002","properties":{"technicianId":"TECH-002","name":"Dedi Kurniawan","phone":"0812-3333-4444","specialization":"general","certificationLevel":"senior","activeJobCount":2,"region":"Jakarta Pusat","status":"available","hireDate":"2021-07-01","rating":44}}' \
  '{"primaryKey":"TECH-003","properties":{"technicianId":"TECH-003","name":"Rizky Ramadhan","phone":"0857-5555-6666","specialization":"fumigation","certificationLevel":"senior","activeJobCount":1,"region":"Tangerang","status":"available","hireDate":"2022-01-10","rating":42}}' \
  '{"primaryKey":"TECH-004","properties":{"technicianId":"TECH-004","name":"Wahyu Setiawan","phone":"0858-7777-8888","specialization":"rodent","certificationLevel":"lead","activeJobCount":4,"region":"Bekasi","status":"on-job","hireDate":"2019-11-20","rating":49}}' \
  '{"primaryKey":"TECH-005","properties":{"technicianId":"TECH-005","name":"Fajar Nugroho","phone":"0821-9999-0000","specialization":"mosquito","certificationLevel":"junior","activeJobCount":1,"region":"Depok","status":"available","hireDate":"2025-06-01","rating":38}}'; do
  curl -sf -X POST "$BASE/Technician" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Service Jobs ---
echo "  Inserting service jobs..."
for DATA in \
  '{"primaryKey":"JOB-2026-001","properties":{"jobId":"JOB-2026-001","customerId":"CUST-001","technicianId":"TECH-004","serviceType":"treatment","pestType":"rodent","scheduledDate":"2026-03-10","completedDate":"2026-03-10","status":"completed","priority":"high","address":"Jl. Industri Raya No.45, MM2100","treatmentUsed":"Brodifacoum Bait Station","amountCharged":3500000,"technicianNotes":"Pasang 25 bait station di loading dock dan gudang bahan baku","customerRating":5,"followUpRequired":"yes"}}' \
  '{"primaryKey":"JOB-2026-002","properties":{"jobId":"JOB-2026-002","customerId":"CUST-002","technicianId":"TECH-002","serviceType":"treatment","pestType":"cockroach","scheduledDate":"2026-03-11","completedDate":"2026-03-11","status":"completed","priority":"normal","address":"Jl. Benyamin Suaeb Blok D5","treatmentUsed":"Advion Cockroach Gel","amountCharged":5000000,"technicianNotes":"Gel bait di 120 titik kitchen, laundry, basement","customerRating":4,"followUpRequired":"no"}}' \
  '{"primaryKey":"JOB-2026-003","properties":{"jobId":"JOB-2026-003","customerId":"CUST-003","technicianId":"TECH-001","serviceType":"inspection","pestType":"termite","scheduledDate":"2026-03-12","completedDate":"","status":"in-progress","priority":"high","address":"Perumahan Graha Indah Blok C3 No.12","treatmentUsed":"","amountCharged":0,"technicianNotes":"Ditemukan mud tube di dinding barat dan bawah tangga","customerRating":0,"followUpRequired":"yes"}}' \
  '{"primaryKey":"JOB-2026-004","properties":{"jobId":"JOB-2026-004","customerId":"CUST-005","technicianId":"TECH-002","serviceType":"emergency","pestType":"cockroach","scheduledDate":"2026-03-12","completedDate":"","status":"scheduled","priority":"emergency","address":"Jl. Melati No.7 RT03/RW05, Depok","treatmentUsed":"","amountCharged":750000,"technicianNotes":"","customerRating":0,"followUpRequired":"no"}}' \
  '{"primaryKey":"JOB-2026-005","properties":{"jobId":"JOB-2026-005","customerId":"CUST-004","technicianId":"TECH-002","serviceType":"treatment","pestType":"cockroach","scheduledDate":"2026-03-08","completedDate":"2026-03-08","status":"completed","priority":"normal","address":"Jl. Jend. Sudirman Kav.25","treatmentUsed":"Maxforce FC Magnum + Demand CS","amountCharged":1800000,"technicianNotes":"Treatment jam 23:30-02:00, spray dapur dan gudang bumbu","customerRating":5,"followUpRequired":"no"}}' \
  '{"primaryKey":"JOB-2026-006","properties":{"jobId":"JOB-2026-006","customerId":"CUST-006","technicianId":"TECH-004","serviceType":"treatment","pestType":"rodent","scheduledDate":"2026-03-13","completedDate":"","status":"scheduled","priority":"normal","address":"Jl. Raya Cikupa-Pasar Kemis KM.5","treatmentUsed":"","amountCharged":7500000,"technicianNotes":"","customerRating":0,"followUpRequired":"no"}}' \
  '{"primaryKey":"JOB-2026-007","properties":{"jobId":"JOB-2026-007","customerId":"CUST-007","technicianId":"TECH-001","serviceType":"inspection","pestType":"general","scheduledDate":"2026-03-15","completedDate":"","status":"scheduled","priority":"normal","address":"Jl. Metro Duta Kav. UE","treatmentUsed":"","amountCharged":8500000,"technicianNotes":"","customerRating":0,"followUpRequired":"no"}}' \
  '{"primaryKey":"JOB-2026-008","properties":{"jobId":"JOB-2026-008","customerId":"CUST-001","technicianId":"TECH-004","serviceType":"follow-up","pestType":"rodent","scheduledDate":"2026-03-24","completedDate":"","status":"scheduled","priority":"high","address":"Jl. Industri Raya No.45, MM2100","treatmentUsed":"","amountCharged":0,"technicianNotes":"Follow-up JOB-2026-001, cek bait station","customerRating":0,"followUpRequired":"no"}}'; do
  curl -sf -X POST "$BASE/ServiceJob" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Treatment Products ---
echo "  Inserting treatment products..."
for DATA in \
  '{"primaryKey":"PRD-001","properties":{"productId":"PRD-001","name":"Advion Cockroach Gel Bait","category":"bait","targetPest":"cockroach","unitPrice":185000,"stockQty":45,"minStockLevel":10,"supplier":"Syngenta Indonesia","safetyClass":"Class III","expiryDate":"2027-06-30"}}' \
  '{"primaryKey":"PRD-002","properties":{"productId":"PRD-002","name":"Brodifacoum Bait Block","category":"rodenticide","targetPest":"rodent","unitPrice":45000,"stockQty":200,"minStockLevel":50,"supplier":"BASF Indonesia","safetyClass":"Class I","expiryDate":"2027-12-31"}}' \
  '{"primaryKey":"PRD-003","properties":{"productId":"PRD-003","name":"Demand CS (Lambda-cyhalothrin)","category":"insecticide","targetPest":"general","unitPrice":320000,"stockQty":30,"minStockLevel":10,"supplier":"Syngenta Indonesia","safetyClass":"Class II","expiryDate":"2027-09-15"}}' \
  '{"primaryKey":"PRD-004","properties":{"productId":"PRD-004","name":"Termidor SC (Fipronil)","category":"insecticide","targetPest":"termite","unitPrice":750000,"stockQty":15,"minStockLevel":5,"supplier":"BASF Indonesia","safetyClass":"Class II","expiryDate":"2028-03-01"}}' \
  '{"primaryKey":"PRD-005","properties":{"productId":"PRD-005","name":"Maxforce FC Magnum","category":"bait","targetPest":"cockroach","unitPrice":210000,"stockQty":38,"minStockLevel":15,"supplier":"Bayer Environmental","safetyClass":"Class III","expiryDate":"2027-04-20"}}' \
  '{"primaryKey":"PRD-006","properties":{"productId":"PRD-006","name":"Vikane Gas Fumigant","category":"fumigant","targetPest":"termite","unitPrice":1500000,"stockQty":8,"minStockLevel":3,"supplier":"Douglas Products","safetyClass":"Class I","expiryDate":"2028-01-15"}}' \
  '{"primaryKey":"PRD-007","properties":{"productId":"PRD-007","name":"Mosquito Larvicide Granules (BTI)","category":"insecticide","targetPest":"mosquito","unitPrice":95000,"stockQty":60,"minStockLevel":20,"supplier":"Summit Chemical","safetyClass":"Class IV","expiryDate":"2027-08-10"}}' \
  '{"primaryKey":"PRD-008","properties":{"productId":"PRD-008","name":"Snap-E Mouse Trap","category":"trap","targetPest":"rodent","unitPrice":35000,"stockQty":150,"minStockLevel":30,"supplier":"Kness Manufacturing","safetyClass":"Class IV","expiryDate":"2030-12-31"}}'; do
  curl -sf -X POST "$BASE/TreatmentProduct" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Invoices ---
echo "  Inserting invoices..."
for DATA in \
  '{"primaryKey":"INV-2026-001","properties":{"invoiceId":"INV-2026-001","customerId":"CUST-001","jobId":"JOB-2026-001","invoiceDate":"2026-03-10","dueDate":"2026-03-24","amount":3500000,"tax":385000,"totalAmount":3885000,"status":"paid","paymentMethod":"transfer","paidDate":"2026-03-12","notes":""}}' \
  '{"primaryKey":"INV-2026-002","properties":{"invoiceId":"INV-2026-002","customerId":"CUST-002","jobId":"JOB-2026-002","invoiceDate":"2026-03-11","dueDate":"2026-03-25","amount":5000000,"tax":550000,"totalAmount":5550000,"status":"sent","paymentMethod":"","paidDate":"","notes":""}}' \
  '{"primaryKey":"INV-2026-003","properties":{"invoiceId":"INV-2026-003","customerId":"CUST-004","jobId":"JOB-2026-005","invoiceDate":"2026-03-08","dueDate":"2026-03-22","amount":1800000,"tax":198000,"totalAmount":1998000,"status":"paid","paymentMethod":"cash","paidDate":"2026-03-08","notes":""}}' \
  '{"primaryKey":"INV-2026-004","properties":{"invoiceId":"INV-2026-004","customerId":"CUST-005","jobId":"JOB-2026-004","invoiceDate":"2026-03-12","dueDate":"2026-03-26","amount":750000,"tax":82500,"totalAmount":832500,"status":"draft","paymentMethod":"","paidDate":"","notes":""}}' \
  '{"primaryKey":"INV-2026-005","properties":{"invoiceId":"INV-2026-005","customerId":"CUST-006","jobId":"JOB-2026-006","invoiceDate":"2026-03-13","dueDate":"2026-03-27","amount":7500000,"tax":825000,"totalAmount":8325000,"status":"draft","paymentMethod":"","paidDate":"","notes":""}}' \
  '{"primaryKey":"INV-2026-006","properties":{"invoiceId":"INV-2026-006","customerId":"CUST-007","jobId":"JOB-2026-007","invoiceDate":"2026-03-15","dueDate":"2026-03-29","amount":8500000,"tax":935000,"totalAmount":9435000,"status":"draft","paymentMethod":"","paidDate":"","notes":""}}'; do
  curl -sf -X POST "$BASE/Invoice" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Vehicles ---
echo "  Inserting vehicles..."
for DATA in \
  '{"primaryKey":"VHC-001","properties":{"vehicleId":"VHC-001","plateNumber":"B 1234 PCO","type":"van","brand":"Toyota","model":"HiAce","year":2023,"assignedTechnicianId":"TECH-001","status":"active","lastServiceDate":"2026-02-15","nextServiceDate":"2026-05-15","fuelType":"diesel","odometerKm":45000}}' \
  '{"primaryKey":"VHC-002","properties":{"vehicleId":"VHC-002","plateNumber":"B 5678 PCO","type":"pickup","brand":"Mitsubishi","model":"L300","year":2022,"assignedTechnicianId":"TECH-004","status":"active","lastServiceDate":"2026-01-20","nextServiceDate":"2026-04-20","fuelType":"diesel","odometerKm":62000}}' \
  '{"primaryKey":"VHC-003","properties":{"vehicleId":"VHC-003","plateNumber":"B 9012 PCO","type":"motorcycle","brand":"Honda","model":"PCX 160","year":2024,"assignedTechnicianId":"TECH-005","status":"active","lastServiceDate":"2026-03-01","nextServiceDate":"2026-06-01","fuelType":"gasoline","odometerKm":12000}}' \
  '{"primaryKey":"VHC-004","properties":{"vehicleId":"VHC-004","plateNumber":"B 3456 PCO","type":"van","brand":"Daihatsu","model":"Gran Max","year":2021,"assignedTechnicianId":"TECH-002","status":"maintenance","lastServiceDate":"2026-03-10","nextServiceDate":"2026-03-20","fuelType":"gasoline","odometerKm":78000}}'; do
  curl -sf -X POST "$BASE/Vehicle" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Schedules ---
echo "  Inserting schedules..."
for DATA in \
  '{"primaryKey":"SCH-2026-001","properties":{"scheduleId":"SCH-2026-001","customerId":"CUST-003","technicianId":"TECH-001","vehicleId":"VHC-001","date":"2026-03-12","timeSlot":"08:00-10:00","jobId":"JOB-2026-003","serviceType":"inspection","status":"confirmed","notes":"Inspeksi rayap lanjutan"}}' \
  '{"primaryKey":"SCH-2026-002","properties":{"scheduleId":"SCH-2026-002","customerId":"CUST-005","technicianId":"TECH-002","vehicleId":"VHC-004","date":"2026-03-12","timeSlot":"10:00-12:00","jobId":"JOB-2026-004","serviceType":"emergency","status":"confirmed","notes":"Emergency kecoa"}}' \
  '{"primaryKey":"SCH-2026-003","properties":{"scheduleId":"SCH-2026-003","customerId":"CUST-006","technicianId":"TECH-004","vehicleId":"VHC-002","date":"2026-03-13","timeSlot":"08:00-10:00","jobId":"JOB-2026-006","serviceType":"treatment","status":"confirmed","notes":"Rodent control gudang"}}' \
  '{"primaryKey":"SCH-2026-004","properties":{"scheduleId":"SCH-2026-004","customerId":"CUST-002","technicianId":"TECH-002","vehicleId":"VHC-001","date":"2026-03-13","timeSlot":"19:00-21:00","jobId":"","serviceType":"treatment","status":"pending","notes":"Monthly treatment hotel"}}' \
  '{"primaryKey":"SCH-2026-005","properties":{"scheduleId":"SCH-2026-005","customerId":"CUST-007","technicianId":"TECH-001","vehicleId":"VHC-001","date":"2026-03-15","timeSlot":"08:00-10:00","jobId":"JOB-2026-007","serviceType":"inspection","status":"confirmed","notes":"Inspeksi bulanan RS"}}' \
  '{"primaryKey":"SCH-2026-006","properties":{"scheduleId":"SCH-2026-006","customerId":"CUST-001","technicianId":"TECH-004","vehicleId":"VHC-002","date":"2026-03-24","timeSlot":"08:00-10:00","jobId":"JOB-2026-008","serviceType":"follow-up","status":"confirmed","notes":"Follow-up bait station"}}' \
  '{"primaryKey":"SCH-2026-007","properties":{"scheduleId":"SCH-2026-007","customerId":"CUST-004","technicianId":"TECH-002","vehicleId":"VHC-001","date":"2026-03-14","timeSlot":"21:00-23:00","jobId":"","serviceType":"treatment","status":"pending","notes":"Monthly treatment restoran"}}' \
  '{"primaryKey":"SCH-2026-008","properties":{"scheduleId":"SCH-2026-008","customerId":"CUST-009","technicianId":"TECH-003","vehicleId":"VHC-001","date":"2026-03-16","timeSlot":"08:00-10:00","jobId":"","serviceType":"inspection","status":"pending","notes":"Initial inspection Alfamart DC"}}'; do
  curl -sf -X POST "$BASE/Schedule" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

LINKS="$OBJECTS_SVC/api/v2/ontologies/$PEST_ONT/objects"

# --- Create Links: Customer → Jobs ---
echo "  Creating links: Customer → Jobs..."
for PAIR in \
  "CUST-001 JOB-2026-001" \
  "CUST-001 JOB-2026-008" \
  "CUST-002 JOB-2026-002" \
  "CUST-003 JOB-2026-003" \
  "CUST-004 JOB-2026-005" \
  "CUST-005 JOB-2026-004" \
  "CUST-006 JOB-2026-006" \
  "CUST-007 JOB-2026-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Customer/$SRC/links/CustomerHasJobs" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"ServiceJob\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Customer → Invoices ---
echo "  Creating links: Customer → Invoices..."
for PAIR in \
  "CUST-001 INV-2026-001" \
  "CUST-002 INV-2026-002" \
  "CUST-004 INV-2026-003" \
  "CUST-005 INV-2026-004" \
  "CUST-006 INV-2026-005" \
  "CUST-007 INV-2026-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Customer/$SRC/links/CustomerHasInvoices" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Invoice\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Technician → Jobs ---
echo "  Creating links: Technician → Jobs..."
for PAIR in \
  "TECH-001 JOB-2026-003" \
  "TECH-001 JOB-2026-007" \
  "TECH-002 JOB-2026-002" \
  "TECH-002 JOB-2026-004" \
  "TECH-002 JOB-2026-005" \
  "TECH-004 JOB-2026-001" \
  "TECH-004 JOB-2026-006" \
  "TECH-004 JOB-2026-008"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Technician/$SRC/links/TechnicianAssignedJobs" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"ServiceJob\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Technician → Vehicle ---
echo "  Creating links: Technician → Vehicle..."
for PAIR in \
  "TECH-001 VHC-001" \
  "TECH-002 VHC-004" \
  "TECH-004 VHC-002" \
  "TECH-005 VHC-003"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Technician/$SRC/links/TechnicianDrivesVehicle" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Vehicle\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Job → Invoice ---
echo "  Creating links: Job → Invoice..."
for PAIR in \
  "JOB-2026-001 INV-2026-001" \
  "JOB-2026-002 INV-2026-002" \
  "JOB-2026-004 INV-2026-004" \
  "JOB-2026-005 INV-2026-003" \
  "JOB-2026-006 INV-2026-005" \
  "JOB-2026-007 INV-2026-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/ServiceJob/$SRC/links/JobHasInvoice" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Invoice\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

DATASETS_SVC="${DATASETS_SERVICE_URL:-http://localhost:8085}"
PIPE_URL="$DATASETS_SVC/api/v2/pipelines"

# --- Create Pipelines ---
echo "  Creating pipelines..."

# Pipeline 1: Revenue Analysis
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Revenue by Customer Type",
    "description":"Aggregate invoice revenue by customer type (residential vs commercial), calculate totals and averages for monthly reporting",
    "steps":[
      {"id":"s1","name":"Filter Paid Invoices","type":"FILTER","config":{"field":"status","operator":"eq","value":"paid"}},
      {"id":"s2","name":"Join Customer Data","type":"JOIN","config":{"joinType":"left","leftKey":"customerId","rightKey":"customerId"},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate by Type","type":"AGGREGATE","config":{"groupBy":["customerType"],"aggregations":[{"field":"totalAmount","function":"sum","alias":"totalRevenue"},{"field":"totalAmount","function":"avg","alias":"avgInvoice"},{"field":"totalAmount","function":"count","alias":"invoiceCount"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Revenue","type":"SORT","config":{"fields":[{"field":"totalRevenue","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":86400000},
    "inputDatasets":["invoices","customers"],
    "outputDataset":"revenue-by-customer-type",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 2: Technician Performance
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Technician Performance Scorecard",
    "description":"Calculate technician KPIs: avg customer rating, job completion rate, jobs per week. Used for quarterly performance review and bonus calculation",
    "steps":[
      {"id":"s1","name":"Filter Completed Jobs","type":"FILTER","config":{"field":"status","operator":"eq","value":"completed"}},
      {"id":"s2","name":"Group by Technician","type":"AGGREGATE","config":{"groupBy":["technicianId"],"aggregations":[{"field":"customerRating","function":"avg","alias":"avgRating"},{"field":"jobId","function":"count","alias":"totalJobs"},{"field":"amountCharged","function":"sum","alias":"totalRevenue"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Join Technician Profile","type":"JOIN","config":{"joinType":"left","leftKey":"technicianId","rightKey":"technicianId"},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Rating","type":"SORT","config":{"fields":[{"field":"avgRating","direction":"desc"},{"field":"totalJobs","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"CRON","cron":"0 6 * * 1"},
    "inputDatasets":["service-jobs","technicians"],
    "outputDataset":"technician-scorecard",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 3: Inventory Alert
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Low Stock Alert Generator",
    "description":"Filter products where current stock is below minimum threshold and approaching expiry. Generates reorder alerts for procurement team",
    "steps":[
      {"id":"s1","name":"Map Stock Fields","type":"MAP","config":{"mappings":[{"source":"stockQty","target":"currentStock","transform":"toNumber"},{"source":"minStockLevel","target":"minLevel","transform":"toNumber"},{"source":"name","target":"productName"}]}},
      {"id":"s2","name":"Filter Low Stock","type":"FILTER","config":{"field":"currentStock","operator":"lte","value":20},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Urgency","type":"SORT","config":{"fields":[{"field":"currentStock","direction":"asc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":3600000},
    "inputDatasets":["treatment-products"],
    "outputDataset":"low-stock-alerts",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 4: Customer Churn Risk
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Customer Churn Risk Analysis",
    "description":"Identify customers at risk of churning by analyzing job frequency, last service date, and satisfaction ratings. Flag inactive customers and those with low ratings",
    "steps":[
      {"id":"s1","name":"Join Jobs to Customers","type":"JOIN","config":{"joinType":"left","leftKey":"customerId","rightKey":"customerId"}},
      {"id":"s2","name":"Aggregate per Customer","type":"AGGREGATE","config":{"groupBy":["customerId","name","contractType","status"],"aggregations":[{"field":"jobId","function":"count","alias":"totalJobs"},{"field":"customerRating","function":"avg","alias":"avgSatisfaction"},{"field":"scheduledDate","function":"max","alias":"lastServiceDate"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Filter At-Risk","type":"FILTER","config":{"field":"avgSatisfaction","operator":"lt","value":4},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Risk","type":"SORT","config":{"fields":[{"field":"avgSatisfaction","direction":"asc"},{"field":"totalJobs","direction":"asc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"CRON","cron":"0 8 1 * *"},
    "inputDatasets":["customers","service-jobs"],
    "outputDataset":"churn-risk-report",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 5: Job Schedule Optimizer
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Daily Schedule Optimizer",
    "description":"Prepare optimized daily schedule by grouping jobs by region, assigning based on technician availability and specialization match",
    "steps":[
      {"id":"s1","name":"Filter Upcoming Jobs","type":"FILTER","config":{"field":"status","operator":"eq","value":"scheduled"}},
      {"id":"s2","name":"Join Technician Data","type":"JOIN","config":{"joinType":"left","leftKey":"technicianId","rightKey":"technicianId"},"dependsOn":["s1"]},
      {"id":"s3","name":"Remove Duplicate Assignments","type":"DEDUPLICATE","config":{"keys":["technicianId","scheduledDate"]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Date and Region","type":"SORT","config":{"fields":[{"field":"scheduledDate","direction":"asc"},{"field":"region","direction":"asc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":43200000},
    "inputDatasets":["service-jobs","technicians"],
    "outputDataset":"optimized-schedule",
    "status":"ACTIVE"
  }' > /dev/null

echo "  5 pipelines created"

# --- Create Datasets ---
echo "  Creating datasets..."
DS_URL="$DATASETS_SVC/api/v2/datasets"

for DS in \
  '{"name":"pest-control-raw-jobs","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"pest-control-customer-master","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"pest-control-product-inventory","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"pest-control-revenue-daily","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"pest-control-technician-performance","parentFolderRid":"ri.compass.main.folder.root"}'; do
  curl -sf -X POST "$DS_URL" \
    -H "Content-Type: application/json" -d "$DS" > /dev/null
done
echo "  5 datasets created"

echo ""
echo "Done! Pest Control data seeded:"
echo "  - 1 Ontology (Pest Control Management)"
echo "  - 7 Object Types (Customer, Technician, ServiceJob, TreatmentProduct, Invoice, Vehicle, Schedule)"
echo "  - 8 Link Types (CustomerHasJobs, CustomerHasInvoices, CustomerHasSchedules, TechnicianAssignedJobs, TechnicianDrivesVehicle, TechnicianHasSchedules, JobHasInvoice, ScheduleForJob)"
echo "  - 4 Action Types (CompleteServiceJob, ScheduleNewJob, AssignTechnician, ReorderProduct)"
echo "  - 8 Customers, 5 Technicians, 8 Jobs, 8 Products, 6 Invoices, 4 Vehicles, 8 Schedules = 47 objects"
echo "  - 32 Links (8 Customer->Job, 6 Customer->Invoice, 8 Technician->Job, 4 Technician->Vehicle, 6 Job->Invoice)"
echo "  - 5 Pipelines (Revenue Analysis, Technician Scorecard, Low Stock Alert, Churn Risk, Schedule Optimizer)"
echo "  - 5 Datasets (raw-jobs, customer-master, product-inventory, revenue-daily, technician-performance)"
echo ""
echo "Ontology RID: $PEST_ONT"
