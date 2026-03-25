import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Callout,
  Card,
  Collapse,
  Colors,
  Elevation,
  HTMLTable,
  Icon,
  Intent,
  ProgressBar,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OntologyListResponse {
  data: Array<{ rid: string; apiName: string; displayName: string }>;
}

interface ObjectTypeMetadata {
  apiName: string;
  displayName?: string;
  properties: Record<string, { type: string; displayName?: string }>;
  primaryKey: string;
}

interface FullMetadataResponse {
  objectTypes: ObjectTypeMetadata[];
}

interface OntologyObject {
  rid: string;
  objectType: string;
  primaryKey: string;
  properties: Record<string, unknown>;
}

interface LoadObjectsResponse {
  data: OntologyObject[];
  totalCount: number;
}

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  score: number;
  details: string;
  impact: string;
}

interface HealthIssue {
  severity: "Critical" | "Warning" | "Info";
  objectType: string;
  description: string;
  action: string;
}

interface ObjectTypeHealth {
  apiName: string;
  displayName: string;
  count: number;
  score: number;
  checks: HealthCheck[];
  issues: HealthIssue[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OBJECT_TYPES = [
  "Customer",
  "Technician",
  "ServiceJob",
  "TreatmentProduct",
  "Invoice",
  "Vehicle",
  "Schedule",
];

const REQUIRED_FIELDS: Record<string, string[]> = {
  Customer: ["customerId", "fullName", "email", "phone", "status"],
  Technician: ["technicianId", "fullName", "email", "specialization", "status"],
  ServiceJob: ["jobId", "customerId", "technicianId", "status", "serviceType", "scheduledDate"],
  TreatmentProduct: ["productId", "productName", "category", "unitPrice", "stockQty"],
  Invoice: ["invoiceId", "jobId", "customerId", "totalAmount", "status"],
  Vehicle: ["vehicleId", "plateNumber", "type", "status"],
  Schedule: ["scheduleId", "technicianId", "jobId", "scheduledDate", "status"],
};

const DATE_FIELDS: Record<string, string[]> = {
  Customer: ["joinDate"],
  Technician: ["joinDate"],
  ServiceJob: ["scheduledDate", "completedDate"],
  TreatmentProduct: [],
  Invoice: ["issueDate", "dueDate"],
  Vehicle: [],
  Schedule: ["scheduledDate"],
};

const NUMERIC_RANGES: Record<string, Record<string, [number, number]>> = {
  Customer: { rating: [1, 50] },
  Technician: { rating: [1, 50], yearsExperience: [0, 50] },
  ServiceJob: { estimatedCost: [0, 100000], actualCost: [0, 100000] },
  TreatmentProduct: { unitPrice: [0, 10000], stockQty: [0, 100000], minStockLevel: [0, 1000] },
  Invoice: { totalAmount: [0, 500000] },
  Vehicle: { mileage: [0, 1000000] },
  Schedule: {},
};

const REF_INTEGRITY: Record<string, Record<string, string>> = {
  ServiceJob: { customerId: "Customer", technicianId: "Technician" },
  Invoice: { jobId: "ServiceJob", customerId: "Customer" },
  Schedule: { technicianId: "Technician", jobId: "ServiceJob" },
  Vehicle: {},
  Customer: {},
  Technician: {},
  TreatmentProduct: {},
};

const AUTO_REFRESH_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreToIntent(score: number): Intent {
  if (score >= 80) return Intent.SUCCESS;
  if (score >= 60) return Intent.WARNING;
  return Intent.DANGER;
}

function scoreToColor(score: number): string {
  if (score >= 80) return Colors.GREEN3;
  if (score >= 60) return Colors.ORANGE3;
  return Colors.RED3;
}

function severityToIntent(sev: HealthIssue["severity"]): Intent {
  if (sev === "Critical") return Intent.DANGER;
  if (sev === "Warning") return Intent.WARNING;
  return Intent.PRIMARY;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

async function fetchOntologyRid(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as OntologyListResponse;
  return data.data[0]?.rid ?? "";
}

async function fetchMetadata(rid: string): Promise<ObjectTypeMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ontologies/${rid}/fullMetadata`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as FullMetadataResponse;
  return data.objectTypes ?? [];
}

async function fetchAllObjects(
  rid: string,
  objectType: string,
): Promise<OntologyObject[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/v2/ontologies/${rid}/objectSets/loadObjects`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectSet: { type: "base", objectType },
        pageSize: 500,
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as LoadObjectsResponse;
  return data.data ?? [];
}

/* ------------------------------------------------------------------ */
/*  Health-check engine                                                */
/* ------------------------------------------------------------------ */

function runChecks(
  apiName: string,
  objects: OntologyObject[],
  allObjectsByType: Record<string, OntologyObject[]>,
): { checks: HealthCheck[]; issues: HealthIssue[] } {
  const checks: HealthCheck[] = [];
  const issues: HealthIssue[] = [];
  const total = objects.length;
  if (total === 0) {
    checks.push({ name: "Completeness", status: "warn", score: 0, details: "No objects found", impact: "Cannot evaluate" });
    return { checks, issues };
  }

  // 1. Completeness
  const required = REQUIRED_FIELDS[apiName] ?? [];
  let completeCount = 0;
  for (const obj of objects) {
    const allPresent = required.every((f) => !isEmpty(obj.properties[f]));
    if (allPresent) completeCount++;
    else {
      const missing = required.filter((f) => isEmpty(obj.properties[f]));
      if (missing.length > 0) {
        issues.push({
          severity: "Warning",
          objectType: apiName,
          description: `${apiName} ${obj.primaryKey}: missing fields — ${missing.join(", ")}`,
          action: "Populate missing required fields",
        });
      }
    }
  }
  const completenessScore = Math.round((completeCount / total) * 100);
  checks.push({
    name: "Completeness",
    status: completenessScore >= 90 ? "pass" : completenessScore >= 70 ? "warn" : "fail",
    score: completenessScore,
    details: `${completeCount}/${total} objects have all required fields`,
    impact: completenessScore < 90 ? "Incomplete records may cause downstream errors" : "None",
  });

  // 2. Freshness
  const dateFields = DATE_FIELDS[apiName] ?? [];
  if (dateFields.length > 0) {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    let freshCount = 0;
    for (const obj of objects) {
      const hasFresh = dateFields.some((f) => {
        const val = obj.properties[f];
        if (typeof val === "string" && val) {
          return new Date(val).getTime() > ninetyDaysAgo;
        }
        return false;
      });
      if (hasFresh) freshCount++;
    }
    const freshnessScore = Math.round((freshCount / total) * 100);
    checks.push({
      name: "Freshness",
      status: freshnessScore >= 80 ? "pass" : freshnessScore >= 50 ? "warn" : "fail",
      score: freshnessScore,
      details: `${freshCount}/${total} objects have dates within last 90 days`,
      impact: freshnessScore < 80 ? "Stale data may not reflect current state" : "None",
    });
  } else {
    checks.push({ name: "Freshness", status: "pass", score: 100, details: "No date fields to check", impact: "None" });
  }

  // 3. Consistency (referential integrity)
  const refs = REF_INTEGRITY[apiName] ?? {};
  const refKeys = Object.keys(refs);
  if (refKeys.length > 0) {
    let validRefCount = 0;
    let totalRefs = 0;
    for (const obj of objects) {
      for (const fk of refKeys) {
        const fkVal = obj.properties[fk];
        if (isEmpty(fkVal)) continue;
        totalRefs++;
        const targetType = refs[fk];
        const targetObjects = allObjectsByType[targetType] ?? [];
        const found = targetObjects.some((t) => t.primaryKey === String(fkVal));
        if (found) {
          validRefCount++;
        } else {
          issues.push({
            severity: "Critical",
            objectType: apiName,
            description: `${apiName} ${obj.primaryKey}: ${fk} "${fkVal}" does not match any ${targetType}`,
            action: `Verify ${fk} references a valid ${targetType}`,
          });
        }
      }
    }
    const consistencyScore = totalRefs > 0 ? Math.round((validRefCount / totalRefs) * 100) : 100;
    checks.push({
      name: "Consistency",
      status: consistencyScore >= 95 ? "pass" : consistencyScore >= 80 ? "warn" : "fail",
      score: consistencyScore,
      details: `${validRefCount}/${totalRefs} foreign key references valid`,
      impact: consistencyScore < 95 ? "Broken references cause join failures" : "None",
    });
  } else {
    checks.push({ name: "Consistency", status: "pass", score: 100, details: "No foreign keys to check", impact: "None" });
  }

  // 4. Range
  const ranges = NUMERIC_RANGES[apiName] ?? {};
  const rangeKeys = Object.keys(ranges);
  if (rangeKeys.length > 0) {
    let inRangeCount = 0;
    let totalRangeChecks = 0;
    for (const obj of objects) {
      for (const field of rangeKeys) {
        const val = obj.properties[field];
        if (isEmpty(val)) continue;
        const num = Number(val);
        if (!Number.isFinite(num)) continue;
        totalRangeChecks++;
        const [min, max] = ranges[field];
        if (num >= min && num <= max) {
          inRangeCount++;
        } else {
          issues.push({
            severity: "Warning",
            objectType: apiName,
            description: `${apiName} ${obj.primaryKey}: ${field} (${num}) out of expected range [${min}, ${max}]`,
            action: `Review ${field} value`,
          });
        }
      }
    }
    const rangeScore = totalRangeChecks > 0 ? Math.round((inRangeCount / totalRangeChecks) * 100) : 100;
    checks.push({
      name: "Range",
      status: rangeScore >= 95 ? "pass" : rangeScore >= 80 ? "warn" : "fail",
      score: rangeScore,
      details: `${inRangeCount}/${totalRangeChecks} numeric values within expected range`,
      impact: rangeScore < 95 ? "Out-of-range values may indicate data entry errors" : "None",
    });
  } else {
    checks.push({ name: "Range", status: "pass", score: 100, details: "No numeric range checks configured", impact: "None" });
  }

  // 5. Uniqueness
  const primaryKeys = objects.map((o) => o.primaryKey);
  const uniqueKeys = new Set(primaryKeys);
  const uniquenessScore = Math.round((uniqueKeys.size / primaryKeys.length) * 100);
  checks.push({
    name: "Uniqueness",
    status: uniquenessScore === 100 ? "pass" : "fail",
    score: uniquenessScore,
    details: `${uniqueKeys.size}/${primaryKeys.length} primary keys are unique`,
    impact: uniquenessScore < 100 ? "Duplicate keys cause ambiguous lookups" : "None",
  });

  // Contextual issues (business logic checks)
  for (const obj of objects) {
    const props = obj.properties;

    if (apiName === "TreatmentProduct") {
      const stock = Number(props.stockQty ?? 0);
      const minStock = Number(props.minStockLevel ?? 0);
      if (stock > 0 && minStock > 0 && stock <= minStock * 2.5 && stock > minStock) {
        issues.push({
          severity: "Warning",
          objectType: apiName,
          description: `TreatmentProduct ${obj.primaryKey}: stockQty (${stock}) approaching minStockLevel (${minStock}) — Low Stock Warning`,
          action: "Consider reordering stock",
        });
      }
      if (stock > 0 && minStock > 0 && stock <= minStock) {
        issues.push({
          severity: "Critical",
          objectType: apiName,
          description: `TreatmentProduct ${obj.primaryKey}: stockQty (${stock}) at or below minStockLevel (${minStock}) — Reorder Required`,
          action: "Immediate restock needed",
        });
      }
    }

    if (apiName === "Customer") {
      const status = String(props.status ?? "").toLowerCase();
      if (status === "inactive" && isEmpty(props.contractEndDate)) {
        issues.push({
          severity: "Info",
          objectType: apiName,
          description: `Customer ${obj.primaryKey}: status is 'inactive' but has no contract end date`,
          action: "Add contract end date for inactive customers",
        });
      }
    }

    if (apiName === "ServiceJob") {
      const status = String(props.status ?? "").toLowerCase();
      if ((status === "in-progress" || status === "in_progress") && isEmpty(props.completedDate)) {
        issues.push({
          severity: "Info",
          objectType: apiName,
          description: `ServiceJob ${obj.primaryKey}: in-progress but no completedDate — Expected`,
          action: "No action needed until job completes",
        });
      }
    }

    if (apiName === "Invoice") {
      const status = String(props.status ?? "").toLowerCase();
      if (status === "overdue") {
        issues.push({
          severity: "Warning",
          objectType: apiName,
          description: `Invoice ${obj.primaryKey}: status 'overdue' — Payment follow-up needed`,
          action: "Contact customer for payment follow-up",
        });
      }
    }
  }

  return { checks, issues };
}

function computeOverallScore(checks: HealthCheck[]): number {
  if (checks.length === 0) return 0;
  const weights: Record<string, number> = {
    Completeness: 3,
    Freshness: 2,
    Consistency: 3,
    Range: 1,
    Uniqueness: 1,
  };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of checks) {
    const w = weights[c.name] ?? 1;
    totalWeight += w;
    weightedSum += c.score * w;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/* ------------------------------------------------------------------ */
/*  Circular Gauge Component                                           */
/* ------------------------------------------------------------------ */

function CircularGauge({ score, size = 160 }: { score: number; size?: number }) {
  const color = scoreToColor(score);
  const angle = (score / 100) * 360;
  const fontSize = size * 0.25;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${color} ${angle}deg, ${Colors.DARK_GRAY3} ${angle}deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size * 0.75,
          height: size * 0.75,
          borderRadius: "50%",
          backgroundColor: Colors.DARK_GRAY5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <span style={{ fontSize, fontWeight: 700, color }}>{score}%</span>
        <span style={{ fontSize: fontSize * 0.45, color: Colors.GRAY3 }}>Health</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Check Status Icon                                                  */
/* ------------------------------------------------------------------ */

function CheckStatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <Icon icon="tick-circle" intent={Intent.SUCCESS} />;
  if (status === "warn") return <Icon icon="warning-sign" intent={Intent.WARNING} />;
  return <Icon icon="error" intent={Intent.DANGER} />;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function DataHealth() {
  const [healthData, setHealthData] = useState<ObjectTypeHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  /* ---- Run all health checks ---- */
  const runAllChecks = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const rid = await fetchOntologyRid();
      if (!rid) {
        setError("No ontology found");
        setRunning(false);
        setLoading(false);
        return;
      }

      const metadata = await fetchMetadata(rid);
      const metaMap: Record<string, ObjectTypeMetadata> = {};
      for (const m of metadata) metaMap[m.apiName] = m;

      // Fetch all objects for all types in parallel
      const objectsByType: Record<string, OntologyObject[]> = {};
      await Promise.all(
        OBJECT_TYPES.map(async (ot) => {
          try {
            objectsByType[ot] = await fetchAllObjects(rid, ot);
          } catch {
            objectsByType[ot] = [];
          }
        }),
      );

      // Run checks for each type
      const results: ObjectTypeHealth[] = OBJECT_TYPES.map((ot) => {
        const objects = objectsByType[ot] ?? [];
        const { checks, issues } = runChecks(ot, objects, objectsByType);
        const score = computeOverallScore(checks);
        const meta = metaMap[ot];
        return {
          apiName: ot,
          displayName: meta?.displayName ?? ot,
          count: objects.length,
          score,
          checks,
          issues,
        };
      });

      setHealthData(results);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRunning(false);
    }
  }, []);

  /* ---- Initial load + auto-refresh ---- */
  useEffect(() => {
    void runAllChecks();
    const interval = setInterval(() => void runAllChecks(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [runAllChecks]);

  /* ---- Computed values ---- */
  const overallScore = useMemo(() => {
    if (healthData.length === 0) return 0;
    const sum = healthData.reduce((acc, h) => acc + h.score, 0);
    return Math.round(sum / healthData.length);
  }, [healthData]);

  const allIssues = useMemo(
    () => healthData.flatMap((h) => h.issues),
    [healthData],
  );

  const criticalCount = allIssues.filter((i) => i.severity === "Critical").length;
  const warningCount = allIssues.filter((i) => i.severity === "Warning").length;
  const infoCount = allIssues.filter((i) => i.severity === "Info").length;

  /* ---- Render ---- */
  if (loading && healthData.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Data Health" />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 80 }}>
          <Spinner size={50} />
        </div>
        <p style={{ textAlign: "center", color: Colors.GRAY3, marginTop: 16 }}>
          Running health checks across all object types...
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Data Health"
        actions={
          <Button
            icon="refresh"
            intent={Intent.PRIMARY}
            loading={running}
            onClick={() => void runAllChecks()}
          >
            Run All Checks
          </Button>
        }
      />

      {error && (
        <Callout intent={Intent.DANGER} icon="error" style={{ marginBottom: 16 }}>
          {error}
        </Callout>
      )}

      {/* ---- Overall Health Banner ---- */}
      <Card elevation={Elevation.TWO} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <CircularGauge score={overallScore} />

          <div style={{ flex: 1, minWidth: 200 }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Overall Data Health</h3>
            <p style={{ color: Colors.GRAY3, margin: "0 0 12px 0" }}>
              Monitoring {healthData.length} object types across {healthData.reduce((a, h) => a + h.count, 0)} total objects
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Tag large intent={Intent.DANGER} icon="error" minimal>
                {criticalCount} Critical
              </Tag>
              <Tag large intent={Intent.WARNING} icon="warning-sign" minimal>
                {warningCount} Warnings
              </Tag>
              <Tag large intent={Intent.PRIMARY} icon="info-sign" minimal>
                {infoCount} Info
              </Tag>
            </div>

            {lastChecked && (
              <p style={{ color: Colors.GRAY4, margin: "12px 0 0 0", fontSize: 12 }}>
                Last checked: {lastChecked.toLocaleTimeString()} — Auto-refreshes every 60s
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ---- Health Cards Grid ---- */}
      <h3 style={{ marginBottom: 12 }}>Health by Object Type</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {healthData.map((h) => {
          const isExpanded = expandedType === h.apiName;
          const issueCount = h.issues.length;
          return (
            <Card
              key={h.apiName}
              elevation={Elevation.ONE}
              interactive
              onClick={() => setExpandedType(isExpanded ? null : h.apiName)}
              style={{
                borderLeft: `4px solid ${scoreToColor(h.score)}`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h4 style={{ margin: 0 }}>{h.displayName}</h4>
                  <span style={{ color: Colors.GRAY3, fontSize: 13 }}>{h.count} objects</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: scoreToColor(h.score) }}>
                    {h.score}%
                  </span>
                </div>
              </div>

              <ProgressBar
                intent={scoreToIntent(h.score)}
                value={h.score / 100}
                stripes={false}
                style={{ marginTop: 10, marginBottom: 8 }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {issueCount > 0 ? (
                  <Tag minimal intent={issueCount > 3 ? Intent.DANGER : Intent.WARNING}>
                    {issueCount} issue{issueCount !== 1 ? "s" : ""}
                  </Tag>
                ) : (
                  <Tag minimal intent={Intent.SUCCESS}>
                    No issues
                  </Tag>
                )}
                <Icon icon={isExpanded ? "chevron-up" : "chevron-down"} color={Colors.GRAY3} />
              </div>

              {/* ---- Expanded checks detail ---- */}
              <Collapse isOpen={isExpanded}>
                <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                  <HTMLTable
                    compact
                    striped
                    style={{ width: "100%", fontSize: 13 }}
                  >
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.checks.map((c) => (
                        <tr key={c.name}>
                          <td style={{ fontWeight: 500 }}>{c.name}</td>
                          <td>
                            <CheckStatusIcon status={c.status} />
                          </td>
                          <td>
                            <Tag minimal intent={scoreToIntent(c.score)}>
                              {c.score}%
                            </Tag>
                          </td>
                          <td style={{ color: Colors.GRAY3 }}>{c.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </HTMLTable>

                  {h.issues.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <strong style={{ fontSize: 12, color: Colors.GRAY3 }}>
                        Issues for {h.displayName}:
                      </strong>
                      {h.issues.slice(0, 5).map((issue, idx) => (
                        <Callout
                          key={idx}
                          intent={severityToIntent(issue.severity)}
                          icon={
                            issue.severity === "Critical"
                              ? "error"
                              : issue.severity === "Warning"
                                ? "warning-sign"
                                : "info-sign"
                          }
                          style={{ marginTop: 6, fontSize: 12, padding: "6px 10px" }}
                        >
                          {issue.description}
                        </Callout>
                      ))}
                      {h.issues.length > 5 && (
                        <p style={{ fontSize: 12, color: Colors.GRAY4, marginTop: 4 }}>
                          ...and {h.issues.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Collapse>
            </Card>
          );
        })}
      </div>

      {/* ---- Issues Panel ---- */}
      <h3 style={{ marginBottom: 12 }}>
        <Icon icon="issue" style={{ marginRight: 8 }} />
        Discovered Issues ({allIssues.length})
      </h3>
      <Card elevation={Elevation.ONE}>
        {allIssues.length === 0 ? (
          <Callout intent={Intent.SUCCESS} icon="tick-circle">
            No issues discovered. All data health checks passed.
          </Callout>
        ) : (
          <HTMLTable compact striped interactive style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Severity</th>
                <th style={{ width: 130 }}>Object Type</th>
                <th>Description</th>
                <th style={{ width: 240 }}>Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {allIssues
                .sort((a, b) => {
                  const order = { Critical: 0, Warning: 1, Info: 2 };
                  return order[a.severity] - order[b.severity];
                })
                .map((issue, idx) => (
                  <tr key={idx}>
                    <td>
                      <Tag intent={severityToIntent(issue.severity)} minimal>
                        {issue.severity}
                      </Tag>
                    </td>
                    <td>
                      <Tag minimal>{issue.objectType}</Tag>
                    </td>
                    <td style={{ fontSize: 13 }}>{issue.description}</td>
                    <td style={{ fontSize: 13, color: Colors.GRAY3 }}>{issue.action}</td>
                  </tr>
                ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>
    </div>
  );
}
