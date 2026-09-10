#!/usr/bin/env bash
# =============================================================================
# Seed script: Smart Manufacturing demo data for OpenFoundry
# Usage: bash scripts/seed-manufacturing.sh
# =============================================================================
set -uo pipefail

ONTOLOGY_SVC="${ONTOLOGY_SERVICE_URL:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SERVICE_URL:-http://localhost:8082}"
ACTIONS_SVC="${ACTIONS_SERVICE_URL:-http://localhost:8083}"

echo "Seeding Smart Manufacturing ontology..."

# --- Create or Reuse Ontology ---
EXISTING_ONT=$(curl -sf "$ONTOLOGY_SVC/api/v2/ontologies" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d[0]['rid'] if d else '')" 2>/dev/null || echo "")

if [ -n "$EXISTING_ONT" ]; then
  MFG_ONT="$EXISTING_ONT"
  echo "  Reusing existing ontology: $MFG_ONT"
else
  MFG_ONT=$(curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d '{"apiName":"manufacturing","displayName":"Smart Manufacturing","description":"End-to-end smart manufacturing management - production orders, machines, workers, materials, quality, inventory, and maintenance"}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['rid'])")
  echo "  Ontology created: $MFG_ONT"
fi

# --- Create Object Types ---
for OT in \
  '{"apiName":"ProductionOrder","displayName":"Production Order","description":"Manufacturing production order tracking","primaryKey":"orderId","properties":{"orderId":{"type":"string","description":"Unique order ID"},"productName":{"type":"string","description":"Product being manufactured"},"quantity":{"type":"integer","description":"Quantity to produce"},"status":{"type":"string","description":"planned/in-production/quality-check/completed/shipped"},"priority":{"type":"string","description":"low/normal/high/urgent"},"startDate":{"type":"string","description":"Production start date"},"dueDate":{"type":"string","description":"Due date"},"completedDate":{"type":"string","description":"Completion date"},"unitCost":{"type":"integer","description":"Cost per unit"}}}' \
  '{"apiName":"Machine","displayName":"Machine","description":"Factory floor machine or equipment","primaryKey":"machineId","properties":{"machineId":{"type":"string","description":"Unique machine ID"},"name":{"type":"string","description":"Machine name"},"type":{"type":"string","description":"CNC/Assembly/Welding/Packaging/Injection-Molding"},"status":{"type":"string","description":"running/idle/maintenance/breakdown"},"location":{"type":"string","description":"Factory floor location"},"utilizationRate":{"type":"integer","description":"Utilization percentage 0-100"},"lastMaintenance":{"type":"string","description":"Last maintenance date"},"nextMaintenance":{"type":"string","description":"Next scheduled maintenance"}}}' \
  '{"apiName":"Worker","displayName":"Worker","description":"Factory worker or staff member","primaryKey":"workerId","properties":{"workerId":{"type":"string","description":"Unique worker ID"},"fullName":{"type":"string","description":"Full name"},"role":{"type":"string","description":"Operator/Technician/QC-Inspector/Supervisor"},"shift":{"type":"string","description":"morning/afternoon/night"},"station":{"type":"string","description":"Assigned workstation"},"certifications":{"type":"string","description":"Comma-separated certifications"},"yearsExperience":{"type":"integer","description":"Years of experience"},"status":{"type":"string","description":"active/on-leave"}}}' \
  '{"apiName":"RawMaterial","displayName":"Raw Material","description":"Raw material inventory for production","primaryKey":"materialId","properties":{"materialId":{"type":"string","description":"Unique material ID"},"name":{"type":"string","description":"Material name"},"category":{"type":"string","description":"Metal/Plastic/Electronic/Chemical"},"stockQty":{"type":"integer","description":"Current stock quantity"},"minStockLevel":{"type":"integer","description":"Minimum stock threshold"},"unit":{"type":"string","description":"kg/pcs/liter/meter"},"unitCost":{"type":"integer","description":"Cost per unit"},"supplier":{"type":"string","description":"Supplier name"},"leadTime_days":{"type":"integer","description":"Supplier lead time in days"}}}' \
  '{"apiName":"QualityCheck","displayName":"Quality Check","description":"Quality inspection record for production orders","primaryKey":"checkId","properties":{"checkId":{"type":"string","description":"Unique check ID"},"orderId":{"type":"string","description":"Related production order"},"inspectorId":{"type":"string","description":"QC inspector worker ID"},"checkDate":{"type":"string","description":"Inspection date"},"result":{"type":"string","description":"pass/fail/conditional"},"defectsFound":{"type":"integer","description":"Number of defects found"},"defectType":{"type":"string","description":"Type of defect"},"severity":{"type":"string","description":"minor/major/critical"},"notes":{"type":"string","description":"Inspector notes"}}}' \
  '{"apiName":"Inventory","displayName":"Inventory","description":"Finished goods inventory tracking","primaryKey":"inventoryId","properties":{"inventoryId":{"type":"string","description":"Unique inventory ID"},"productName":{"type":"string","description":"Product name"},"sku":{"type":"string","description":"Stock keeping unit code"},"quantity":{"type":"integer","description":"Quantity in stock"},"warehouseLocation":{"type":"string","description":"Warehouse zone/shelf"},"status":{"type":"string","description":"in-stock/low-stock/out-of-stock/reserved"},"lastUpdated":{"type":"string","description":"Last inventory update date"}}}' \
  '{"apiName":"MaintenanceLog","displayName":"Maintenance Log","description":"Machine maintenance and repair records","primaryKey":"logId","properties":{"logId":{"type":"string","description":"Unique log ID"},"machineId":{"type":"string","description":"Machine serviced"},"technicianId":{"type":"string","description":"Technician worker ID"},"date":{"type":"string","description":"Maintenance date"},"type":{"type":"string","description":"preventive/corrective/emergency"},"duration_hours":{"type":"integer","description":"Duration in hours"},"partsReplaced":{"type":"string","description":"Parts replaced"},"cost":{"type":"integer","description":"Maintenance cost"},"status":{"type":"string","description":"completed/in-progress/scheduled"}}}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$MFG_ONT/objectTypes" \
    -H "Content-Type: application/json" -d "$OT" > /dev/null
done
echo "  7 object types created"

# --- Create Link Types ---
echo "  Creating link types..."
for LT in \
  '{"apiName":"OrderHasQualityChecks","objectTypeApiName":"ProductionOrder","linkedObjectTypeApiName":"QualityCheck","cardinality":"MANY","foreignKeyPropertyApiName":"orderId"}' \
  '{"apiName":"MachineHasMaintenanceLogs","objectTypeApiName":"Machine","linkedObjectTypeApiName":"MaintenanceLog","cardinality":"MANY","foreignKeyPropertyApiName":"machineId"}' \
  '{"apiName":"WorkerPerformsQualityChecks","objectTypeApiName":"Worker","linkedObjectTypeApiName":"QualityCheck","cardinality":"MANY","foreignKeyPropertyApiName":"inspectorId"}' \
  '{"apiName":"WorkerPerformsMaintenance","objectTypeApiName":"Worker","linkedObjectTypeApiName":"MaintenanceLog","cardinality":"MANY","foreignKeyPropertyApiName":"technicianId"}' \
  '{"apiName":"OrderProducesInventory","objectTypeApiName":"ProductionOrder","linkedObjectTypeApiName":"Inventory","cardinality":"ONE","foreignKeyPropertyApiName":"orderId"}' \
  '{"apiName":"MachineRunsOrders","objectTypeApiName":"Machine","linkedObjectTypeApiName":"ProductionOrder","cardinality":"MANY","foreignKeyPropertyApiName":"machineId"}' \
  '{"apiName":"WorkerOperatesMachine","objectTypeApiName":"Worker","linkedObjectTypeApiName":"Machine","cardinality":"ONE","foreignKeyPropertyApiName":"workerId"}' \
  '{"apiName":"MaterialUsedInOrders","objectTypeApiName":"RawMaterial","linkedObjectTypeApiName":"ProductionOrder","cardinality":"MANY","foreignKeyPropertyApiName":"materialId"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$MFG_ONT/linkTypes" \
    -H "Content-Type: application/json" -d "$LT" > /dev/null
done
echo "  8 link types created"

# --- Create Action Types ---
echo "  Creating action types..."
for AT in \
  '{"apiName":"start-production","description":"Start a production order: change status from planned to in-production, set start date, deduct raw materials from stock","parameters":{"orderId":{"type":"string","required":true,"description":"Production order ID to start"},"machineId":{"type":"string","required":true,"description":"Machine to assign for production"},"materialId":{"type":"string","required":true,"description":"Primary raw material to consume"},"materialQty":{"type":"integer","required":true,"description":"Quantity of raw material to deduct"}},"modifiedEntities":{"ProductionOrder":{"created":false,"modified":true},"Machine":{"created":false,"modified":true},"RawMaterial":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"complete-production","description":"Complete a production order: move status to completed, set completed date, update finished goods inventory, free the machine","parameters":{"orderId":{"type":"string","required":true,"description":"Production order ID to complete"},"quantityProduced":{"type":"integer","required":true,"description":"Actual quantity produced"},"warehouseLocation":{"type":"string","required":true,"description":"Warehouse location for finished goods"},"notes":{"type":"string","required":false,"description":"Completion notes"}},"modifiedEntities":{"ProductionOrder":{"created":false,"modified":true},"Inventory":{"created":true,"modified":false},"Machine":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"schedule-maintenance","description":"Schedule maintenance for a machine: create a maintenance log, update machine status to maintenance, assign a technician","parameters":{"machineId":{"type":"string","required":true,"description":"Machine ID requiring maintenance"},"technicianId":{"type":"string","required":true,"description":"Technician worker ID to assign"},"maintenanceType":{"type":"string","required":true,"description":"preventive/corrective/emergency"},"scheduledDate":{"type":"string","required":true,"description":"Scheduled maintenance date"},"estimatedHours":{"type":"integer","required":true,"description":"Estimated duration in hours"}},"modifiedEntities":{"Machine":{"created":false,"modified":true},"MaintenanceLog":{"created":true,"modified":false},"Worker":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"record-quality-check","description":"Record a quality inspection result for a production order, update order status based on pass/fail result","parameters":{"orderId":{"type":"string","required":true,"description":"Production order ID to inspect"},"inspectorId":{"type":"string","required":true,"description":"QC inspector worker ID"},"result":{"type":"string","required":true,"description":"pass/fail/conditional"},"defectsFound":{"type":"integer","required":true,"description":"Number of defects found"},"defectType":{"type":"string","required":false,"description":"Type of defect if any"},"severity":{"type":"string","required":false,"description":"minor/major/critical"},"notes":{"type":"string","required":false,"description":"Inspector notes"}},"modifiedEntities":{"QualityCheck":{"created":true,"modified":false},"ProductionOrder":{"created":false,"modified":true}},"status":"ACTIVE"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$MFG_ONT/actionTypes" \
    -H "Content-Type: application/json" -d "$AT" > /dev/null
done
echo "  4 action types created"

BASE="$OBJECTS_SVC/api/v2/ontologies/$MFG_ONT/objects"

# --- Production Orders (8) ---
echo "  Inserting production orders..."
for DATA in \
  '{"primaryKey":"PO-2026-001","properties":{"orderId":"PO-2026-001","productName":"Aluminum Gearbox Housing","quantity":500,"status":"completed","priority":"high","startDate":"2026-02-15","dueDate":"2026-03-01","completedDate":"2026-02-28","unitCost":12500}}' \
  '{"primaryKey":"PO-2026-002","properties":{"orderId":"PO-2026-002","productName":"Stainless Steel Valve Body","quantity":1200,"status":"in-production","priority":"urgent","startDate":"2026-03-10","dueDate":"2026-03-25","completedDate":"","unitCost":8700}}' \
  '{"primaryKey":"PO-2026-003","properties":{"orderId":"PO-2026-003","productName":"Plastic Connector Shell","quantity":5000,"status":"in-production","priority":"normal","startDate":"2026-03-12","dueDate":"2026-03-28","completedDate":"","unitCost":350}}' \
  '{"primaryKey":"PO-2026-004","properties":{"orderId":"PO-2026-004","productName":"Electronic Control Board","quantity":800,"status":"quality-check","priority":"high","startDate":"2026-03-05","dueDate":"2026-03-20","completedDate":"","unitCost":45000}}' \
  '{"primaryKey":"PO-2026-005","properties":{"orderId":"PO-2026-005","productName":"Welded Steel Frame Assembly","quantity":200,"status":"planned","priority":"normal","startDate":"","dueDate":"2026-04-10","completedDate":"","unitCost":28000}}' \
  '{"primaryKey":"PO-2026-006","properties":{"orderId":"PO-2026-006","productName":"Rubber Gasket Set","quantity":10000,"status":"completed","priority":"low","startDate":"2026-02-20","dueDate":"2026-03-10","completedDate":"2026-03-08","unitCost":120}}' \
  '{"primaryKey":"PO-2026-007","properties":{"orderId":"PO-2026-007","productName":"Precision Bearing Sleeve","quantity":3000,"status":"shipped","priority":"high","startDate":"2026-02-01","dueDate":"2026-02-20","completedDate":"2026-02-18","unitCost":5200}}' \
  '{"primaryKey":"PO-2026-008","properties":{"orderId":"PO-2026-008","productName":"Custom Hydraulic Cylinder","quantity":150,"status":"planned","priority":"urgent","startDate":"","dueDate":"2026-04-05","completedDate":"","unitCost":95000}}'; do
  curl -sf -X POST "$BASE/ProductionOrder" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Machines (7) ---
echo "  Inserting machines..."
for DATA in \
  '{"primaryKey":"MCH-001","properties":{"machineId":"MCH-001","name":"Haas VF-2SS CNC Mill","type":"CNC","status":"running","location":"Building A - Bay 1","utilizationRate":87,"lastMaintenance":"2026-02-20","nextMaintenance":"2026-04-20"}}' \
  '{"primaryKey":"MCH-002","properties":{"machineId":"MCH-002","name":"FANUC Robodrill Alpha","type":"CNC","status":"running","location":"Building A - Bay 2","utilizationRate":92,"lastMaintenance":"2026-03-01","nextMaintenance":"2026-05-01"}}' \
  '{"primaryKey":"MCH-003","properties":{"machineId":"MCH-003","name":"KUKA KR 210 R2700","type":"Assembly","status":"idle","location":"Building B - Line 1","utilizationRate":65,"lastMaintenance":"2026-01-15","nextMaintenance":"2026-04-15"}}' \
  '{"primaryKey":"MCH-004","properties":{"machineId":"MCH-004","name":"Lincoln Electric PowerWave S500","type":"Welding","status":"maintenance","location":"Building C - Bay 1","utilizationRate":45,"lastMaintenance":"2026-03-18","nextMaintenance":"2026-03-25"}}' \
  '{"primaryKey":"MCH-005","properties":{"machineId":"MCH-005","name":"Arburg Allrounder 570A","type":"Injection-Molding","status":"running","location":"Building D - Bay 1","utilizationRate":94,"lastMaintenance":"2026-02-10","nextMaintenance":"2026-04-10"}}' \
  '{"primaryKey":"MCH-006","properties":{"machineId":"MCH-006","name":"Bosch Packaging CUC","type":"Packaging","status":"running","location":"Building E - Line 1","utilizationRate":78,"lastMaintenance":"2026-03-05","nextMaintenance":"2026-05-05"}}' \
  '{"primaryKey":"MCH-007","properties":{"machineId":"MCH-007","name":"DMG Mori NLX 2500","type":"CNC","status":"breakdown","location":"Building A - Bay 3","utilizationRate":0,"lastMaintenance":"2026-01-20","nextMaintenance":"2026-03-20"}}'; do
  curl -sf -X POST "$BASE/Machine" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Workers (8) ---
echo "  Inserting workers..."
for DATA in \
  '{"primaryKey":"WRK-001","properties":{"workerId":"WRK-001","fullName":"James Chen","role":"Supervisor","shift":"morning","station":"Floor Control Room","certifications":"Six Sigma Black Belt,ISO 9001 Lead Auditor","yearsExperience":15,"status":"active"}}' \
  '{"primaryKey":"WRK-002","properties":{"workerId":"WRK-002","fullName":"Maria Santos","role":"Operator","shift":"morning","station":"CNC Bay 1","certifications":"CNC Programming Level 3,Forklift License","yearsExperience":8,"status":"active"}}' \
  '{"primaryKey":"WRK-003","properties":{"workerId":"WRK-003","fullName":"Erik Johansson","role":"Technician","shift":"morning","station":"Maintenance Workshop","certifications":"PLC Programming,Electrical Safety,Hydraulics","yearsExperience":12,"status":"active"}}' \
  '{"primaryKey":"WRK-004","properties":{"workerId":"WRK-004","fullName":"Aisha Patel","role":"QC-Inspector","shift":"morning","station":"Quality Lab","certifications":"ISO 9001 Internal Auditor,CMM Operation,GD&T Advanced","yearsExperience":6,"status":"active"}}' \
  '{"primaryKey":"WRK-005","properties":{"workerId":"WRK-005","fullName":"Tomasz Kowalski","role":"Operator","shift":"afternoon","station":"Welding Bay 1","certifications":"AWS Certified Welder,Crane Operator","yearsExperience":10,"status":"active"}}' \
  '{"primaryKey":"WRK-006","properties":{"workerId":"WRK-006","fullName":"Yuki Tanaka","role":"Technician","shift":"afternoon","station":"Injection Molding Bay","certifications":"Robotics Maintenance,PLC Programming","yearsExperience":7,"status":"active"}}' \
  '{"primaryKey":"WRK-007","properties":{"workerId":"WRK-007","fullName":"Carlos Rivera","role":"Operator","shift":"night","station":"Packaging Line 1","certifications":"Packaging Systems,Forklift License","yearsExperience":4,"status":"active"}}' \
  '{"primaryKey":"WRK-008","properties":{"workerId":"WRK-008","fullName":"Sophie Laurent","role":"QC-Inspector","shift":"afternoon","station":"Quality Lab","certifications":"Six Sigma Green Belt,Statistical Process Control","yearsExperience":5,"status":"on-leave"}}'; do
  curl -sf -X POST "$BASE/Worker" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Raw Materials (8) ---
echo "  Inserting raw materials..."
for DATA in \
  '{"primaryKey":"MAT-001","properties":{"materialId":"MAT-001","name":"6061-T6 Aluminum Sheet","category":"Metal","stockQty":2500,"minStockLevel":500,"unit":"kg","unitCost":850,"supplier":"Alcoa Corporation","leadTime_days":14}}' \
  '{"primaryKey":"MAT-002","properties":{"materialId":"MAT-002","name":"304 Stainless Steel Bar","category":"Metal","stockQty":1800,"minStockLevel":400,"unit":"kg","unitCost":1200,"supplier":"Outokumpu Oyj","leadTime_days":21}}' \
  '{"primaryKey":"MAT-003","properties":{"materialId":"MAT-003","name":"ABS Resin Pellets","category":"Plastic","stockQty":8000,"minStockLevel":2000,"unit":"kg","unitCost":180,"supplier":"SABIC","leadTime_days":10}}' \
  '{"primaryKey":"MAT-004","properties":{"materialId":"MAT-004","name":"FR-4 PCB Blank","category":"Electronic","stockQty":3200,"minStockLevel":800,"unit":"pcs","unitCost":2500,"supplier":"TTM Technologies","leadTime_days":18}}' \
  '{"primaryKey":"MAT-005","properties":{"materialId":"MAT-005","name":"Industrial Epoxy Adhesive","category":"Chemical","stockQty":150,"minStockLevel":50,"unit":"liter","unitCost":4500,"supplier":"Henkel AG","leadTime_days":7}}' \
  '{"primaryKey":"MAT-006","properties":{"materialId":"MAT-006","name":"Carbon Steel Tube","category":"Metal","stockQty":600,"minStockLevel":200,"unit":"meter","unitCost":320,"supplier":"Nippon Steel","leadTime_days":28}}' \
  '{"primaryKey":"MAT-007","properties":{"materialId":"MAT-007","name":"Nylon 66 Pellets","category":"Plastic","stockQty":4500,"minStockLevel":1000,"unit":"kg","unitCost":220,"supplier":"DuPont","leadTime_days":12}}' \
  '{"primaryKey":"MAT-008","properties":{"materialId":"MAT-008","name":"Synthetic Rubber Compound","category":"Chemical","stockQty":350,"minStockLevel":100,"unit":"kg","unitCost":560,"supplier":"Lanxess AG","leadTime_days":15}}'; do
  curl -sf -X POST "$BASE/RawMaterial" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Quality Checks (6) ---
echo "  Inserting quality checks..."
for DATA in \
  '{"primaryKey":"QC-2026-001","properties":{"checkId":"QC-2026-001","orderId":"PO-2026-001","inspectorId":"WRK-004","checkDate":"2026-02-27","result":"pass","defectsFound":2,"defectType":"Surface scratch","severity":"minor","notes":"2 units with minor surface scratches on non-critical face. Within tolerance."}}' \
  '{"primaryKey":"QC-2026-002","properties":{"checkId":"QC-2026-002","orderId":"PO-2026-004","inspectorId":"WRK-004","checkDate":"2026-03-18","result":"conditional","defectsFound":15,"defectType":"Solder bridge","severity":"major","notes":"15 boards with solder bridges on J3 connector. Rework required before shipment."}}' \
  '{"primaryKey":"QC-2026-003","properties":{"checkId":"QC-2026-003","orderId":"PO-2026-006","inspectorId":"WRK-008","checkDate":"2026-03-07","result":"pass","defectsFound":0,"defectType":"","severity":"minor","notes":"Full batch meets dimensional and hardness specifications."}}' \
  '{"primaryKey":"QC-2026-004","properties":{"checkId":"QC-2026-004","orderId":"PO-2026-007","inspectorId":"WRK-004","checkDate":"2026-02-17","result":"pass","defectsFound":5,"defectType":"Dimensional out-of-spec","severity":"minor","notes":"5 sleeves 0.02mm over tolerance. Accepted per customer concession."}}' \
  '{"primaryKey":"QC-2026-005","properties":{"checkId":"QC-2026-005","orderId":"PO-2026-002","inspectorId":"WRK-008","checkDate":"2026-03-20","result":"fail","defectsFound":45,"defectType":"Porosity","severity":"critical","notes":"Batch 3 has porosity defects in valve bore. Root cause: contaminated raw stock. Quarantined."}}' \
  '{"primaryKey":"QC-2026-006","properties":{"checkId":"QC-2026-006","orderId":"PO-2026-003","inspectorId":"WRK-004","checkDate":"2026-03-22","result":"pass","defectsFound":8,"defectType":"Flash excess","severity":"minor","notes":"Minor flash on 8 units, trimmed during inspection. Mold maintenance recommended."}}'; do
  curl -sf -X POST "$BASE/QualityCheck" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Inventory (6) ---
echo "  Inserting inventory..."
for DATA in \
  '{"primaryKey":"INV-001","properties":{"inventoryId":"INV-001","productName":"Aluminum Gearbox Housing","sku":"GBX-ALU-500","quantity":498,"warehouseLocation":"WH-A Zone 1 Shelf 3","status":"in-stock","lastUpdated":"2026-03-01"}}' \
  '{"primaryKey":"INV-002","properties":{"inventoryId":"INV-002","productName":"Rubber Gasket Set","sku":"GSK-RBR-10K","quantity":9950,"warehouseLocation":"WH-B Zone 2 Shelf 7","status":"in-stock","lastUpdated":"2026-03-09"}}' \
  '{"primaryKey":"INV-003","properties":{"inventoryId":"INV-003","productName":"Precision Bearing Sleeve","sku":"BRG-SLV-3K","quantity":0,"warehouseLocation":"WH-A Zone 3 Shelf 1","status":"out-of-stock","lastUpdated":"2026-02-22"}}' \
  '{"primaryKey":"INV-004","properties":{"inventoryId":"INV-004","productName":"Stainless Steel Valve Body","sku":"VLV-SS-1200","quantity":45,"warehouseLocation":"WH-A Zone 2 Shelf 5","status":"low-stock","lastUpdated":"2026-03-15"}}' \
  '{"primaryKey":"INV-005","properties":{"inventoryId":"INV-005","productName":"Electronic Control Board","sku":"ECB-FR4-800","quantity":200,"warehouseLocation":"WH-C Zone 1 Shelf 2","status":"reserved","lastUpdated":"2026-03-19"}}' \
  '{"primaryKey":"INV-006","properties":{"inventoryId":"INV-006","productName":"Plastic Connector Shell","sku":"CON-ABS-5K","quantity":1200,"warehouseLocation":"WH-B Zone 1 Shelf 4","status":"in-stock","lastUpdated":"2026-03-18"}}'; do
  curl -sf -X POST "$BASE/Inventory" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Maintenance Logs (7) ---
echo "  Inserting maintenance logs..."
for DATA in \
  '{"primaryKey":"MNT-2026-001","properties":{"logId":"MNT-2026-001","machineId":"MCH-001","technicianId":"WRK-003","date":"2026-02-20","type":"preventive","duration_hours":4,"partsReplaced":"Spindle bearings, coolant filter","cost":125000,"status":"completed"}}' \
  '{"primaryKey":"MNT-2026-002","properties":{"logId":"MNT-2026-002","machineId":"MCH-004","technicianId":"WRK-003","date":"2026-03-18","type":"corrective","duration_hours":8,"partsReplaced":"Wire feed motor, contact tips, gas nozzle","cost":280000,"status":"in-progress"}}' \
  '{"primaryKey":"MNT-2026-003","properties":{"logId":"MNT-2026-003","machineId":"MCH-005","technicianId":"WRK-006","date":"2026-02-10","type":"preventive","duration_hours":6,"partsReplaced":"Barrel heater bands, screw tip, hydraulic seals","cost":195000,"status":"completed"}}' \
  '{"primaryKey":"MNT-2026-004","properties":{"logId":"MNT-2026-004","machineId":"MCH-007","technicianId":"WRK-003","date":"2026-03-20","type":"emergency","duration_hours":12,"partsReplaced":"Spindle motor, drive belt, encoder","cost":850000,"status":"in-progress"}}' \
  '{"primaryKey":"MNT-2026-005","properties":{"logId":"MNT-2026-005","machineId":"MCH-002","technicianId":"WRK-006","date":"2026-03-01","type":"preventive","duration_hours":3,"partsReplaced":"Tool magazine chain, coolant pump seal","cost":95000,"status":"completed"}}' \
  '{"primaryKey":"MNT-2026-006","properties":{"logId":"MNT-2026-006","machineId":"MCH-003","technicianId":"WRK-006","date":"2026-04-15","type":"preventive","duration_hours":5,"partsReplaced":"","cost":0,"status":"scheduled"}}' \
  '{"primaryKey":"MNT-2026-007","properties":{"logId":"MNT-2026-007","machineId":"MCH-006","technicianId":"WRK-003","date":"2026-03-05","type":"preventive","duration_hours":2,"partsReplaced":"Conveyor belt, sensor alignment","cost":65000,"status":"completed"}}'; do
  curl -sf -X POST "$BASE/MaintenanceLog" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

LINKS="$OBJECTS_SVC/api/v2/ontologies/$MFG_ONT/objects"

# --- Create Links: Order → QualityChecks ---
echo "  Creating links: Order → QualityChecks..."
for PAIR in \
  "PO-2026-001 QC-2026-001" \
  "PO-2026-004 QC-2026-002" \
  "PO-2026-006 QC-2026-003" \
  "PO-2026-007 QC-2026-004" \
  "PO-2026-002 QC-2026-005" \
  "PO-2026-003 QC-2026-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/ProductionOrder/$SRC/links/OrderHasQualityChecks" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"QualityCheck\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Machine → MaintenanceLogs ---
echo "  Creating links: Machine → MaintenanceLogs..."
for PAIR in \
  "MCH-001 MNT-2026-001" \
  "MCH-004 MNT-2026-002" \
  "MCH-005 MNT-2026-003" \
  "MCH-007 MNT-2026-004" \
  "MCH-002 MNT-2026-005" \
  "MCH-003 MNT-2026-006" \
  "MCH-006 MNT-2026-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Machine/$SRC/links/MachineHasMaintenanceLogs" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"MaintenanceLog\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Worker → QualityChecks (inspectors) ---
echo "  Creating links: Worker → QualityChecks..."
for PAIR in \
  "WRK-004 QC-2026-001" \
  "WRK-004 QC-2026-002" \
  "WRK-008 QC-2026-003" \
  "WRK-004 QC-2026-004" \
  "WRK-008 QC-2026-005" \
  "WRK-004 QC-2026-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Worker/$SRC/links/WorkerPerformsQualityChecks" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"QualityCheck\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Worker → MaintenanceLogs (technicians) ---
echo "  Creating links: Worker → MaintenanceLogs..."
for PAIR in \
  "WRK-003 MNT-2026-001" \
  "WRK-003 MNT-2026-002" \
  "WRK-006 MNT-2026-003" \
  "WRK-003 MNT-2026-004" \
  "WRK-006 MNT-2026-005" \
  "WRK-006 MNT-2026-006" \
  "WRK-003 MNT-2026-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Worker/$SRC/links/WorkerPerformsMaintenance" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"MaintenanceLog\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Order → Inventory ---
echo "  Creating links: Order → Inventory..."
for PAIR in \
  "PO-2026-001 INV-001" \
  "PO-2026-006 INV-002" \
  "PO-2026-007 INV-003" \
  "PO-2026-002 INV-004" \
  "PO-2026-004 INV-005" \
  "PO-2026-003 INV-006"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/ProductionOrder/$SRC/links/OrderProducesInventory" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Inventory\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

DATASETS_SVC="${DATASETS_SERVICE_URL:-http://localhost:8085}"
PIPE_URL="$DATASETS_SVC/api/v2/pipelines"

# --- Create Pipelines ---
echo "  Creating pipelines..."

# Pipeline 1: Production Efficiency
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Production Efficiency Dashboard",
    "description":"Calculate production efficiency metrics: orders completed on time, average lead time, cost per unit trends across all product lines",
    "steps":[
      {"id":"s1","name":"Filter Completed Orders","type":"FILTER","config":{"field":"status","operator":"in","value":["completed","shipped"]}},
      {"id":"s2","name":"Calculate Lead Time","type":"MAP","config":{"mappings":[{"source":"startDate","target":"start"},{"source":"completedDate","target":"end"},{"source":"unitCost","target":"cost","transform":"toNumber"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate by Product","type":"AGGREGATE","config":{"groupBy":["productName"],"aggregations":[{"field":"quantity","function":"sum","alias":"totalProduced"},{"field":"unitCost","function":"avg","alias":"avgUnitCost"},{"field":"orderId","function":"count","alias":"orderCount"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Volume","type":"SORT","config":{"fields":[{"field":"totalProduced","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":86400000},
    "inputDatasets":["production-orders"],
    "outputDataset":"production-efficiency",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 2: Machine Utilization
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Machine Utilization Report",
    "description":"Track machine utilization rates, downtime causes, and maintenance frequency to optimize factory floor capacity planning",
    "steps":[
      {"id":"s1","name":"Join Machine Data","type":"JOIN","config":{"joinType":"left","leftKey":"machineId","rightKey":"machineId"}},
      {"id":"s2","name":"Aggregate Maintenance Costs","type":"AGGREGATE","config":{"groupBy":["machineId","name","type","status"],"aggregations":[{"field":"cost","function":"sum","alias":"totalMaintenanceCost"},{"field":"duration_hours","function":"sum","alias":"totalDowntimeHours"},{"field":"logId","function":"count","alias":"maintenanceCount"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Downtime","type":"SORT","config":{"fields":[{"field":"totalDowntimeHours","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"CRON","cron":"0 6 * * 1"},
    "inputDatasets":["machines","maintenance-logs"],
    "outputDataset":"machine-utilization-report",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 3: Quality Defect Analysis
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Quality Defect Trend Analysis",
    "description":"Analyze defect rates by product, defect type, and severity to identify systemic quality issues and drive continuous improvement",
    "steps":[
      {"id":"s1","name":"Filter Failed/Conditional","type":"FILTER","config":{"field":"result","operator":"in","value":["fail","conditional"]}},
      {"id":"s2","name":"Join Order Data","type":"JOIN","config":{"joinType":"left","leftKey":"orderId","rightKey":"orderId"},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate Defects","type":"AGGREGATE","config":{"groupBy":["defectType","severity"],"aggregations":[{"field":"defectsFound","function":"sum","alias":"totalDefects"},{"field":"checkId","function":"count","alias":"failedChecks"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Severity","type":"SORT","config":{"fields":[{"field":"totalDefects","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":43200000},
    "inputDatasets":["quality-checks","production-orders"],
    "outputDataset":"defect-trend-analysis",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 4: Raw Material Consumption Forecast
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Material Consumption Forecast",
    "description":"Project raw material consumption based on planned production orders and current stock levels. Flag materials requiring reorder based on lead times",
    "steps":[
      {"id":"s1","name":"Map Material Levels","type":"MAP","config":{"mappings":[{"source":"stockQty","target":"currentStock","transform":"toNumber"},{"source":"minStockLevel","target":"threshold","transform":"toNumber"},{"source":"leadTime_days","target":"leadDays","transform":"toNumber"}]}},
      {"id":"s2","name":"Filter Below Threshold","type":"FILTER","config":{"field":"currentStock","operator":"lte","value":500},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Lead Time","type":"SORT","config":{"fields":[{"field":"leadDays","direction":"desc"},{"field":"currentStock","direction":"asc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":3600000},
    "inputDatasets":["raw-materials"],
    "outputDataset":"material-reorder-forecast",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 5: Worker Productivity
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Worker Productivity Analysis",
    "description":"Measure worker productivity by shift, role, and station. Correlate experience and certifications with output quality for training prioritization",
    "steps":[
      {"id":"s1","name":"Join Worker QC Data","type":"JOIN","config":{"joinType":"left","leftKey":"inspectorId","rightKey":"workerId"}},
      {"id":"s2","name":"Aggregate by Worker","type":"AGGREGATE","config":{"groupBy":["workerId","fullName","role","shift"],"aggregations":[{"field":"checkId","function":"count","alias":"totalInspections"},{"field":"defectsFound","function":"sum","alias":"totalDefectsFound"}]},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Inspections","type":"SORT","config":{"fields":[{"field":"totalInspections","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"CRON","cron":"0 7 * * 1"},
    "inputDatasets":["quality-checks","workers"],
    "outputDataset":"worker-productivity",
    "status":"ACTIVE"
  }' > /dev/null

echo "  5 pipelines created"

# --- Create Datasets ---
echo "  Creating datasets..."
DS_URL="$DATASETS_SVC/api/v2/datasets"

for DS in \
  '{"name":"manufacturing-production-orders","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"manufacturing-machine-status","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"manufacturing-quality-metrics","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"manufacturing-material-inventory","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"manufacturing-maintenance-history","parentFolderRid":"ri.compass.main.folder.root"}'; do
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
    "apiName":"getMachineUtilizationSummary",
    "displayName":"Get Machine Utilization Summary",
    "description":"Returns the average utilization rate across all machines and counts machines by status",
    "language":"typescript",
    "code":"const machines = objects; const total = machines.length; const running = machines.filter(m => m.properties.status === \"running\").length; const avgUtil = total > 0 ? Math.round(machines.reduce((sum, m) => sum + m.properties.utilizationRate, 0) / total) : 0; return { totalMachines: total, running, idle: machines.filter(m => m.properties.status === \"idle\").length, maintenance: machines.filter(m => m.properties.status === \"maintenance\" || m.properties.status === \"breakdown\").length, avgUtilization: avgUtil };"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"getOverdueOrders",
    "displayName":"Get Overdue Orders",
    "description":"Returns production orders that are past their due date and not yet completed or shipped",
    "language":"typescript",
    "code":"const today = new Date().toISOString().split(\"T\")[0]; return objects.filter(o => o.properties.dueDate < today && ![\"completed\", \"shipped\"].includes(o.properties.status)).map(o => ({ orderId: o.properties.orderId, productName: o.properties.productName, dueDate: o.properties.dueDate, status: o.properties.status, priority: o.properties.priority }));"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"getMaterialsNeedingReorder",
    "displayName":"Get Materials Needing Reorder",
    "description":"Returns raw materials where current stock is below minimum stock level, sorted by urgency",
    "language":"typescript",
    "code":"return objects.filter(o => o.properties.stockQty <= o.properties.minStockLevel).map(o => ({ materialId: o.properties.materialId, name: o.properties.name, currentStock: o.properties.stockQty, minLevel: o.properties.minStockLevel, supplier: o.properties.supplier, leadTimeDays: o.properties.leadTime_days })).sort((a, b) => a.currentStock - b.currentStock);"
  }' > /dev/null

echo "  3 functions created"

echo ""
echo "Done! Smart Manufacturing data seeded:"
echo "  - 1 Ontology (Smart Manufacturing)"
echo "  - 7 Object Types (ProductionOrder, Machine, Worker, RawMaterial, QualityCheck, Inventory, MaintenanceLog)"
echo "  - 8 Link Types (OrderHasQualityChecks, MachineHasMaintenanceLogs, WorkerPerformsQualityChecks, WorkerPerformsMaintenance, OrderProducesInventory, MachineRunsOrders, WorkerOperatesMachine, MaterialUsedInOrders)"
echo "  - 4 Action Types (start-production, complete-production, schedule-maintenance, record-quality-check)"
echo "  - 8 ProductionOrders, 7 Machines, 8 Workers, 8 RawMaterials, 6 QualityChecks, 6 Inventory, 7 MaintenanceLogs = 50 objects"
echo "  - 39 Links (6 Order->QC, 7 Machine->Maint, 6 Worker->QC, 7 Worker->Maint, 6 Order->Inventory)"
echo "  - 5 Pipelines (Production Efficiency, Machine Utilization, Quality Defects, Material Forecast, Worker Productivity)"
echo "  - 5 Datasets (production-orders, machine-status, quality-metrics, material-inventory, maintenance-history)"
echo "  - 3 Functions (getMachineUtilizationSummary, getOverdueOrders, getMaterialsNeedingReorder)"
echo ""
echo "Ontology RID: $MFG_ONT"
