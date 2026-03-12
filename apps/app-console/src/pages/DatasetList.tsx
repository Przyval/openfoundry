import { useCallback, useState } from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  InputGroup,
  Intent,
  Spinner,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import DataTable, { type ColumnDef } from "../components/DataTable";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

interface Dataset {
  rid: string;
  name: string;
  parentFolderRid: string;
}

interface DatasetListResponse {
  data: Dataset[];
}

export default function DatasetList() {
  const { data, loading, refetch } = useApi<DatasetListResponse>(
    "/api/v2/datasets",
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [creating, setCreating] = useState(false);

  const datasets = data?.data ?? [];

  const columns: ColumnDef<Dataset>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => row.name,
    },
    {
      key: "rid",
      header: "RID",
      render: (row) => row.rid,
    },
    {
      key: "parentFolderRid",
      header: "Parent Folder",
      render: (row) => row.parentFolderRid,
    },
  ];

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, parentFolderRid: newParent }),
      });
      setDialogOpen(false);
      setNewName("");
      setNewParent("");
      refetch();
    } finally {
      setCreating(false);
    }
  }, [newName, newParent, refetch]);

  return (
    <>
      <PageHeader
        title="Datasets"
        actions={
          <Button
            icon="add"
            intent={Intent.PRIMARY}
            text="Create Dataset"
            onClick={() => setDialogOpen(true)}
          />
        }
      />

      {loading ? (
        <Spinner size={40} />
      ) : (
        <DataTable
          columns={columns}
          rows={datasets}
          rowKey={(row) => row.rid}
          emptyMessage="No datasets found"
        />
      )}

      {/* Create Dataset Dialog */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Create Dataset"
      >
        <DialogBody>
          <FormGroup label="Dataset Name" labelFor="ds-name">
            <InputGroup
              id="ds-name"
              placeholder="my-dataset"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Parent Folder RID" labelFor="ds-parent">
            <InputGroup
              id="ds-parent"
              placeholder="ri.compass.main.folder...."
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setDialogOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Create"
                loading={creating}
                disabled={!newName || !newParent}
                onClick={handleCreate}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
