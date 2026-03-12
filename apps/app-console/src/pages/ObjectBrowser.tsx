import { useCallback, useState } from "react";
import { InputGroup, Spinner, NonIdealState } from "@blueprintjs/core";
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import DataTable, { type ColumnDef } from "../components/DataTable";
import PaginationControls from "../components/PaginationControls";
import { useApi } from "../hooks/useApi";

interface OntologyObject {
  __primaryKey: string;
  [key: string]: unknown;
}

interface ObjectListResponse {
  data: OntologyObject[];
  nextPageToken?: string;
}

export default function ObjectBrowser() {
  const { ontologyRid, objectType } = useParams<{
    ontologyRid: string;
    objectType: string;
  }>();

  const [filter, setFilter] = useState("");
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const currentToken = pageTokens[pageTokens.length - 1] ?? "";

  const url = `/api/v2/ontologies/${ontologyRid}/objects/${objectType}${
    currentToken ? `?pageToken=${encodeURIComponent(currentToken)}` : ""
  }`;

  const { data, loading, error } = useApi<ObjectListResponse>(url);

  const objects = (data?.data ?? []).filter((obj) => {
    if (!filter) return true;
    return Object.values(obj).some((v) =>
      String(v).toLowerCase().includes(filter.toLowerCase()),
    );
  });

  // Build columns dynamically from the first object's keys
  const columns: ColumnDef<OntologyObject>[] =
    objects.length > 0
      ? Object.keys(objects[0]).map((key) => ({
          key,
          header: key,
          sortable: true,
          render: (row: OntologyObject) => String(row[key] ?? ""),
        }))
      : [];

  const handlePrevious = useCallback(() => {
    setPageTokens((tokens) => tokens.slice(0, -1));
  }, []);

  const handleNext = useCallback(() => {
    if (data?.nextPageToken) {
      setPageTokens((tokens) => [...tokens, data.nextPageToken!]);
    }
  }, [data?.nextPageToken]);

  if (error) {
    return (
      <NonIdealState
        icon="error"
        title="Failed to load objects"
        description={error.message}
      />
    );
  }

  return (
    <>
      <PageHeader title={`Objects: ${objectType ?? ""}`} />

      {/* Toolbar */}
      <div className="toolbar">
        <InputGroup
          leftIcon="search"
          placeholder="Filter objects..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      {loading ? (
        <Spinner size={40} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={objects}
            rowKey={(row) => String(row.__primaryKey)}
            emptyMessage="No objects found"
          />
          <PaginationControls
            hasPrevious={pageTokens.length > 0}
            hasNext={!!data?.nextPageToken}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />
        </>
      )}
    </>
  );
}
