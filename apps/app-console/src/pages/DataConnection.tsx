import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Callout,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  Elevation,
  HTMLTable,
  Icon,
  InputGroup,
  Intent,
  ProgressBar,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConnectorCard {
  id: string;
  name: string;
  icon: string; // Blueprint icon name
  functional: boolean;
  status: "Available" | "Coming Soon";
  fileType?: "csv" | "json";
}

interface OntologyListItem {
  apiName: string;
  displayName: string;
  rid: string;
}

interface OntologyListResponse {
  data: OntologyListItem[];
}

interface ObjectTypeItem {
  apiName: string;
  displayName?: string;
  rid?: string;
}

interface ObjectTypeListResponse {
  data: ObjectTypeItem[];
}

type ImportStep = "upload" | "preview" | "mapping" | "importing" | "done";

/* ------------------------------------------------------------------ */
/*  Connector catalog                                                  */
/* ------------------------------------------------------------------ */

const CONNECTORS: ConnectorCard[] = [
  { id: "csv", name: "CSV File Upload", icon: "document", functional: true, status: "Available", fileType: "csv" },
  { id: "json", name: "JSON File Upload", icon: "code-block", functional: true, status: "Available", fileType: "json" },
  { id: "rest", name: "REST API", icon: "globe-network", functional: false, status: "Available" },
  { id: "postgres", name: "PostgreSQL", icon: "database", functional: false, status: "Available" },
  { id: "mysql", name: "MySQL", icon: "database", functional: false, status: "Available" },
  { id: "gsheets", name: "Google Sheets", icon: "th", functional: false, status: "Coming Soon" },
  { id: "salesforce", name: "Salesforce", icon: "cloud", functional: false, status: "Coming Soon" },
  { id: "sap", name: "SAP", icon: "cube", functional: false, status: "Coming Soon" },
];

/* ------------------------------------------------------------------ */
/*  CSV parser                                                         */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current.trim());
        current = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        if (ch === "\r") i++;
        row.push(current.trim());
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  // Last row
  row.push(current.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

function parseJSON(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    // Try to find an array property
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
    return [parsed as Record<string, unknown>];
  }
  throw new Error("JSON must be an array of objects or an object containing an array.");
}

/* ------------------------------------------------------------------ */
/*  Active connections (demo data)                                     */
/* ------------------------------------------------------------------ */

const DEMO_CONNECTIONS = [
  {
    name: "Pest Control Seed Data",
    connector: "CSV File Upload",
    status: "Active" as const,
    lastSync: "Today, 10:32 AM",
    nextSync: "-",
    objects: 47,
  },
  {
    name: "Monthly Revenue Export",
    connector: "REST API",
    status: "Scheduled" as const,
    lastSync: "Mar 22, 2026",
    nextSync: "Tomorrow, 6:00 AM",
    objects: 312,
  },
];

/* ------------------------------------------------------------------ */
/*  REST API config form (visual only)                                 */
/* ------------------------------------------------------------------ */

function RestConfigDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Configure REST API Connector" icon="globe-network" style={{ width: 520 }}>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="bp5-label">
            Base URL
            <InputGroup placeholder="https://api.example.com/v1/data" />
          </label>
          <label className="bp5-label">
            Authentication Header
            <InputGroup placeholder="Bearer <token>" leftIcon="lock" />
          </label>
          <label className="bp5-label">
            Sync Schedule
            <div className="bp5-html-select" style={{ width: "100%" }}>
              <select style={{ width: "100%" }}>
                <option>Every hour</option>
                <option>Every 6 hours</option>
                <option>Daily</option>
                <option>Weekly</option>
              </select>
              <span className="bp5-icon bp5-icon-double-caret-vertical" />
            </div>
          </label>
          <Callout intent={Intent.WARNING} icon="info-sign" compact>
            This connector is for demonstration only. No actual API connection will be made.
          </Callout>
        </div>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button text="Cancel" onClick={onClose} />
            <Button text="Save Connection" intent={Intent.PRIMARY} onClick={onClose} />
          </>
        }
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Database config dialog (visual only)                               */
/* ------------------------------------------------------------------ */

function DbConfigDialog({
  isOpen,
  onClose,
  dbName,
}: {
  isOpen: boolean;
  onClose: () => void;
  dbName: string;
}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Configure ${dbName} Connector`} icon="database" style={{ width: 520 }}>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="bp5-label">
            Host
            <InputGroup placeholder="db.example.com" />
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label className="bp5-label" style={{ flex: 1 }}>
              Port
              <InputGroup placeholder={dbName === "PostgreSQL" ? "5432" : "3306"} />
            </label>
            <label className="bp5-label" style={{ flex: 2 }}>
              Database Name
              <InputGroup placeholder="my_database" />
            </label>
          </div>
          <label className="bp5-label">
            Username
            <InputGroup placeholder="admin" leftIcon="user" />
          </label>
          <label className="bp5-label">
            Password
            <InputGroup placeholder="********" leftIcon="lock" type="password" />
          </label>
          <Callout intent={Intent.WARNING} icon="info-sign" compact>
            This connector is for demonstration only. No actual database connection will be made.
          </Callout>
        </div>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button text="Cancel" onClick={onClose} />
            <Button text="Test Connection" intent={Intent.NONE} icon="refresh" onClick={onClose} />
            <Button text="Save" intent={Intent.PRIMARY} onClick={onClose} />
          </>
        }
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Import wizard dialog                                               */
/* ------------------------------------------------------------------ */

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  fileType: "csv" | "json";
}

function ImportWizard({ isOpen, onClose, fileType }: ImportWizardProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [objectTypeName, setObjectTypeName] = useState("");
  const [primaryKeyCol, setPrimaryKeyCol] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch ontologies
  const { data: ontologyList } = useApi<OntologyListResponse>("/api/v2/ontologies");
  const ontologies = ontologyList?.data ?? [];
  const [selectedOntologyRid, setSelectedOntologyRid] = useState("");
  const effectiveRid = selectedOntologyRid || (ontologies.length > 0 ? ontologies[0].rid : "");

  // Fetch existing object types
  const { data: objectTypesData } = useApi<ObjectTypeListResponse>(
    effectiveRid ? `/api/v2/ontologies/${effectiveRid}/objectTypes` : "",
  );
  const existingTypes = objectTypesData?.data ?? [];
  const [useExistingType, setUseExistingType] = useState(false);
  const [selectedExistingType, setSelectedExistingType] = useState("");

  // Sync ontology selection
  useEffect(() => {
    if (ontologies.length > 0 && !selectedOntologyRid) {
      setSelectedOntologyRid(ontologies[0].rid);
    }
  }, [ontologies, selectedOntologyRid]);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setColumnMapping({});
    setObjectTypeName("");
    setPrimaryKeyCol("");
    setImportProgress(0);
    setImportTotal(0);
    setImportResult(null);
    setError(null);
    setUseExistingType(false);
    setSelectedExistingType("");
  }, []);

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  /* -- File handling -- */
  const handleFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (fileType === "csv") {
          const parsed = parseCSV(text);
          if (parsed.length < 2) throw new Error("CSV must have a header row and at least one data row.");
          const hdrs = parsed[0];
          const dataRows = parsed.slice(1).map((r) => {
            const obj: Record<string, string> = {};
            hdrs.forEach((h, i) => { obj[h] = r[i] ?? ""; });
            return obj;
          });
          setHeaders(hdrs);
          setRows(dataRows);
          // Default mapping: column name -> same name
          const mapping: Record<string, string> = {};
          hdrs.forEach((h) => { mapping[h] = h.replace(/\s+/g, "_").toLowerCase(); });
          setColumnMapping(mapping);
          setPrimaryKeyCol(hdrs[0]);
          setObjectTypeName(file.name.replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9]/g, "_"));
        } else {
          const parsed = parseJSON(text);
          if (parsed.length === 0) throw new Error("JSON must contain at least one record.");
          const hdrs = Array.from(new Set(parsed.flatMap((r) => Object.keys(r))));
          const dataRows = parsed.map((r) => {
            const obj: Record<string, string> = {};
            hdrs.forEach((h) => { obj[h] = r[h] != null ? String(r[h]) : ""; });
            return obj;
          });
          setHeaders(hdrs);
          setRows(dataRows);
          const mapping: Record<string, string> = {};
          hdrs.forEach((h) => { mapping[h] = h.replace(/\s+/g, "_").toLowerCase(); });
          setColumnMapping(mapping);
          setPrimaryKeyCol(hdrs[0]);
          setObjectTypeName(file.name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9]/g, "_"));
        }
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.onerror = () => setError("Failed to read file.");
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  /* -- Import logic -- */
  const doImport = async () => {
    setStep("importing");
    setError(null);
    const token = localStorage.getItem("token");
    const authHeaders: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const targetType = useExistingType ? selectedExistingType : objectTypeName;

    // Create object type if new
    if (!useExistingType && targetType) {
      try {
        const properties: Record<string, { type: string }> = {};
        for (const prop of Object.values(columnMapping)) {
          if (prop) properties[prop] = { type: "string" };
        }
        await fetch(`${API_BASE_URL}/api/v2/ontologies/${effectiveRid}/objectTypes`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            apiName: targetType,
            displayName: targetType.replace(/_/g, " "),
            primaryKey: columnMapping[primaryKeyCol] || "id",
            properties,
          }),
        });
      } catch {
        // Object type may already exist, continue
      }
    }

    // Import rows
    const total = rows.length;
    setImportTotal(total);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const properties: Record<string, string> = {};
      for (const [srcCol, tgtProp] of Object.entries(columnMapping)) {
        if (tgtProp && row[srcCol] !== undefined) {
          properties[tgtProp] = row[srcCol];
        }
      }
      const pkProp = columnMapping[primaryKeyCol] || "id";
      const pkValue = row[primaryKeyCol] || `row-${i}`;

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v2/ontologies/${effectiveRid}/objects/${targetType}`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ primaryKey: pkValue, properties }),
          },
        );
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }

      setImportProgress(i + 1);
    }

    setImportResult({ success, failed });
    setStep("done");
  };

  /* -- Step titles -- */
  const stepTitles: Record<ImportStep, string> = {
    upload: `Upload ${fileType.toUpperCase()} File`,
    preview: "Preview Data",
    mapping: "Configure Mapping",
    importing: "Importing...",
    done: "Import Complete",
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={stepTitles[step]}
      icon={fileType === "csv" ? "document" : "code-block"}
      style={{ width: step === "preview" || step === "mapping" ? 800 : 560 }}
      canOutsideClickClose={step !== "importing"}
      canEscapeKeyClose={step !== "importing"}
    >
      <DialogBody>
        {error && (
          <Callout intent={Intent.DANGER} icon="error" style={{ marginBottom: 12 }}>
            {error}
          </Callout>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{
                border: "2px dashed #5c7080",
                borderRadius: 8,
                padding: 40,
                textAlign: "center",
                cursor: "pointer",
                background: "rgba(19,124,189,0.04)",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon icon="cloud-upload" size={48} style={{ color: "#5c7080", marginBottom: 12 }} />
              <p style={{ fontSize: "1.1rem", margin: 0 }}>
                Drag &amp; drop your {fileType.toUpperCase()} file here
              </p>
              <p style={{ color: "#5c7080", marginTop: 4 }}>or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={fileType === "csv" ? ".csv" : ".json"}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
            {fileName && (
              <p style={{ marginTop: 12, color: "#5c7080" }}>
                <Icon icon="document" /> {fileName}
              </p>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <div>
            <p style={{ color: "#5c7080", marginBottom: 8 }}>
              Showing first {Math.min(rows.length, 10)} of {rows.length} rows from <strong>{fileName}</strong>
            </p>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <HTMLTable bordered compact striped style={{ width: "100%" }}>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </div>
            <p style={{ color: "#5c7080", marginTop: 8, fontSize: "0.85rem" }}>
              {headers.length} columns detected &middot; {rows.length} total rows
            </p>
          </div>
        )}

        {/* Step 3: Mapping */}
        {step === "mapping" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Target ontology */}
            <label className="bp5-label">
              Target Ontology
              <div className="bp5-html-select" style={{ width: "100%" }}>
                <select
                  value={effectiveRid}
                  onChange={(e) => setSelectedOntologyRid(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {ontologies.map((o) => (
                    <option key={o.rid} value={o.rid}>
                      {o.displayName || o.apiName}
                    </option>
                  ))}
                  {ontologies.length === 0 && <option value="">No ontologies</option>}
                </select>
                <span className="bp5-icon bp5-icon-double-caret-vertical" />
              </div>
            </label>

            {/* Object type: new or existing */}
            <div>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <Button
                  text="Create New Object Type"
                  active={!useExistingType}
                  onClick={() => setUseExistingType(false)}
                  small
                />
                <Button
                  text="Use Existing Object Type"
                  active={useExistingType}
                  onClick={() => setUseExistingType(true)}
                  small
                />
              </div>
              {useExistingType ? (
                <div className="bp5-html-select" style={{ width: "100%" }}>
                  <select
                    value={selectedExistingType}
                    onChange={(e) => setSelectedExistingType(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">Select object type...</option>
                    {existingTypes.map((ot) => (
                      <option key={ot.apiName} value={ot.apiName}>
                        {ot.displayName || ot.apiName}
                      </option>
                    ))}
                  </select>
                  <span className="bp5-icon bp5-icon-double-caret-vertical" />
                </div>
              ) : (
                <InputGroup
                  placeholder="new_object_type"
                  value={objectTypeName}
                  onChange={(e) => setObjectTypeName(e.target.value)}
                  leftIcon="cube"
                />
              )}
            </div>

            {/* Primary key */}
            <label className="bp5-label">
              Primary Key Column
              <div className="bp5-html-select" style={{ width: "100%" }}>
                <select
                  value={primaryKeyCol}
                  onChange={(e) => setPrimaryKeyCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="bp5-icon bp5-icon-double-caret-vertical" />
              </div>
            </label>

            {/* Column mapping table */}
            <div>
              <strong>Column Mapping</strong>
              <HTMLTable bordered compact striped style={{ width: "100%", marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Source Column</th>
                    <th>Target Property</th>
                    <th style={{ width: 60 }}>Include</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h}>
                      <td><code>{h}</code></td>
                      <td>
                        <InputGroup
                          small
                          value={columnMapping[h] ?? ""}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({ ...prev, [h]: e.target.value }))
                          }
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!columnMapping[h]}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setColumnMapping((prev) => ({
                                ...prev,
                                [h]: h.replace(/\s+/g, "_").toLowerCase(),
                              }));
                            } else {
                              setColumnMapping((prev) => ({ ...prev, [h]: "" }));
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === "importing" && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <Spinner size={40} />
            <p style={{ marginTop: 16, fontSize: "1rem" }}>
              Importing objects... {importProgress} / {importTotal}
            </p>
            <ProgressBar
              value={importTotal > 0 ? importProgress / importTotal : 0}
              intent={Intent.PRIMARY}
              animate
              stripes
            />
          </div>
        )}

        {/* Step 5: Done */}
        {step === "done" && importResult && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <Icon
              icon={importResult.failed === 0 ? "tick-circle" : "warning-sign"}
              size={48}
              style={{ color: importResult.failed === 0 ? "#0d8050" : "#bf7326" }}
            />
            <h3 style={{ marginTop: 12 }}>Import Complete</h3>
            <p style={{ fontSize: "1rem" }}>
              <Tag intent={Intent.SUCCESS} large round style={{ marginRight: 8 }}>
                {importResult.success}
              </Tag>
              objects created successfully
            </p>
            {importResult.failed > 0 && (
              <p style={{ fontSize: "1rem" }}>
                <Tag intent={Intent.DANGER} large round style={{ marginRight: 8 }}>
                  {importResult.failed}
                </Tag>
                objects failed to import
              </p>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter
        actions={
          <>
            {step !== "importing" && (
              <Button text={step === "done" ? "Close" : "Cancel"} onClick={handleClose} />
            )}
            {step === "preview" && (
              <>
                <Button text="Back" icon="arrow-left" onClick={() => setStep("upload")} />
                <Button text="Configure Mapping" intent={Intent.PRIMARY} icon="arrow-right" onClick={() => setStep("mapping")} />
              </>
            )}
            {step === "mapping" && (
              <>
                <Button text="Back" icon="arrow-left" onClick={() => setStep("preview")} />
                <Button
                  text={`Import ${rows.length} Objects`}
                  intent={Intent.SUCCESS}
                  icon="import"
                  onClick={doImport}
                  disabled={
                    (!useExistingType && !objectTypeName) ||
                    (useExistingType && !selectedExistingType) ||
                    !effectiveRid
                  }
                />
              </>
            )}
            {step === "done" && (
              <Button text="Import Another File" intent={Intent.PRIMARY} icon="repeat" onClick={resetWizard} />
            )}
          </>
        }
      />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function DataConnection() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardFileType, setWizardFileType] = useState<"csv" | "json">("csv");
  const [restDialogOpen, setRestDialogOpen] = useState(false);
  const [dbDialogOpen, setDbDialogOpen] = useState(false);
  const [dbDialogName, setDbDialogName] = useState("PostgreSQL");

  const openConnector = (connector: ConnectorCard) => {
    if (connector.functional && connector.fileType) {
      setWizardFileType(connector.fileType);
      setWizardOpen(true);
    } else if (connector.id === "rest") {
      setRestDialogOpen(true);
    } else if (connector.id === "postgres" || connector.id === "mysql") {
      setDbDialogName(connector.name);
      setDbDialogOpen(true);
    }
    // "Coming Soon" connectors do nothing
  };

  return (
    <>
      <PageHeader
        title="Data Connection"
        actions={
          <Tag intent={Intent.PRIMARY} large round icon="data-connection">
            {CONNECTORS.length} Connectors
          </Tag>
        }
      />

      {/* ---- Connector Gallery ---- */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon="grid-view" />
          Connector Gallery
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {CONNECTORS.map((c) => (
            <Card
              key={c.id}
              elevation={Elevation.ONE}
              interactive={c.status !== "Coming Soon"}
              onClick={() => openConnector(c)}
              style={{
                padding: 16,
                textAlign: "center",
                opacity: c.status === "Coming Soon" ? 0.55 : 1,
                cursor: c.status === "Coming Soon" ? "default" : "pointer",
              }}
            >
              <Icon icon={c.icon as any} size={32} style={{ color: "#137cbd", marginBottom: 8 }} />
              <p style={{ fontWeight: 600, margin: "4px 0" }}>{c.name}</p>
              <Tag
                minimal
                round
                intent={c.status === "Available" ? Intent.SUCCESS : Intent.NONE}
              >
                {c.status}
              </Tag>
              {c.functional && (
                <div style={{ marginTop: 6 }}>
                  <Tag intent={Intent.PRIMARY} minimal small>
                    Functional
                  </Tag>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* ---- Active Connections ---- */}
      <section>
        <h3 style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon="data-lineage" />
          Active Connections
        </h3>
        <Card elevation={Elevation.ONE} style={{ padding: 0 }}>
          <HTMLTable bordered compact striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Connection Name</th>
                <th>Connector</th>
                <th>Status</th>
                <th>Last Sync</th>
                <th>Next Sync</th>
                <th>Objects</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_CONNECTIONS.map((conn) => (
                <tr key={conn.name}>
                  <td>
                    <strong>{conn.name}</strong>
                  </td>
                  <td>{conn.connector}</td>
                  <td>
                    <Tag
                      minimal
                      round
                      intent={conn.status === "Active" ? Intent.SUCCESS : Intent.WARNING}
                    >
                      {conn.status}
                    </Tag>
                  </td>
                  <td>{conn.lastSync}</td>
                  <td>{conn.nextSync}</td>
                  <td>
                    <Tag minimal round>
                      {conn.objects}
                    </Tag>
                  </td>
                  <td>
                    <Button small minimal icon="refresh" title="Sync now" />
                    <Button small minimal icon="cog" title="Configure" />
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        </Card>
      </section>

      {/* ---- Dialogs ---- */}
      <ImportWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} fileType={wizardFileType} />
      <RestConfigDialog isOpen={restDialogOpen} onClose={() => setRestDialogOpen(false)} />
      <DbConfigDialog isOpen={dbDialogOpen} onClose={() => setDbDialogOpen(false)} dbName={dbDialogName} />
    </>
  );
}
