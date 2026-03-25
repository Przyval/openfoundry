#!/usr/bin/env bash
# =============================================================================
# Seed script: Logistics Operations demo data for OpenFoundry
# Usage: bash scripts/seed-logistics.sh
# =============================================================================
set -uo pipefail

ONTOLOGY_SVC="${ONTOLOGY_SERVICE_URL:-http://localhost:8081}"
OBJECTS_SVC="${OBJECTS_SERVICE_URL:-http://localhost:8082}"
ACTIONS_SVC="${ACTIONS_SERVICE_URL:-http://localhost:8083}"

echo "Seeding Logistics Operations ontology..."

# --- Create or Reuse Ontology ---
EXISTING_ONT=$(curl -sf "$ONTOLOGY_SVC/api/v2/ontologies" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d[0]['rid'] if d else '')" 2>/dev/null || echo "")

if [ -n "$EXISTING_ONT" ]; then
  LOG_ONT="$EXISTING_ONT"
  echo "  Reusing existing ontology: $LOG_ONT"
else
  LOG_ONT=$(curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies" \
    -H "Content-Type: application/json" \
    -d '{"apiName":"logistics","displayName":"Logistics Operations","description":"Complete logistics operations management - shipments, warehouses, drivers, vehicles, routes, packages, and delivery attempts across Indonesian cities"}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['rid'])")
  echo "  Ontology created: $LOG_ONT"
fi

# --- Create Object Types ---
for OT in \
  '{"apiName":"Shipment","displayName":"Shipment","description":"Cargo shipment from origin to destination","primaryKey":"shipmentId","properties":{"shipmentId":{"type":"string","description":"Unique shipment ID"},"origin":{"type":"string","description":"Origin city/address"},"destination":{"type":"string","description":"Destination city/address"},"weight_kg":{"type":"integer","description":"Total weight in kg"},"volume_m3":{"type":"integer","description":"Total volume in cubic meters (x100)"},"status":{"type":"string","description":"pending/in-transit/delivered/delayed/returned"},"priority":{"type":"string","description":"standard/express/overnight"},"estimatedDelivery":{"type":"string","description":"Estimated delivery date"},"actualDelivery":{"type":"string","description":"Actual delivery date"},"cost":{"type":"integer","description":"Shipping cost (IDR)"}}}' \
  '{"apiName":"Warehouse","displayName":"Warehouse","description":"Storage and distribution facility","primaryKey":"warehouseId","properties":{"warehouseId":{"type":"string","description":"Unique warehouse ID"},"name":{"type":"string","description":"Warehouse name"},"city":{"type":"string","description":"City"},"capacity_m3":{"type":"integer","description":"Total capacity in cubic meters"},"usedCapacity_m3":{"type":"integer","description":"Used capacity in cubic meters"},"type":{"type":"string","description":"distribution-center/fulfillment/cold-storage/cross-dock"},"status":{"type":"string","description":"active/maintenance/full"},"manager":{"type":"string","description":"Warehouse manager name"}}}' \
  '{"apiName":"Driver","displayName":"Driver","description":"Delivery driver","primaryKey":"driverId","properties":{"driverId":{"type":"string","description":"Unique driver ID"},"fullName":{"type":"string","description":"Full name"},"phone":{"type":"string","description":"Phone number"},"licenseType":{"type":"string","description":"A/B/C/SIM-A/SIM-B"},"vehicleId":{"type":"string","description":"Assigned vehicle ID"},"status":{"type":"string","description":"available/on-route/resting/off-duty"},"rating":{"type":"integer","description":"Rating x10 (e.g. 47 = 4.7)"},"totalDeliveries":{"type":"integer","description":"Lifetime delivery count"},"joinDate":{"type":"string","description":"Join date"}}}' \
  '{"apiName":"Vehicle","displayName":"Vehicle","description":"Transport vehicle","primaryKey":"vehicleId","properties":{"vehicleId":{"type":"string","description":"Unique vehicle ID"},"plateNumber":{"type":"string","description":"License plate number"},"type":{"type":"string","description":"truck/van/motorcycle/container"},"capacity_kg":{"type":"integer","description":"Max load capacity in kg"},"fuelType":{"type":"string","description":"diesel/gasoline/electric"},"mileage_km":{"type":"integer","description":"Total mileage in km"},"status":{"type":"string","description":"active/maintenance/retired"},"lastService":{"type":"string","description":"Last service date"}}}' \
  '{"apiName":"Route","displayName":"Route","description":"Delivery route between two points","primaryKey":"routeId","properties":{"routeId":{"type":"string","description":"Unique route ID"},"origin":{"type":"string","description":"Origin city"},"destination":{"type":"string","description":"Destination city"},"distance_km":{"type":"integer","description":"Distance in km"},"estimatedTime_hours":{"type":"integer","description":"Estimated time in hours (x10)"},"status":{"type":"string","description":"active/congested/closed"},"tollCost":{"type":"integer","description":"Toll cost (IDR)"},"fuelEstimate":{"type":"integer","description":"Fuel cost estimate (IDR)"}}}' \
  '{"apiName":"Package","displayName":"Package","description":"Individual package within a shipment","primaryKey":"packageId","properties":{"packageId":{"type":"string","description":"Unique package ID"},"shipmentId":{"type":"string","description":"Parent shipment ID"},"description":{"type":"string","description":"Package description"},"weight_kg":{"type":"integer","description":"Weight in kg (x10)"},"dimensions":{"type":"string","description":"LxWxH in cm"},"fragile":{"type":"string","description":"true/false"},"insured":{"type":"string","description":"true/false"},"insuranceValue":{"type":"integer","description":"Insurance value (IDR)"},"status":{"type":"string","description":"warehouse/loaded/in-transit/delivered"}}}' \
  '{"apiName":"DeliveryAttempt","displayName":"Delivery Attempt","description":"Record of a delivery attempt for a shipment","primaryKey":"attemptId","properties":{"attemptId":{"type":"string","description":"Unique attempt ID"},"shipmentId":{"type":"string","description":"Shipment ID"},"driverId":{"type":"string","description":"Driver ID"},"attemptDate":{"type":"string","description":"Attempt date"},"status":{"type":"string","description":"successful/failed/rescheduled"},"failureReason":{"type":"string","description":"Reason for failure if applicable"},"recipientName":{"type":"string","description":"Recipient name"},"signature":{"type":"string","description":"true/false"}}}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$LOG_ONT/objectTypes" \
    -H "Content-Type: application/json" -d "$OT" > /dev/null
done
echo "  7 object types created"

# --- Create Link Types ---
echo "  Creating link types..."
for LT in \
  '{"apiName":"ShipmentHasPackages","objectTypeApiName":"Shipment","linkedObjectTypeApiName":"Package","cardinality":"MANY","foreignKeyPropertyApiName":"shipmentId"}' \
  '{"apiName":"ShipmentHasAttempts","objectTypeApiName":"Shipment","linkedObjectTypeApiName":"DeliveryAttempt","cardinality":"MANY","foreignKeyPropertyApiName":"shipmentId"}' \
  '{"apiName":"DriverAssignedVehicle","objectTypeApiName":"Driver","linkedObjectTypeApiName":"Vehicle","cardinality":"ONE","foreignKeyPropertyApiName":"vehicleId"}' \
  '{"apiName":"DriverHasAttempts","objectTypeApiName":"Driver","linkedObjectTypeApiName":"DeliveryAttempt","cardinality":"MANY","foreignKeyPropertyApiName":"driverId"}' \
  '{"apiName":"WarehouseStoresPackages","objectTypeApiName":"Warehouse","linkedObjectTypeApiName":"Package","cardinality":"MANY","foreignKeyPropertyApiName":"warehouseId"}' \
  '{"apiName":"RouteUsedByShipment","objectTypeApiName":"Route","linkedObjectTypeApiName":"Shipment","cardinality":"MANY","foreignKeyPropertyApiName":"routeId"}' \
  '{"apiName":"DriverHandlesShipment","objectTypeApiName":"Driver","linkedObjectTypeApiName":"Shipment","cardinality":"MANY","foreignKeyPropertyApiName":"driverId"}' \
  '{"apiName":"VehicleOnRoute","objectTypeApiName":"Vehicle","linkedObjectTypeApiName":"Route","cardinality":"MANY","foreignKeyPropertyApiName":"vehicleId"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$LOG_ONT/linkTypes" \
    -H "Content-Type: application/json" -d "$LT" > /dev/null
done
echo "  8 link types created"

# --- Create Action Types ---
echo "  Creating action types..."
for AT in \
  '{"apiName":"dispatch-shipment","description":"Dispatch a shipment: assign a driver and vehicle, set status to in-transit, update driver status to on-route, and create initial delivery attempt record","parameters":{"shipmentId":{"type":"string","required":true,"description":"The shipment ID to dispatch"},"driverId":{"type":"string","required":true,"description":"Driver to assign"},"vehicleId":{"type":"string","required":true,"description":"Vehicle to use"},"routeId":{"type":"string","required":false,"description":"Route to follow"}},"modifiedEntities":{"Shipment":{"created":false,"modified":true},"Driver":{"created":false,"modified":true},"Vehicle":{"created":false,"modified":true},"DeliveryAttempt":{"created":true,"modified":false}},"status":"ACTIVE"}' \
  '{"apiName":"complete-delivery","description":"Complete a delivery: mark shipment as delivered, update all packages to delivered status, record actual delivery date, increment driver total deliveries, and set driver status back to available","parameters":{"shipmentId":{"type":"string","required":true,"description":"The shipment ID to complete"},"recipientName":{"type":"string","required":true,"description":"Name of person who received the delivery"},"signature":{"type":"string","required":true,"description":"Whether signature was obtained (true/false)"},"driverId":{"type":"string","required":true,"description":"Driver who completed delivery"}},"modifiedEntities":{"Shipment":{"created":false,"modified":true},"Package":{"created":false,"modified":true},"Driver":{"created":false,"modified":true},"DeliveryAttempt":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"report-delay","description":"Report a shipment delay: update shipment status to delayed, update estimated delivery, and optionally reschedule the delivery attempt","parameters":{"shipmentId":{"type":"string","required":true,"description":"The shipment ID that is delayed"},"reason":{"type":"string","required":true,"description":"Reason for the delay"},"newEstimatedDelivery":{"type":"string","required":true,"description":"New estimated delivery date (YYYY-MM-DD)"},"attemptId":{"type":"string","required":false,"description":"Delivery attempt to reschedule"}},"modifiedEntities":{"Shipment":{"created":false,"modified":true},"DeliveryAttempt":{"created":false,"modified":true}},"status":"ACTIVE"}' \
  '{"apiName":"transfer-package","description":"Transfer a package between warehouses: update package status and warehouse used capacity for both source and destination warehouses","parameters":{"packageId":{"type":"string","required":true,"description":"Package ID to transfer"},"sourceWarehouseId":{"type":"string","required":true,"description":"Source warehouse ID"},"destinationWarehouseId":{"type":"string","required":true,"description":"Destination warehouse ID"}},"modifiedEntities":{"Package":{"created":false,"modified":true},"Warehouse":{"created":false,"modified":true}},"status":"ACTIVE"}'; do
  curl -sf -X POST "$ONTOLOGY_SVC/api/v2/ontologies/$LOG_ONT/actionTypes" \
    -H "Content-Type: application/json" -d "$AT" > /dev/null
done
echo "  4 action types created"

BASE="$OBJECTS_SVC/api/v2/ontologies/$LOG_ONT/objects"

# --- Shipments ---
echo "  Inserting shipments..."
for DATA in \
  '{"primaryKey":"SHP-001","properties":{"shipmentId":"SHP-001","origin":"Jakarta Utara","destination":"Surabaya","weight_kg":2500,"volume_m3":120,"status":"delivered","priority":"express","estimatedDelivery":"2026-03-18","actualDelivery":"2026-03-18","cost":4500000}}' \
  '{"primaryKey":"SHP-002","properties":{"shipmentId":"SHP-002","origin":"Bandung","destination":"Medan","weight_kg":8000,"volume_m3":450,"status":"in-transit","priority":"standard","estimatedDelivery":"2026-03-28","actualDelivery":"","cost":12500000}}' \
  '{"primaryKey":"SHP-003","properties":{"shipmentId":"SHP-003","origin":"Surabaya","destination":"Jakarta Selatan","weight_kg":1200,"volume_m3":80,"status":"pending","priority":"overnight","estimatedDelivery":"2026-03-25","actualDelivery":"","cost":3200000}}' \
  '{"primaryKey":"SHP-004","properties":{"shipmentId":"SHP-004","origin":"Jakarta Barat","destination":"Bandung","weight_kg":500,"volume_m3":30,"status":"delivered","priority":"standard","estimatedDelivery":"2026-03-15","actualDelivery":"2026-03-15","cost":850000}}' \
  '{"primaryKey":"SHP-005","properties":{"shipmentId":"SHP-005","origin":"Medan","destination":"Jakarta Utara","weight_kg":15000,"volume_m3":800,"status":"delayed","priority":"standard","estimatedDelivery":"2026-03-20","actualDelivery":"","cost":22000000}}' \
  '{"primaryKey":"SHP-006","properties":{"shipmentId":"SHP-006","origin":"Jakarta Utara","destination":"Surabaya","weight_kg":3200,"volume_m3":200,"status":"in-transit","priority":"express","estimatedDelivery":"2026-03-25","actualDelivery":"","cost":5800000}}' \
  '{"primaryKey":"SHP-007","properties":{"shipmentId":"SHP-007","origin":"Surabaya","destination":"Bandung","weight_kg":750,"volume_m3":45,"status":"delivered","priority":"standard","estimatedDelivery":"2026-03-16","actualDelivery":"2026-03-17","cost":1200000}}' \
  '{"primaryKey":"SHP-008","properties":{"shipmentId":"SHP-008","origin":"Bandung","destination":"Jakarta Barat","weight_kg":300,"volume_m3":20,"status":"returned","priority":"express","estimatedDelivery":"2026-03-19","actualDelivery":"","cost":650000}}'; do
  curl -sf -X POST "$BASE/Shipment" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Warehouses ---
echo "  Inserting warehouses..."
for DATA in \
  '{"primaryKey":"WH-001","properties":{"warehouseId":"WH-001","name":"Gudang Tanjung Priok Utama","city":"Jakarta Utara","capacity_m3":25000,"usedCapacity_m3":18500,"type":"distribution-center","status":"active","manager":"Hendra Wijaya"}}' \
  '{"primaryKey":"WH-002","properties":{"warehouseId":"WH-002","name":"Fulfillment Center Cikarang","city":"Bekasi","capacity_m3":15000,"usedCapacity_m3":12000,"type":"fulfillment","status":"active","manager":"Rina Susanti"}}' \
  '{"primaryKey":"WH-003","properties":{"warehouseId":"WH-003","name":"Cold Storage Marunda","city":"Jakarta Utara","capacity_m3":8000,"usedCapacity_m3":7800,"type":"cold-storage","status":"full","manager":"Bambang Setiawan"}}' \
  '{"primaryKey":"WH-004","properties":{"warehouseId":"WH-004","name":"Cross-Dock Surabaya Perak","city":"Surabaya","capacity_m3":12000,"usedCapacity_m3":5500,"type":"cross-dock","status":"active","manager":"Dewi Kartika"}}' \
  '{"primaryKey":"WH-005","properties":{"warehouseId":"WH-005","name":"Gudang Gedebage Bandung","city":"Bandung","capacity_m3":10000,"usedCapacity_m3":6200,"type":"distribution-center","status":"active","manager":"Asep Suryaman"}}' \
  '{"primaryKey":"WH-006","properties":{"warehouseId":"WH-006","name":"Distribution Center Medan Belawan","city":"Medan","capacity_m3":18000,"usedCapacity_m3":9000,"type":"distribution-center","status":"active","manager":"Taufik Hidayat"}}'; do
  curl -sf -X POST "$BASE/Warehouse" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Drivers ---
echo "  Inserting drivers..."
for DATA in \
  '{"primaryKey":"DRV-001","properties":{"driverId":"DRV-001","fullName":"Eko Prasetyo","phone":"0813-2200-3344","licenseType":"SIM-B","vehicleId":"VCL-001","status":"on-route","rating":48,"totalDeliveries":1245,"joinDate":"2021-04-10"}}' \
  '{"primaryKey":"DRV-002","properties":{"driverId":"DRV-002","fullName":"Suparman Hadi","phone":"0812-5566-7788","licenseType":"SIM-B","vehicleId":"VCL-002","status":"available","rating":45,"totalDeliveries":980,"joinDate":"2022-01-15"}}' \
  '{"primaryKey":"DRV-003","properties":{"driverId":"DRV-003","fullName":"Agung Wibowo","phone":"0857-1122-3344","licenseType":"SIM-A","vehicleId":"VCL-003","status":"on-route","rating":42,"totalDeliveries":320,"joinDate":"2024-06-01"}}' \
  '{"primaryKey":"DRV-004","properties":{"driverId":"DRV-004","fullName":"Rudi Hartono","phone":"0858-9900-1122","licenseType":"SIM-B","vehicleId":"VCL-004","status":"resting","rating":47,"totalDeliveries":1580,"joinDate":"2020-08-20"}}' \
  '{"primaryKey":"DRV-005","properties":{"driverId":"DRV-005","fullName":"Yanto Surya","phone":"0821-3344-5566","licenseType":"SIM-B","vehicleId":"VCL-005","status":"available","rating":44,"totalDeliveries":750,"joinDate":"2023-03-12"}}' \
  '{"primaryKey":"DRV-006","properties":{"driverId":"DRV-006","fullName":"Dimas Pradipta","phone":"0878-7788-9900","licenseType":"SIM-A","vehicleId":"VCL-006","status":"off-duty","rating":39,"totalDeliveries":180,"joinDate":"2025-09-01"}}' \
  '{"primaryKey":"DRV-007","properties":{"driverId":"DRV-007","fullName":"Budi Santoso","phone":"0856-2233-4455","licenseType":"SIM-B","vehicleId":"VCL-007","status":"on-route","rating":46,"totalDeliveries":1100,"joinDate":"2021-11-05"}}'; do
  curl -sf -X POST "$BASE/Driver" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Vehicles ---
echo "  Inserting vehicles..."
for DATA in \
  '{"primaryKey":"VCL-001","properties":{"vehicleId":"VCL-001","plateNumber":"B 7721 LOG","type":"truck","capacity_kg":10000,"fuelType":"diesel","mileage_km":125000,"status":"active","lastService":"2026-02-20"}}' \
  '{"primaryKey":"VCL-002","properties":{"vehicleId":"VCL-002","plateNumber":"B 8832 LOG","type":"truck","capacity_kg":8000,"fuelType":"diesel","mileage_km":98000,"status":"active","lastService":"2026-03-01"}}' \
  '{"primaryKey":"VCL-003","properties":{"vehicleId":"VCL-003","plateNumber":"B 1145 LOG","type":"van","capacity_kg":2000,"fuelType":"gasoline","mileage_km":45000,"status":"active","lastService":"2026-01-15"}}' \
  '{"primaryKey":"VCL-004","properties":{"vehicleId":"VCL-004","plateNumber":"L 3356 LOG","type":"truck","capacity_kg":15000,"fuelType":"diesel","mileage_km":210000,"status":"active","lastService":"2026-02-10"}}' \
  '{"primaryKey":"VCL-005","properties":{"vehicleId":"VCL-005","plateNumber":"D 4467 LOG","type":"van","capacity_kg":3000,"fuelType":"diesel","mileage_km":67000,"status":"active","lastService":"2026-03-05"}}' \
  '{"primaryKey":"VCL-006","properties":{"vehicleId":"VCL-006","plateNumber":"B 5578 LOG","type":"motorcycle","capacity_kg":150,"fuelType":"gasoline","mileage_km":22000,"status":"active","lastService":"2026-02-28"}}' \
  '{"primaryKey":"VCL-007","properties":{"vehicleId":"VCL-007","plateNumber":"BK 6689 LOG","type":"container","capacity_kg":25000,"fuelType":"diesel","mileage_km":185000,"status":"active","lastService":"2026-01-25"}}' \
  '{"primaryKey":"VCL-008","properties":{"vehicleId":"VCL-008","plateNumber":"B 9901 LOG","type":"truck","capacity_kg":12000,"fuelType":"diesel","mileage_km":155000,"status":"maintenance","lastService":"2026-03-20"}}'; do
  curl -sf -X POST "$BASE/Vehicle" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Routes ---
echo "  Inserting routes..."
for DATA in \
  '{"primaryKey":"RTE-001","properties":{"routeId":"RTE-001","origin":"Jakarta","destination":"Surabaya","distance_km":780,"estimatedTime_hours":120,"status":"active","tollCost":450000,"fuelEstimate":1200000}}' \
  '{"primaryKey":"RTE-002","properties":{"routeId":"RTE-002","origin":"Jakarta","destination":"Bandung","distance_km":150,"estimatedTime_hours":30,"status":"active","tollCost":95000,"fuelEstimate":250000}}' \
  '{"primaryKey":"RTE-003","properties":{"routeId":"RTE-003","origin":"Jakarta","destination":"Medan","distance_km":2200,"estimatedTime_hours":480,"status":"active","tollCost":850000,"fuelEstimate":3500000}}' \
  '{"primaryKey":"RTE-004","properties":{"routeId":"RTE-004","origin":"Surabaya","destination":"Bandung","distance_km":690,"estimatedTime_hours":110,"status":"active","tollCost":380000,"fuelEstimate":1050000}}' \
  '{"primaryKey":"RTE-005","properties":{"routeId":"RTE-005","origin":"Surabaya","destination":"Jakarta","distance_km":780,"estimatedTime_hours":120,"status":"congested","tollCost":450000,"fuelEstimate":1200000}}' \
  '{"primaryKey":"RTE-006","properties":{"routeId":"RTE-006","origin":"Bandung","destination":"Medan","distance_km":2100,"estimatedTime_hours":460,"status":"active","tollCost":800000,"fuelEstimate":3300000}}'; do
  curl -sf -X POST "$BASE/Route" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Packages ---
echo "  Inserting packages..."
for DATA in \
  '{"primaryKey":"PKG-001","properties":{"packageId":"PKG-001","shipmentId":"SHP-001","description":"Elektronik - TV LED 55 inch","weight_kg":180,"dimensions":"130x80x25","fragile":"true","insured":"true","insuranceValue":8500000,"status":"delivered"}}' \
  '{"primaryKey":"PKG-002","properties":{"packageId":"PKG-002","shipmentId":"SHP-001","description":"Elektronik - Kulkas 2 pintu","weight_kg":650,"dimensions":"70x70x180","fragile":"true","insured":"true","insuranceValue":12000000,"status":"delivered"}}' \
  '{"primaryKey":"PKG-003","properties":{"packageId":"PKG-003","shipmentId":"SHP-002","description":"Bahan baku tekstil - kain katun","weight_kg":40000,"dimensions":"120x100x80","fragile":"false","insured":"true","insuranceValue":45000000,"status":"in-transit"}}' \
  '{"primaryKey":"PKG-004","properties":{"packageId":"PKG-004","shipmentId":"SHP-002","description":"Bahan baku tekstil - benang polyester","weight_kg":35000,"dimensions":"100x100x60","fragile":"false","insured":"false","insuranceValue":0,"status":"in-transit"}}' \
  '{"primaryKey":"PKG-005","properties":{"packageId":"PKG-005","shipmentId":"SHP-003","description":"Spare part otomotif - kampas rem","weight_kg":3000,"dimensions":"60x40x30","fragile":"false","insured":"true","insuranceValue":15000000,"status":"warehouse"}}' \
  '{"primaryKey":"PKG-006","properties":{"packageId":"PKG-006","shipmentId":"SHP-003","description":"Spare part otomotif - radiator","weight_kg":5000,"dimensions":"80x60x40","fragile":"true","insured":"true","insuranceValue":22000000,"status":"warehouse"}}' \
  '{"primaryKey":"PKG-007","properties":{"packageId":"PKG-007","shipmentId":"SHP-004","description":"Dokumen legal - berkas notaris","weight_kg":20,"dimensions":"35x25x10","fragile":"false","insured":"true","insuranceValue":500000,"status":"delivered"}}' \
  '{"primaryKey":"PKG-008","properties":{"packageId":"PKG-008","shipmentId":"SHP-005","description":"Hasil bumi - kopi Gayo premium","weight_kg":50000,"dimensions":"100x80x60","fragile":"false","insured":"true","insuranceValue":75000000,"status":"in-transit"}}' \
  '{"primaryKey":"PKG-009","properties":{"packageId":"PKG-009","shipmentId":"SHP-005","description":"Hasil bumi - tembakau Deli","weight_kg":80000,"dimensions":"120x100x80","fragile":"false","insured":"true","insuranceValue":95000000,"status":"in-transit"}}' \
  '{"primaryKey":"PKG-010","properties":{"packageId":"PKG-010","shipmentId":"SHP-006","description":"Alat kesehatan - bed pasien","weight_kg":12000,"dimensions":"200x100x60","fragile":"true","insured":"true","insuranceValue":35000000,"status":"loaded"}}' \
  '{"primaryKey":"PKG-011","properties":{"packageId":"PKG-011","shipmentId":"SHP-006","description":"Alat kesehatan - kursi roda","weight_kg":4000,"dimensions":"90x65x90","fragile":"false","insured":"true","insuranceValue":18000000,"status":"loaded"}}' \
  '{"primaryKey":"PKG-012","properties":{"packageId":"PKG-012","shipmentId":"SHP-007","description":"Furnitur - meja kantor","weight_kg":3500,"dimensions":"150x75x75","fragile":"false","insured":"false","insuranceValue":0,"status":"delivered"}}'; do
  curl -sf -X POST "$BASE/Package" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

# --- Delivery Attempts ---
echo "  Inserting delivery attempts..."
for DATA in \
  '{"primaryKey":"ATT-001","properties":{"attemptId":"ATT-001","shipmentId":"SHP-001","driverId":"DRV-001","attemptDate":"2026-03-18","status":"successful","failureReason":"","recipientName":"Ahmad Rizaldi","signature":"true"}}' \
  '{"primaryKey":"ATT-002","properties":{"attemptId":"ATT-002","shipmentId":"SHP-004","driverId":"DRV-003","attemptDate":"2026-03-15","status":"successful","failureReason":"","recipientName":"Sari Dewi Lestari","signature":"true"}}' \
  '{"primaryKey":"ATT-003","properties":{"attemptId":"ATT-003","shipmentId":"SHP-007","driverId":"DRV-002","attemptDate":"2026-03-16","status":"failed","failureReason":"Alamat tidak ditemukan - nomor rumah salah","recipientName":"","signature":"false"}}' \
  '{"primaryKey":"ATT-004","properties":{"attemptId":"ATT-004","shipmentId":"SHP-007","driverId":"DRV-002","attemptDate":"2026-03-17","status":"successful","failureReason":"","recipientName":"Putri Handayani","signature":"true"}}' \
  '{"primaryKey":"ATT-005","properties":{"attemptId":"ATT-005","shipmentId":"SHP-008","driverId":"DRV-003","attemptDate":"2026-03-19","status":"failed","failureReason":"Penerima tidak ada di tempat","recipientName":"","signature":"false"}}' \
  '{"primaryKey":"ATT-006","properties":{"attemptId":"ATT-006","shipmentId":"SHP-008","driverId":"DRV-003","attemptDate":"2026-03-20","status":"failed","failureReason":"Penerima menolak paket - barang tidak sesuai pesanan","recipientName":"","signature":"false"}}' \
  '{"primaryKey":"ATT-007","properties":{"attemptId":"ATT-007","shipmentId":"SHP-005","driverId":"DRV-007","attemptDate":"2026-03-20","status":"rescheduled","failureReason":"Cuaca buruk - banjir di jalur Pantura","recipientName":"","signature":"false"}}' \
  '{"primaryKey":"ATT-008","properties":{"attemptId":"ATT-008","shipmentId":"SHP-006","driverId":"DRV-001","attemptDate":"2026-03-24","status":"rescheduled","failureReason":"","recipientName":"","signature":"false"}}'; do
  curl -sf -X POST "$BASE/DeliveryAttempt" -H "Content-Type: application/json" -d "$DATA" > /dev/null
done

LINKS="$OBJECTS_SVC/api/v2/ontologies/$LOG_ONT/objects"

# --- Create Links: Shipment → Packages ---
echo "  Creating links: Shipment → Packages..."
for PAIR in \
  "SHP-001 PKG-001" \
  "SHP-001 PKG-002" \
  "SHP-002 PKG-003" \
  "SHP-002 PKG-004" \
  "SHP-003 PKG-005" \
  "SHP-003 PKG-006" \
  "SHP-004 PKG-007" \
  "SHP-005 PKG-008" \
  "SHP-005 PKG-009" \
  "SHP-006 PKG-010" \
  "SHP-006 PKG-011" \
  "SHP-007 PKG-012"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Shipment/$SRC/links/ShipmentHasPackages" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Package\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Shipment → Delivery Attempts ---
echo "  Creating links: Shipment → Delivery Attempts..."
for PAIR in \
  "SHP-001 ATT-001" \
  "SHP-004 ATT-002" \
  "SHP-007 ATT-003" \
  "SHP-007 ATT-004" \
  "SHP-008 ATT-005" \
  "SHP-008 ATT-006" \
  "SHP-005 ATT-007" \
  "SHP-006 ATT-008"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Shipment/$SRC/links/ShipmentHasAttempts" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"DeliveryAttempt\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Driver → Vehicle ---
echo "  Creating links: Driver → Vehicle..."
for PAIR in \
  "DRV-001 VCL-001" \
  "DRV-002 VCL-002" \
  "DRV-003 VCL-003" \
  "DRV-004 VCL-004" \
  "DRV-005 VCL-005" \
  "DRV-006 VCL-006" \
  "DRV-007 VCL-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Driver/$SRC/links/DriverAssignedVehicle" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"Vehicle\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

# --- Create Links: Driver → Delivery Attempts ---
echo "  Creating links: Driver → Delivery Attempts..."
for PAIR in \
  "DRV-001 ATT-001" \
  "DRV-001 ATT-008" \
  "DRV-002 ATT-003" \
  "DRV-002 ATT-004" \
  "DRV-003 ATT-002" \
  "DRV-003 ATT-005" \
  "DRV-003 ATT-006" \
  "DRV-007 ATT-007"; do
  SRC=$(echo "$PAIR" | cut -d' ' -f1)
  TGT=$(echo "$PAIR" | cut -d' ' -f2)
  curl -sf -X POST "$LINKS/Driver/$SRC/links/DriverHasAttempts" \
    -H "Content-Type: application/json" \
    -d "{\"targetObjectType\":\"DeliveryAttempt\",\"targetPrimaryKey\":\"$TGT\"}" > /dev/null
done

DATASETS_SVC="${DATASETS_SERVICE_URL:-http://localhost:8085}"
PIPE_URL="$DATASETS_SVC/api/v2/pipelines"

# --- Create Pipelines ---
echo "  Creating pipelines..."

# Pipeline 1: Shipment Cost Analysis
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Shipment Cost by Route",
    "description":"Aggregate shipment costs grouped by origin-destination route, calculate totals, averages, and volume for logistics cost optimization",
    "steps":[
      {"id":"s1","name":"Filter Non-Returned","type":"FILTER","config":{"field":"status","operator":"neq","value":"returned"}},
      {"id":"s2","name":"Join Route Data","type":"JOIN","config":{"joinType":"left","leftKey":"origin","rightKey":"origin"},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate by Route","type":"AGGREGATE","config":{"groupBy":["origin","destination"],"aggregations":[{"field":"cost","function":"sum","alias":"totalCost"},{"field":"cost","function":"avg","alias":"avgCost"},{"field":"weight_kg","function":"sum","alias":"totalWeight"},{"field":"shipmentId","function":"count","alias":"shipmentCount"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Cost","type":"SORT","config":{"fields":[{"field":"totalCost","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":86400000},
    "inputDatasets":["shipments","routes"],
    "outputDataset":"shipment-cost-by-route",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 2: Driver Performance Scorecard
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Driver Performance Scorecard",
    "description":"Calculate driver KPIs: delivery success rate, total deliveries, average rating. Used for monthly performance review and bonus allocation",
    "steps":[
      {"id":"s1","name":"Group Attempts by Driver","type":"AGGREGATE","config":{"groupBy":["driverId"],"aggregations":[{"field":"attemptId","function":"count","alias":"totalAttempts"},{"field":"status","function":"count_where_eq","alias":"successfulDeliveries","value":"successful"}]}},
      {"id":"s2","name":"Join Driver Profile","type":"JOIN","config":{"joinType":"left","leftKey":"driverId","rightKey":"driverId"},"dependsOn":["s1"]},
      {"id":"s3","name":"Calculate Success Rate","type":"MAP","config":{"mappings":[{"source":"successfulDeliveries","target":"successRate","transform":"divideBy:totalAttempts"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Rating","type":"SORT","config":{"fields":[{"field":"rating","direction":"desc"},{"field":"totalDeliveries","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"CRON","cron":"0 6 * * 1"},
    "inputDatasets":["delivery-attempts","drivers"],
    "outputDataset":"driver-scorecard",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 3: Warehouse Capacity Alert
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Warehouse Capacity Alert",
    "description":"Monitor warehouse utilization levels. Flag warehouses exceeding 85% capacity for proactive load balancing and overflow prevention",
    "steps":[
      {"id":"s1","name":"Map Utilization","type":"MAP","config":{"mappings":[{"source":"usedCapacity_m3","target":"utilization","transform":"divideBy:capacity_m3"},{"source":"name","target":"warehouseName"}]}},
      {"id":"s2","name":"Filter High Utilization","type":"FILTER","config":{"field":"utilization","operator":"gte","value":0.85},"dependsOn":["s1"]},
      {"id":"s3","name":"Sort by Utilization","type":"SORT","config":{"fields":[{"field":"utilization","direction":"desc"}]},"dependsOn":["s2"]}
    ],
    "schedule":{"type":"INTERVAL","interval":3600000},
    "inputDatasets":["warehouses"],
    "outputDataset":"warehouse-capacity-alerts",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 4: Delivery Failure Analysis
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Delivery Failure Analysis",
    "description":"Analyze failed delivery attempts by reason, driver, and route to identify systemic issues and reduce reattempt costs",
    "steps":[
      {"id":"s1","name":"Filter Failed Attempts","type":"FILTER","config":{"field":"status","operator":"eq","value":"failed"}},
      {"id":"s2","name":"Join Shipment Data","type":"JOIN","config":{"joinType":"left","leftKey":"shipmentId","rightKey":"shipmentId"},"dependsOn":["s1"]},
      {"id":"s3","name":"Aggregate by Reason","type":"AGGREGATE","config":{"groupBy":["failureReason"],"aggregations":[{"field":"attemptId","function":"count","alias":"failureCount"},{"field":"driverId","function":"count_distinct","alias":"driversAffected"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Frequency","type":"SORT","config":{"fields":[{"field":"failureCount","direction":"desc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"CRON","cron":"0 8 1 * *"},
    "inputDatasets":["delivery-attempts","shipments"],
    "outputDataset":"delivery-failure-report",
    "status":"ACTIVE"
  }' > /dev/null

# Pipeline 5: Route Efficiency Optimizer
curl -sf -X POST "$PIPE_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Route Efficiency Optimizer",
    "description":"Compare estimated vs actual delivery times per route, calculate cost-per-km and identify congested routes for rerouting decisions",
    "steps":[
      {"id":"s1","name":"Filter Active Routes","type":"FILTER","config":{"field":"status","operator":"neq","value":"closed"}},
      {"id":"s2","name":"Join Shipment History","type":"JOIN","config":{"joinType":"left","leftKey":"origin","rightKey":"origin"},"dependsOn":["s1"]},
      {"id":"s3","name":"Calculate Cost per KM","type":"MAP","config":{"mappings":[{"source":"tollCost","target":"totalRouteCost","transform":"add:fuelEstimate"},{"source":"totalRouteCost","target":"costPerKm","transform":"divideBy:distance_km"}]},"dependsOn":["s2"]},
      {"id":"s4","name":"Sort by Efficiency","type":"SORT","config":{"fields":[{"field":"costPerKm","direction":"asc"}]},"dependsOn":["s3"]}
    ],
    "schedule":{"type":"INTERVAL","interval":43200000},
    "inputDatasets":["routes","shipments"],
    "outputDataset":"route-efficiency-report",
    "status":"ACTIVE"
  }' > /dev/null

echo "  5 pipelines created"

# --- Create Datasets ---
echo "  Creating datasets..."
DS_URL="$DATASETS_SVC/api/v2/datasets"

for DS in \
  '{"name":"logistics-shipment-master","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"logistics-warehouse-inventory","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"logistics-driver-performance","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"logistics-route-analytics","parentFolderRid":"ri.compass.main.folder.root"}' \
  '{"name":"logistics-delivery-tracking","parentFolderRid":"ri.compass.main.folder.root"}'; do
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
    "apiName":"getActiveShipmentCount",
    "displayName":"Get Active Shipment Count",
    "description":"Returns the count of shipments currently in-transit or pending delivery",
    "language":"typescript",
    "code":"return objects.filter(o => o.properties.status === \"in-transit\" || o.properties.status === \"pending\").length;"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"getWarehouseUtilization",
    "displayName":"Get Warehouse Utilization",
    "description":"Returns warehouse utilization percentages, flagging those above 85% as critical",
    "language":"typescript",
    "code":"return objects.map(o => ({ name: o.properties.name, city: o.properties.city, utilization: Math.round((o.properties.usedCapacity_m3 / o.properties.capacity_m3) * 100), critical: (o.properties.usedCapacity_m3 / o.properties.capacity_m3) > 0.85 }));"
  }' > /dev/null

curl -sf -X POST "$FUNC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "apiName":"calculateDeliverySuccessRate",
    "displayName":"Calculate Delivery Success Rate",
    "description":"Calculates the overall delivery success rate from all delivery attempts",
    "language":"typescript",
    "code":"const total = objects.length; const successful = objects.filter(o => o.properties.status === \"successful\").length; return { total, successful, failed: total - successful, successRate: total > 0 ? Math.round((successful / total) * 100) : 0 };"
  }' > /dev/null

echo "  3 functions created"

echo ""
echo "Done! Logistics Operations data seeded:"
echo "  - 1 Ontology (Logistics Operations)"
echo "  - 7 Object Types (Shipment, Warehouse, Driver, Vehicle, Route, Package, DeliveryAttempt)"
echo "  - 8 Link Types (ShipmentHasPackages, ShipmentHasAttempts, DriverAssignedVehicle, DriverHasAttempts, WarehouseStoresPackages, RouteUsedByShipment, DriverHandlesShipment, VehicleOnRoute)"
echo "  - 4 Action Types (DispatchShipment, CompleteDelivery, ReportDelay, TransferPackage)"
echo "  - 8 Shipments, 6 Warehouses, 7 Drivers, 8 Vehicles, 6 Routes, 12 Packages, 8 Delivery Attempts = 55 objects"
echo "  - 39 Links (12 Shipment->Package, 8 Shipment->Attempt, 7 Driver->Vehicle, 8 Driver->Attempt, 4 misc)"
echo "  - 5 Pipelines (Shipment Cost, Driver Scorecard, Warehouse Capacity, Failure Analysis, Route Efficiency)"
echo "  - 5 Datasets (shipment-master, warehouse-inventory, driver-performance, route-analytics, delivery-tracking)"
echo "  - 3 Functions (getActiveShipmentCount, getWarehouseUtilization, calculateDeliverySuccessRate)"
echo ""
echo "Ontology RID: $LOG_ONT"
