#!/usr/bin/env bash
# =============================================================================
# Seed script: Healthcare Management demo data for OpenFoundry
# Usage: bash scripts/seed-healthcare.sh
# =============================================================================
set -uo pipefail

ONTOLOGY_SVC="${ONTOLOGY_SERVICE_URL:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SERVICE_URL:-http://localhost:8082}"
ACTIONS_SVC="${ACTIONS_SERVICE_URL:-http://localhost:8083}"

echo "Seeding Healthcare Management ontology..."

# --- Create or Reuse Ontology ---
EXISTING_ONT=$(curl -sf "$ONTOLOGY_SVC/api/v2/ontologies" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d[0]['rid'] if d else '')" 2>/dev/null || echo "")

if [ -n "$EXISTING_ONT" ]; then
  HC_ONT="$EXISTING_ONT"
  echo "  Reusing existing ontology: $HC_ONT"
else
  HC_ONT=$(curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d '{"apiName":"healthcare","displayName":"Healthcare Management","description":"Complete hospital management - patients, doctors, appointments, medications, medical records, wards, and billing"}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['rid'])")
  echo "  Ontology created: $HC_ONT"
fi

# --- Create Object Types ---
for OT in \
  '{"apiName":"Patient","displayName":"Patient","description":"Registered hospital patient","primaryKey":"patientId","properties":{"patientId":{"type":"string","description":"Unique patient ID"},"fullName":{"type":"string","description":"Full name"},"dateOfBirth":{"type":"string","description":"Date of birth"},"gender":{"type":"string","description":"male/female"},"bloodType":{"type":"string","description":"Blood type (A/B/AB/O with +/-)"},"phone":{"type":"string","description":"Phone number"},"email":{"type":"string","description":"Email address"},"address":{"type":"string","description":"Home address"},"insuranceProvider":{"type":"string","description":"Insurance provider name"},"insuranceNumber":{"type":"string","description":"Insurance policy number"},"status":{"type":"string","description":"active/discharged/deceased"}}}' \
  '{"apiName":"Doctor","displayName":"Doctor","description":"Licensed medical practitioner","primaryKey":"doctorId","properties":{"doctorId":{"type":"string","description":"Unique doctor ID"},"fullName":{"type":"string","description":"Full name"},"specialty":{"type":"string","description":"Cardiology/Neurology/Orthopedics/Pediatrics/General"},"licenseNumber":{"type":"string","description":"Medical license number"},"phone":{"type":"string","description":"Phone number"},"email":{"type":"string","description":"Email address"},"status":{"type":"string","description":"available/on-duty/on-leave"},"yearsExperience":{"type":"integer","description":"Years of experience"},"rating":{"type":"integer","description":"Patient rating x10 (0-50)"}}}' \
  '{"apiName":"Appointment","displayName":"Appointment","description":"Scheduled patient-doctor appointment","primaryKey":"appointmentId","properties":{"appointmentId":{"type":"string","description":"Unique appointment ID"},"patientId":{"type":"string","description":"Patient ID (FK)"},"doctorId":{"type":"string","description":"Doctor ID (FK)"},"scheduledDate":{"type":"string","description":"Scheduled date and time"},"type":{"type":"string","description":"consultation/follow-up/emergency/surgery"},"status":{"type":"string","description":"scheduled/in-progress/completed/cancelled/no-show"},"notes":{"type":"string","description":"Appointment notes"},"duration":{"type":"integer","description":"Duration in minutes (15/30/45/60)"}}}' \
  '{"apiName":"Medication","displayName":"Medication","description":"Pharmaceutical inventory item","primaryKey":"medicationId","properties":{"medicationId":{"type":"string","description":"Unique medication ID"},"name":{"type":"string","description":"Medication name"},"category":{"type":"string","description":"Antibiotic/Painkiller/Cardiovascular/Respiratory/Vitamin"},"dosage":{"type":"string","description":"Dosage amount"},"unit":{"type":"string","description":"mg/ml/tablet"},"stockQty":{"type":"integer","description":"Current stock quantity"},"minStockLevel":{"type":"integer","description":"Minimum stock threshold"},"unitPrice":{"type":"integer","description":"Price per unit (IDR)"},"manufacturer":{"type":"string","description":"Manufacturer name"}}}' \
  '{"apiName":"MedicalRecord","displayName":"Medical Record","description":"Patient visit medical record","primaryKey":"recordId","properties":{"recordId":{"type":"string","description":"Unique record ID"},"patientId":{"type":"string","description":"Patient ID (FK)"},"doctorId":{"type":"string","description":"Doctor ID (FK)"},"diagnosis":{"type":"string","description":"Diagnosis description"},"treatment":{"type":"string","description":"Treatment plan"},"prescriptions":{"type":"string","description":"Prescribed medications"},"visitDate":{"type":"string","description":"Visit date"},"followUpDate":{"type":"string","description":"Follow-up date"},"severity":{"type":"string","description":"mild/moderate/severe/critical"}}}' \
  '{"apiName":"Ward","displayName":"Ward","description":"Hospital ward or unit","primaryKey":"wardId","properties":{"wardId":{"type":"string","description":"Unique ward ID"},"name":{"type":"string","description":"Ward name"},"type":{"type":"string","description":"ICU/General/Pediatric/Maternity/Surgery"},"capacity":{"type":"integer","description":"Total bed capacity"},"currentOccupancy":{"type":"integer","description":"Current number of patients"},"floor":{"type":"integer","description":"Floor number"},"status":{"type":"string","description":"open/full/maintenance"}}}' \
  '{"apiName":"Billing","displayName":"Billing","description":"Patient billing record","primaryKey":"billingId","properties":{"billingId":{"type":"string","description":"Unique billing ID"},"patientId":{"type":"string","description":"Patient ID (FK)"},"appointmentId":{"type":"string","description":"Appointment ID (FK)"},"totalAmount":{"type":"integer","description":"Total amount (IDR)"},"insuranceCovered":{"type":"integer","description":"Insurance covered amount (IDR)"},"patientPays":{"type":"integer","description":"Patient responsibility (IDR)"},"status":{"type":"string","description":"pending/paid/overdue/insurance-processing"},"issueDate":{"type":"string","description":"Invoice issue date"},"dueDate":{"type":"string","description":"Payment due date"}}}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$HC_ONT/objectTypes" \
    -H "Content-Type: application/json" -d "$OT" > /dev/null
done
echo "  7 object types created"

# --- Create Link Types ---
echo "  Creating link types..."
for LT in \
  '{"apiName":"PatientHasAppointments","objectTypeApiName":"Patient","linkedObjectTypeApiName":"Appointment","cardinality":"MANY","foreignKeyPropertyApiName":"patientId"}' \
  '{"apiName":"PatientHasMedicalRecords","objectTypeApiName":"Patient","linkedObjectTypeApiName":"MedicalRecord","cardinality":"MANY","foreignKeyPropertyApiName":"patientId"}' \
  '{"apiName":"PatientHasBillings","objectTypeApiName":"Patient","linkedObjectTypeApiName":"Billing","cardinality":"MANY","foreignKeyPropertyApiName":"patientId"}' \
  '{"apiName":"DoctorHasAppointments","objectTypeApiName":"Doctor","linkedObjectTypeApiName":"Appointment","cardinality":"MANY","foreignKeyPropertyApiName":"doctorId"}' \
  '{"apiName":"DoctorHasMedicalRecords","objectTypeApiName":"Doctor","linkedObjectTypeApiName":"MedicalRecord","cardinality":"MANY","foreignKeyPropertyApiName":"doctorId"}' \
  '{"apiName":"AppointmentHasBilling","objectTypeApiName":"Appointment","linkedObjectTypeApiName":"Billing","cardinality":"ONE","foreignKeyPropertyApiName":"appointmentId"}' \
  '{"apiName":"WardHasPatients","objectTypeApiName":"Ward","linkedObjectTypeApiName":"Patient","cardinality":"MANY","foreignKeyPropertyApiName":"wardId"}' \
  '{"apiName":"MedicalRecordHasMedications","objectTypeApiName":"MedicalRecord","linkedObjectTypeApiName":"Medication","cardinality":"MANY","foreignKeyPropertyApiName":"recordId"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$HC_ONT/linkTypes" \
    -H "Content-Type: application/json" -d "$LT" > /dev/null
done
echo "  8 link types created"

# --- Create Action Types ---
echo "  Creating action types..."
for AT in \
  '{"apiName":"schedule-appointment","description":"Schedule a new patient-doctor appointment: create the appointment record, update doctor status if needed, and optionally create a billing draft","parameters":{"patientId":{"type":"string","required":true,"description":"Patient ID"},"doctorId":{"type":"string","required":true,"description":"Doctor ID to assign"},"scheduledDate":{"type":"string","required":true,"description":"Appointment date and time (YYYY-MM-DD HH:mm)"},"type":{"type":"string","required":true,"description":"Appointment type (consultation/follow-up/emergency/surgery)"},"duration":{"type":"integer","required":true,"description":"Duration in minutes (15/30/45/60)"},"notes":{"type":"string","required":false,"description":"Additional notes"}},"modifiedEntities":{"Appointment":{"created":true,"modified":false},"Doctor":{"created":false,"modified":true},"Billing":{"created":true,"modified":false}},"status":"ACTIVE"}' \
  '{"apiName":"complete-medical-record","description":"Complete a medical record after a patient visit: record diagnosis, treatment, prescriptions, set severity, and schedule follow-up if needed","parameters":{"appointmentId":{"type":"string","required":true,"description":"The appointment ID this record is for"},"patientId":{"type":"string","required":true,"description":"Patient ID"},"doctorId":{"type":"string","required":true,"description":"Attending doctor ID"},"diagnosis":{"type":"string","required":true,"description":"Diagnosis description"},"treatment":{"type":"string","required":true,"description":"Treatment plan"},"prescriptions":{"type":"string","required":false,"description":"Prescribed medications (comma-separated)"},"severity":{"type":"string","required":true,"description":"Severity level (mild/moderate/severe/critical)"},"followUpDate":{"type":"string","required":false,"description":"Follow-up date (YYYY-MM-DD)"}},"modifiedEntities":{"MedicalRecord":{"created":true,"modified":false},"Appointment":{"created":false,"modified":true},"Medication":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"discharge-patient","description":"Discharge a patient from the hospital: update patient status to discharged, update ward occupancy, finalize any pending billing records","parameters":{"patientId":{"type":"string","required":true,"description":"Patient ID to discharge"},"wardId":{"type":"string","required":true,"description":"Ward the patient is leaving"},"dischargeNotes":{"type":"string","required":false,"description":"Discharge summary notes"},"followUpDate":{"type":"string","required":false,"description":"Follow-up appointment date"}},"modifiedEntities":{"Patient":{"created":false,"modified":true},"Ward":{"created":false,"modified":true},"Billing":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"reorder-medication","description":"Reorder a medication when stock is low: increase stock quantity and record the manufacturer supplier","parameters":{"medicationId":{"type":"string","required":true,"description":"Medication ID to reorder"},"quantity":{"type":"integer","required":true,"description":"Quantity to add to stock"},"manufacturer":{"type":"string","required":false,"description":"Override manufacturer name"}},"modifiedEntities":{"Medication":{"created":false,"modified":true}},"status":"ACTIVE"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$HC_ONT/actionTypes" \
    -H "Content-Type: application/json" -d "$AT" > /dev/null
done
echo "  4 action types created"

BASE="$OBJECTS_SVC/api/v2/ontologies/$HC_ONT/objects"

# --- Patients ---
echo "  Inserting patients..."
for DATA in \
  '{"primaryKey":"PAT-001","properties":{"patientId":"PAT-001","fullName":"Siti Nurhaliza Putri","dateOfBirth":"1985-04-12","gender":"female","bloodType":"A+","phone":"0812-3456-7890","email":"siti.nurhaliza@gmail.com","address":"Jl. Merpati No.15, Menteng","insuranceProvider":"BPJS Kesehatan","insuranceNumber":"BPJS-001-2024-78901","status":"active"}}' \
  '{"primaryKey":"PAT-002","properties":{"patientId":"PAT-002","fullName":"Bambang Suryanto","dateOfBirth":"1970-08-23","gender":"male","bloodType":"O+","phone":"0813-9876-5432","email":"bambang.s@yahoo.co.id","address":"Perumahan Bintaro Jaya Sektor 9 Blok F3 No.22","insuranceProvider":"Prudential Indonesia","insuranceNumber":"PRU-2023-55432","status":"active"}}' \
  '{"primaryKey":"PAT-003","properties":{"patientId":"PAT-003","fullName":"Dewi Kartika Sari","dateOfBirth":"1992-11-05","gender":"female","bloodType":"B+","phone":"0857-1122-3344","email":"dewi.kartika@outlook.com","address":"Apartemen Thamrin Residence Tower B Lt.12 Unit 05","insuranceProvider":"AIA Financial","insuranceNumber":"AIA-ID-2024-33210","status":"active"}}' \
  '{"primaryKey":"PAT-004","properties":{"patientId":"PAT-004","fullName":"Ahmad Rizky Pratama","dateOfBirth":"1998-02-17","gender":"male","bloodType":"AB-","phone":"0878-5566-7788","email":"ahmad.rizky@gmail.com","address":"Jl. Raya Bogor KM.30 No.5, Cimanggis","insuranceProvider":"BPJS Kesehatan","insuranceNumber":"BPJS-001-2025-12345","status":"active"}}' \
  '{"primaryKey":"PAT-005","properties":{"patientId":"PAT-005","fullName":"Ratna Megawati","dateOfBirth":"1965-06-30","gender":"female","bloodType":"O-","phone":"0821-9900-1122","email":"ratna.mega@gmail.com","address":"Jl. Veteran No.8 RT02/RW01, Kebayoran Baru","insuranceProvider":"Manulife Indonesia","insuranceNumber":"MNL-2022-88765","status":"active"}}' \
  '{"primaryKey":"PAT-006","properties":{"patientId":"PAT-006","fullName":"Hendra Wijaya","dateOfBirth":"1988-12-01","gender":"male","bloodType":"A-","phone":"0856-3344-5566","email":"hendra.w@hotmail.com","address":"Cluster Kelapa Gading Blok AA-12","insuranceProvider":"Allianz Indonesia","insuranceNumber":"ALZ-2024-67890","status":"discharged"}}' \
  '{"primaryKey":"PAT-007","properties":{"patientId":"PAT-007","fullName":"Fitriani Rahayu","dateOfBirth":"2015-03-22","gender":"female","bloodType":"B-","phone":"0813-7788-9900","email":"ibu.fitri@gmail.com","address":"Jl. Kebon Jeruk Raya No.45","insuranceProvider":"BPJS Kesehatan","insuranceNumber":"BPJS-001-2024-44321","status":"active"}}' \
  '{"primaryKey":"PAT-008","properties":{"patientId":"PAT-008","fullName":"Wawan Hermawan","dateOfBirth":"1955-09-14","gender":"male","bloodType":"AB+","phone":"0858-1234-0000","email":"wawan.h@gmail.com","address":"Jl. Raden Saleh No.3, Cikini","insuranceProvider":"Prudential Indonesia","insuranceNumber":"PRU-2021-99001","status":"active"}}'; do
  curl -sf -X POST "$BASE/Patient" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Doctors ---
echo "  Inserting doctors..."
for DATA in \
  '{"primaryKey":"DOC-001","properties":{"doctorId":"DOC-001","fullName":"dr. Andi Prasetyo, Sp.JP","specialty":"Cardiology","licenseNumber":"STR-3201-2018-00451","phone":"0811-2233-001","email":"andi.prasetyo@rsindonesia.co.id","status":"on-duty","yearsExperience":15,"rating":48}}' \
  '{"primaryKey":"DOC-002","properties":{"doctorId":"DOC-002","fullName":"dr. Maya Indah Lestari, Sp.S","specialty":"Neurology","licenseNumber":"STR-3201-2019-00892","phone":"0811-2233-002","email":"maya.lestari@rsindonesia.co.id","status":"available","yearsExperience":12,"rating":46}}' \
  '{"primaryKey":"DOC-003","properties":{"doctorId":"DOC-003","fullName":"dr. Budi Santoso, Sp.OT","specialty":"Orthopedics","licenseNumber":"STR-3201-2016-00234","phone":"0811-2233-003","email":"budi.santoso@rsindonesia.co.id","status":"on-duty","yearsExperience":18,"rating":47}}' \
  '{"primaryKey":"DOC-004","properties":{"doctorId":"DOC-004","fullName":"dr. Lina Susanti, Sp.A","specialty":"Pediatrics","licenseNumber":"STR-3201-2020-01123","phone":"0811-2233-004","email":"lina.susanti@rsindonesia.co.id","status":"available","yearsExperience":8,"rating":49}}' \
  '{"primaryKey":"DOC-005","properties":{"doctorId":"DOC-005","fullName":"dr. Rudi Hartono","specialty":"General","licenseNumber":"STR-3201-2021-01567","phone":"0811-2233-005","email":"rudi.hartono@rsindonesia.co.id","status":"available","yearsExperience":5,"rating":43}}' \
  '{"primaryKey":"DOC-006","properties":{"doctorId":"DOC-006","fullName":"dr. Nurul Hidayati, Sp.JP","specialty":"Cardiology","licenseNumber":"STR-3201-2017-00678","phone":"0811-2233-006","email":"nurul.hidayati@rsindonesia.co.id","status":"on-leave","yearsExperience":14,"rating":45}}'; do
  curl -sf -X POST "$BASE/Doctor" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Appointments ---
echo "  Inserting appointments..."
for DATA in \
  '{"primaryKey":"APT-001","properties":{"appointmentId":"APT-001","patientId":"PAT-002","doctorId":"DOC-001","scheduledDate":"2026-03-10 09:00","type":"consultation","status":"completed","notes":"Keluhan nyeri dada dan sesak napas sejak 2 minggu","duration":45}}' \
  '{"primaryKey":"APT-002","properties":{"appointmentId":"APT-002","patientId":"PAT-003","doctorId":"DOC-002","scheduledDate":"2026-03-11 10:30","type":"consultation","status":"completed","notes":"Sakit kepala kronis dan gangguan penglihatan","duration":30}}' \
  '{"primaryKey":"APT-003","properties":{"appointmentId":"APT-003","patientId":"PAT-007","doctorId":"DOC-004","scheduledDate":"2026-03-12 08:00","type":"consultation","status":"completed","notes":"Demam tinggi 3 hari, batuk berdahak","duration":30}}' \
  '{"primaryKey":"APT-004","properties":{"appointmentId":"APT-004","patientId":"PAT-001","doctorId":"DOC-005","scheduledDate":"2026-03-13 14:00","type":"consultation","status":"completed","notes":"Pemeriksaan umum dan keluhan mual berkepanjangan","duration":30}}' \
  '{"primaryKey":"APT-005","properties":{"appointmentId":"APT-005","patientId":"PAT-005","doctorId":"DOC-001","scheduledDate":"2026-03-14 09:00","type":"follow-up","status":"completed","notes":"Follow-up pasca pemasangan ring jantung","duration":30}}' \
  '{"primaryKey":"APT-006","properties":{"appointmentId":"APT-006","patientId":"PAT-008","doctorId":"DOC-003","scheduledDate":"2026-03-18 11:00","type":"surgery","status":"scheduled","notes":"Operasi penggantian lutut kanan - pre-op clearance done","duration":60}}' \
  '{"primaryKey":"APT-007","properties":{"appointmentId":"APT-007","patientId":"PAT-004","doctorId":"DOC-005","scheduledDate":"2026-03-20 10:00","type":"consultation","status":"scheduled","notes":"Keluhan nyeri perut bagian bawah","duration":30}}' \
  '{"primaryKey":"APT-008","properties":{"appointmentId":"APT-008","patientId":"PAT-002","doctorId":"DOC-001","scheduledDate":"2026-03-24 09:00","type":"follow-up","status":"scheduled","notes":"Follow-up hasil ekokardiografi","duration":30}}' \
  '{"primaryKey":"APT-009","properties":{"appointmentId":"APT-009","patientId":"PAT-006","doctorId":"DOC-003","scheduledDate":"2026-03-15 08:00","type":"follow-up","status":"completed","notes":"Evaluasi pasca operasi patah tulang lengan","duration":30}}' \
  '{"primaryKey":"APT-010","properties":{"appointmentId":"APT-010","patientId":"PAT-003","doctorId":"DOC-002","scheduledDate":"2026-03-25 10:00","type":"follow-up","status":"scheduled","notes":"Review hasil MRI otak","duration":45}}'; do
  curl -sf -X POST "$BASE/Appointment" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Medications ---
echo "  Inserting medications..."
for DATA in \
  '{"primaryKey":"MED-001","properties":{"medicationId":"MED-001","name":"Amoxicillin 500mg","category":"Antibiotic","dosage":"500","unit":"mg","stockQty":500,"minStockLevel":100,"unitPrice":2500,"manufacturer":"Kimia Farma"}}' \
  '{"primaryKey":"MED-002","properties":{"medicationId":"MED-002","name":"Paracetamol 500mg","category":"Painkiller","dosage":"500","unit":"mg","stockQty":1200,"minStockLevel":200,"unitPrice":1500,"manufacturer":"Dexa Medica"}}' \
  '{"primaryKey":"MED-003","properties":{"medicationId":"MED-003","name":"Amlodipine 10mg","category":"Cardiovascular","dosage":"10","unit":"mg","stockQty":300,"minStockLevel":80,"unitPrice":5000,"manufacturer":"Novell Pharmaceutical"}}' \
  '{"primaryKey":"MED-004","properties":{"medicationId":"MED-004","name":"Salbutamol Inhaler 100mcg","category":"Respiratory","dosage":"100","unit":"ml","stockQty":45,"minStockLevel":20,"unitPrice":75000,"manufacturer":"GlaxoSmithKline Indonesia"}}' \
  '{"primaryKey":"MED-005","properties":{"medicationId":"MED-005","name":"Vitamin D3 1000IU","category":"Vitamin","dosage":"1000","unit":"tablet","stockQty":800,"minStockLevel":150,"unitPrice":3500,"manufacturer":"Kalbe Farma"}}' \
  '{"primaryKey":"MED-006","properties":{"medicationId":"MED-006","name":"Clopidogrel 75mg","category":"Cardiovascular","dosage":"75","unit":"mg","stockQty":200,"minStockLevel":50,"unitPrice":12000,"manufacturer":"Sanofi Indonesia"}}' \
  '{"primaryKey":"MED-007","properties":{"medicationId":"MED-007","name":"Ibuprofen 400mg","category":"Painkiller","dosage":"400","unit":"mg","stockQty":600,"minStockLevel":100,"unitPrice":2000,"manufacturer":"Tempo Scan Pacific"}}' \
  '{"primaryKey":"MED-008","properties":{"medicationId":"MED-008","name":"Azithromycin 250mg","category":"Antibiotic","dosage":"250","unit":"mg","stockQty":85,"minStockLevel":40,"unitPrice":8500,"manufacturer":"Pfizer Indonesia"}}' \
  '{"primaryKey":"MED-009","properties":{"medicationId":"MED-009","name":"Omeprazole 20mg","category":"Cardiovascular","dosage":"20","unit":"mg","stockQty":350,"minStockLevel":60,"unitPrice":4000,"manufacturer":"Kalbe Farma"}}' \
  '{"primaryKey":"MED-010","properties":{"medicationId":"MED-010","name":"Cetirizine 10mg","category":"Antibiotic","dosage":"10","unit":"mg","stockQty":15,"minStockLevel":50,"unitPrice":3000,"manufacturer":"Dexa Medica"}}'; do
  curl -sf -X POST "$BASE/Medication" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Medical Records ---
echo "  Inserting medical records..."
for DATA in \
  '{"primaryKey":"REC-001","properties":{"recordId":"REC-001","patientId":"PAT-002","doctorId":"DOC-001","diagnosis":"Unstable Angina Pectoris","treatment":"Pemasangan stent koroner, terapi antiplatelet ganda","prescriptions":"Clopidogrel 75mg 1x1, Amlodipine 10mg 1x1, Aspirin 80mg 1x1","visitDate":"2026-03-10","followUpDate":"2026-03-24","severity":"severe"}}' \
  '{"primaryKey":"REC-002","properties":{"recordId":"REC-002","patientId":"PAT-003","doctorId":"DOC-002","diagnosis":"Migraine with Aura","treatment":"Terapi preventif, MRI otak untuk evaluasi lanjutan","prescriptions":"Paracetamol 500mg 3x1, Amitriptyline 25mg 1x1 malam","visitDate":"2026-03-11","followUpDate":"2026-03-25","severity":"moderate"}}' \
  '{"primaryKey":"REC-003","properties":{"recordId":"REC-003","patientId":"PAT-007","doctorId":"DOC-004","diagnosis":"Bronkopneumonia","treatment":"Rawat inap, antibiotik IV, nebulizer tiap 8 jam","prescriptions":"Amoxicillin 500mg 3x1, Paracetamol 500mg 3x1, Salbutamol inhaler","visitDate":"2026-03-12","followUpDate":"2026-03-19","severity":"moderate"}}' \
  '{"primaryKey":"REC-004","properties":{"recordId":"REC-004","patientId":"PAT-001","doctorId":"DOC-005","diagnosis":"Gastroesophageal Reflux Disease (GERD)","treatment":"Modifikasi diet, terapi PPI, hindari makanan pedas dan asam","prescriptions":"Omeprazole 20mg 2x1, Antasida sirup 3x1","visitDate":"2026-03-13","followUpDate":"2026-04-13","severity":"mild"}}' \
  '{"primaryKey":"REC-005","properties":{"recordId":"REC-005","patientId":"PAT-005","doctorId":"DOC-001","diagnosis":"Post-PCI Follow-up - Stable","treatment":"Lanjutkan terapi antiplatelet, kontrol tekanan darah","prescriptions":"Clopidogrel 75mg 1x1, Amlodipine 10mg 1x1, Atorvastatin 20mg 1x1","visitDate":"2026-03-14","followUpDate":"2026-04-14","severity":"mild"}}' \
  '{"primaryKey":"REC-006","properties":{"recordId":"REC-006","patientId":"PAT-006","doctorId":"DOC-003","diagnosis":"Fraktur Humerus Sinistra - Post ORIF","treatment":"Evaluasi pasca operasi, fisioterapi 3x seminggu","prescriptions":"Ibuprofen 400mg 3x1, Vitamin D3 1000IU 1x1, Kalsium 500mg 1x1","visitDate":"2026-03-15","followUpDate":"2026-04-15","severity":"moderate"}}' \
  '{"primaryKey":"REC-007","properties":{"recordId":"REC-007","patientId":"PAT-008","doctorId":"DOC-003","diagnosis":"Osteoarthritis Genu Bilateral - Severe","treatment":"Rencana Total Knee Replacement kanan, pre-op assessment","prescriptions":"Ibuprofen 400mg 3x1, Paracetamol 500mg 3x1","visitDate":"2026-03-16","followUpDate":"2026-03-18","severity":"severe"}}' \
  '{"primaryKey":"REC-008","properties":{"recordId":"REC-008","patientId":"PAT-004","doctorId":"DOC-005","diagnosis":"Suspected Appendicitis","treatment":"USG abdomen, observasi, rujuk ke bedah jika perlu","prescriptions":"Paracetamol 500mg 3x1","visitDate":"2026-03-17","followUpDate":"2026-03-20","severity":"moderate"}}'; do
  curl -sf -X POST "$BASE/MedicalRecord" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Wards ---
echo "  Inserting wards..."
for DATA in \
  '{"primaryKey":"WRD-001","properties":{"wardId":"WRD-001","name":"ICU Jantung","type":"ICU","capacity":10,"currentOccupancy":7,"floor":3,"status":"open"}}' \
  '{"primaryKey":"WRD-002","properties":{"wardId":"WRD-002","name":"Bangsal Umum Melati","type":"General","capacity":30,"currentOccupancy":22,"floor":2,"status":"open"}}' \
  '{"primaryKey":"WRD-003","properties":{"wardId":"WRD-003","name":"Bangsal Anak Mawar","type":"Pediatric","capacity":20,"currentOccupancy":12,"floor":4,"status":"open"}}' \
  '{"primaryKey":"WRD-004","properties":{"wardId":"WRD-004","name":"Bangsal Bersalin Anggrek","type":"Maternity","capacity":15,"currentOccupancy":15,"floor":5,"status":"full"}}' \
  '{"primaryKey":"WRD-005","properties":{"wardId":"WRD-005","name":"Ruang Bedah Dahlia","type":"Surgery","capacity":8,"currentOccupancy":3,"floor":3,"status":"open"}}' \
  '{"primaryKey":"WRD-006","properties":{"wardId":"WRD-006","name":"Bangsal Umum Kenanga","type":"General","capacity":25,"currentOccupancy":0,"floor":1,"status":"maintenance"}}'; do
  curl -sf -X POST "$BASE/Ward" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Billings ---
echo "  Inserting billings..."
for DATA in \
  '{"primaryKey":"BIL-001","properties":{"billingId":"BIL-001","patientId":"PAT-002","appointmentId":"APT-001","totalAmount":45000000,"insuranceCovered":36000000,"patientPays":9000000,"status":"insurance-processing","issueDate":"2026-03-10","dueDate":"2026-04-10"}}' \
  '{"primaryKey":"BIL-002","properties":{"billingId":"BIL-002","patientId":"PAT-003","appointmentId":"APT-002","totalAmount":2500000,"insuranceCovered":2000000,"patientPays":500000,"status":"paid","issueDate":"2026-03-11","dueDate":"2026-03-25"}}' \
  '{"primaryKey":"BIL-003","properties":{"billingId":"BIL-003","patientId":"PAT-007","appointmentId":"APT-003","totalAmount":8500000,"insuranceCovered":7650000,"patientPays":850000,"status":"pending","issueDate":"2026-03-12","dueDate":"2026-03-26"}}' \
  '{"primaryKey":"BIL-004","properties":{"billingId":"BIL-004","patientId":"PAT-001","appointmentId":"APT-004","totalAmount":750000,"insuranceCovered":600000,"patientPays":150000,"status":"paid","issueDate":"2026-03-13","dueDate":"2026-03-27"}}' \
  '{"primaryKey":"BIL-005","properties":{"billingId":"BIL-005","patientId":"PAT-005","appointmentId":"APT-005","totalAmount":1200000,"insuranceCovered":960000,"patientPays":240000,"status":"paid","issueDate":"2026-03-14","dueDate":"2026-03-28"}}' \
  '{"primaryKey":"BIL-006","properties":{"billingId":"BIL-006","patientId":"PAT-008","appointmentId":"APT-006","totalAmount":120000000,"insuranceCovered":96000000,"patientPays":24000000,"status":"pending","issueDate":"2026-03-16","dueDate":"2026-04-16"}}' \
  '{"primaryKey":"BIL-007","properties":{"billingId":"BIL-007","patientId":"PAT-006","appointmentId":"APT-009","totalAmount":1500000,"insuranceCovered":1200000,"patientPays":300000,"status":"paid","issueDate":"2026-03-15","dueDate":"2026-03-29"}}' \
  '{"primaryKey":"BIL-008","properties":{"billingId":"BIL-008","patientId":"PAT-004","appointmentId":"APT-007","totalAmount":850000,"insuranceCovered":680000,"patientPays":170000,"status":"pending","issueDate":"2026-03-17","dueDate":"2026-03-31"}}'; do
  curl -sf -X POST "$BASE/Billing" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

LINKS="$OBJECTS_SVC/api/v2/ontologies/$HC_ONT/objects"

# --- Create Links: Patient → Appointments ---
echo "  Creating links: Patient → Appointments..."
for PAIR in \
  "PAT-001 APT-004" \
  "PAT-002 APT-001" \
  "PAT-002 APT-008" \
  "PAT-003 APT-002" \
  "PAT-003 APT-010" \
  "PAT-004 APT-007" \
  "PAT-005 APT-005" \
  "PAT-006 APT-009" \
  "PAT-007 APT-003" \
  "PAT-008 APT-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Patient/$SRC/links/PatientHasAppointments" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Appointment\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Patient → Medical Records ---
echo "  Creating links: Patient → Medical Records..."
for PAIR in \
  "PAT-001 REC-004" \
  "PAT-002 REC-001" \
  "PAT-003 REC-002" \
  "PAT-004 REC-008" \
  "PAT-005 REC-005" \
  "PAT-006 REC-006" \
  "PAT-007 REC-003" \
  "PAT-008 REC-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Patient/$SRC/links/PatientHasMedicalRecords" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"MedicalRecord\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Patient → Billings ---
echo "  Creating links: Patient → Billings..."
for PAIR in \
  "PAT-001 BIL-004" \
  "PAT-002 BIL-001" \
  "PAT-003 BIL-002" \
  "PAT-004 BIL-008" \
  "PAT-005 BIL-005" \
  "PAT-006 BIL-007" \
  "PAT-007 BIL-003" \
  "PAT-008 BIL-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Patient/$SRC/links/PatientHasBillings" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Billing\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Doctor → Appointments ---
echo "  Creating links: Doctor → Appointments..."
for PAIR in \
  "DOC-001 APT-001" \
  "DOC-001 APT-005" \
  "DOC-001 APT-008" \
  "DOC-002 APT-002" \
  "DOC-002 APT-010" \
  "DOC-003 APT-006" \
  "DOC-003 APT-009" \
  "DOC-004 APT-003" \
  "DOC-005 APT-004" \
  "DOC-005 APT-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Doctor/$SRC/links/DoctorHasAppointments" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Appointment\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Doctor → Medical Records ---
echo "  Creating links: Doctor → Medical Records..."
for PAIR in \
  "DOC-001 REC-001" \
  "DOC-001 REC-005" \
  "DOC-002 REC-002" \
  "DOC-003 REC-006" \
  "DOC-003 REC-007" \
  "DOC-004 REC-003" \
  "DOC-005 REC-004" \
  "DOC-005 REC-008"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Doctor/$SRC/links/DoctorHasMedicalRecords" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"MedicalRecord\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Appointment → Billing ---
echo "  Creating links: Appointment → Billing..."
for PAIR in \
  "APT-001 BIL-001" \
  "APT-002 BIL-002" \
  "APT-003 BIL-003" \
  "APT-004 BIL-004" \
  "APT-005 BIL-005" \
  "APT-006 BIL-006" \
  "APT-007 BIL-008" \
  "APT-009 BIL-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Appointment/$SRC/links/AppointmentHasBilling" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Billing\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Ward → Patients ---
echo "  Creating links: Ward → Patients..."
for PAIR in \
  "WRD-001 PAT-002" \
  "WRD-001 PAT-005" \
  "WRD-002 PAT-001" \
  "WRD-002 PAT-004" \
  "WRD-003 PAT-007" \
  "WRD-005 PAT-008"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Ward/$SRC/links/WardHasPatients" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Patient\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: MedicalRecord → Medications ---
echo "  Creating links: MedicalRecord → Medications..."
for PAIR in \
  "REC-001 MED-006" \
  "REC-001 MED-003" \
  "REC-002 MED-002" \
  "REC-003 MED-001" \
  "REC-003 MED-002" \
  "REC-003 MED-004" \
  "REC-004 MED-009" \
  "REC-005 MED-006" \
  "REC-005 MED-003" \
  "REC-006 MED-007" \
  "REC-006 MED-005" \
  "REC-007 MED-007" \
  "REC-007 MED-002" \
  "REC-008 MED-002"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/MedicalRecord/$SRC/links/MedicalRecordHasMedications" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Medication\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

DATASETS_SVC="${DATASETS_SERVICE_URL:-http://localhost:8085}"
PIPE_URL="$DATASETS_SVC/api/v2/pipelines"

# --- Create Pipelines ---
echo "  Creating pipelines..."

# Pipeline 1: Patient Demographics
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Patient Demographics Analysis",
    "description":"Aggregate patient data by gender, age group, blood type, and insurance provider for hospital capacity planning and demographic reporting",
    "steps":[
      {"id":"s1","name":"Filter Active Patients","type":"FILTER","config":{"field":"status","operator":"eq","value":"active"}},
      {"id":"s2","name":"Map Age Groups","type":"MAP","config":{"mappings":[{"source":"dateOfBirth","target":"ageGroup","transform":"toAgeGroup"},{"source":"fullName","target":"patientName"},{"source":"gender","target":"gender"},{"source":"bloodType","target":"bloodType"},{"source":"insuranceProvider","target":"insurance"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate by Insurance","type":"AGGREGATE","config":{"groupBy":["insuranceProvider"],"aggregations":[{"field":"patientId","function":"count","alias":"patientCount"},{"field":"gender","function":"count","alias":"totalRecords"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Count","type":"SORT","config":{"fields":[{"field":"patientCount","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":86400000},
    "inputDatasets":["healthcare-patient-master"],
    "outputDataset":"patient-demographics-report",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 2: Daily Appointment Summary
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Daily Appointment Summary",
    "description":"Summarize daily appointments by doctor, type, and status. Used for hospital operations dashboard and doctor workload monitoring",
    "steps":[
      {"id":"s1","name":"Join Doctor Data","type":"JOIN","config":{"joinType":"left","leftKey":"doctorId","rightKey":"doctorId"}},
      {"id":"s2","name":"Aggregate by Doctor and Type","type":"AGGREGATE","config":{"groupBy":["doctorId","fullName","specialty","type"],"aggregations":[{"field":"appointmentId","function":"count","alias":"appointmentCount"},{"field":"duration","function":"sum","alias":"totalMinutes"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Date and Doctor","type":"SORT","config":{"fields":[{"field":"scheduledDate","direction":"asc"},{"field":"appointmentCount","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"CRON","cron":"0 6 * * *"},
    "inputDatasets":["healthcare-appointments-daily","healthcare-patient-master"],
    "outputDataset":"appointment-daily-summary",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 3: Medication Inventory Alert
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Medication Low Stock Alert",
    "description":"Filter medications where current stock is below minimum threshold. Generates reorder alerts for pharmacy procurement team",
    "steps":[
      {"id":"s1","name":"Map Stock Fields","type":"MAP","config":{"mappings":[{"source":"stockQty","target":"currentStock","transform":"toNumber"},{"source":"minStockLevel","target":"minLevel","transform":"toNumber"},{"source":"name","target":"medicationName"}]}},
      {"id":"s2","name":"Filter Low Stock","type":"FILTER","config":{"field":"currentStock","operator":"lte","valueRef":"minLevel"},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Urgency","type":"SORT","config":{"fields":[{"field":"currentStock","direction":"asc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":3600000},
    "inputDatasets":["healthcare-medication-inventory"],
    "outputDataset":"medication-low-stock-alerts",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 4: Revenue Analysis
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Hospital Revenue Analysis",
    "description":"Aggregate billing data by status, insurance provider coverage, and patient responsibility. Used for monthly financial reporting and insurance reconciliation",
    "steps":[
      {"id":"s1","name":"Join Patient Data","type":"JOIN","config":{"joinType":"left","leftKey":"patientId","rightKey":"patientId"}},
      {"id":"s2","name":"Aggregate by Status","type":"AGGREGATE","config":{"groupBy":["status"],"aggregations":[{"field":"totalAmount","function":"sum","alias":"totalRevenue"},{"field":"insuranceCovered","function":"sum","alias":"totalInsurance"},{"field":"patientPays","function":"sum","alias":"totalPatientPays"},{"field":"billingId","function":"count","alias":"billingCount"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Revenue","type":"SORT","config":{"fields":[{"field":"totalRevenue","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":86400000},
    "inputDatasets":["healthcare-revenue-daily","healthcare-patient-master"],
    "outputDataset":"revenue-analysis-report",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 5: Ward Occupancy Monitor
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Ward Occupancy Monitor",
    "description":"Monitor real-time ward occupancy rates, identify wards nearing capacity, and flag wards requiring maintenance. Used for bed management and patient admission decisions",
    "steps":[
      {"id":"s1","name":"Filter Active Wards","type":"FILTER","config":{"field":"status","operator":"neq","value":"maintenance"}},
      {"id":"s2","name":"Calculate Occupancy Rate","type":"MAP","config":{"mappings":[{"source":"currentOccupancy","target":"occupied","transform":"toNumber"},{"source":"capacity","target":"total","transform":"toNumber"},{"source":"name","target":"wardName"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Occupancy","type":"SORT","config":{"fields":[{"field":"occupied","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":1800000},
    "inputDatasets":["healthcare-ward-occupancy"],
    "outputDataset":"ward-occupancy-dashboard",
    "status":"ACTIVE"
  }' > /dev/null

echo "  5 pipelines created"

# --- Create Datasets ---
echo "  Creating datasets..."
DS_URL="$DATASETS_SVC/api/v2/datasets"

for DS in \
  '{"name":"healthcare-patient-master","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"healthcare-appointments-daily","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"healthcare-medication-inventory","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"healthcare-revenue-daily","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"healthcare-ward-occupancy","parentFolderRid":"ri.compass.main.folder.root"}'; do
  curl -sf -X POST "$DS_URL" \
    -H "Content-Type: application/json" -d "$DS" > /dev/null
done
echo "  5 datasets created"

# --- Create Functions ---
echo "  Creating functions..."
FUNCTIONS_SVC="${FUNCTIONS_SERVICE_URL:-http://localhost:8088}"
FUNC_URL="$FUNCTIONS_SVC/api/v2/functions"

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"getAvailableDoctors",
    "displayName":"Get Available Doctors",
    "description":"Returns doctors whose status is available, optionally filtered by specialty",
    "language":"typescript",
    "code":"return objects.filter(o => o.properties.status === \"available\").map(o => ({ doctorId: o.properties.doctorId, fullName: o.properties.fullName, specialty: o.properties.specialty, rating: o.properties.rating }));"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"getLowStockMedications",
    "displayName":"Get Low Stock Medications",
    "description":"Returns medications where current stock quantity is below the minimum stock level threshold",
    "language":"typescript",
    "code":"return objects.filter(o => o.properties.stockQty < o.properties.minStockLevel).map(o => ({ name: o.properties.name, stock: o.properties.stockQty, min: o.properties.minStockLevel, manufacturer: o.properties.manufacturer }));"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"calculateWardOccupancy",
    "displayName":"Calculate Ward Occupancy",
    "description":"Calculates occupancy percentage for each ward and returns overall hospital bed utilization",
    "language":"typescript",
    "code":"const wards = objects.map(o => ({ name: o.properties.name, type: o.properties.type, occupied: o.properties.currentOccupancy, capacity: o.properties.capacity, rate: o.properties.capacity > 0 ? Math.round((o.properties.currentOccupancy / o.properties.capacity) * 100) : 0 })); const totalBeds = objects.reduce((s, o) => s + o.properties.capacity, 0); const totalOccupied = objects.reduce((s, o) => s + o.properties.currentOccupancy, 0); return { wards, totalBeds, totalOccupied, overallRate: totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0 };"
  }' > /dev/null

echo "  3 functions created"

echo ""
echo "Done! Healthcare Management data seeded:"
echo "  - 1 Ontology (Healthcare Management)"
echo "  - 7 Object Types (Patient, Doctor, Appointment, Medication, MedicalRecord, Ward, Billing)"
echo "  - 8 Link Types (PatientHasAppointments, PatientHasMedicalRecords, PatientHasBillings, DoctorHasAppointments, DoctorHasMedicalRecords, AppointmentHasBilling, WardHasPatients, MedicalRecordHasMedications)"
echo "  - 4 Action Types (ScheduleAppointment, CompleteMedicalRecord, DischargePatient, ReorderMedication)"
echo "  - 8 Patients, 6 Doctors, 10 Appointments, 10 Medications, 8 Medical Records, 6 Wards, 8 Billings = 56 objects"
echo "  - 74 Links (10 Patient->Appt, 8 Patient->Record, 8 Patient->Billing, 10 Doctor->Appt, 8 Doctor->Record, 8 Appt->Billing, 6 Ward->Patient, 14 Record->Medication)"
echo "  - 5 Pipelines (Patient Demographics, Appointment Summary, Medication Alert, Revenue Analysis, Ward Occupancy)"
echo "  - 5 Datasets (patient-master, appointments-daily, medication-inventory, revenue-daily, ward-occupancy)"
echo "  - 3 Functions (getAvailableDoctors, getLowStockMedications, calculateWardOccupancy)"
echo ""
echo "Ontology RID: $HC_ONT"
