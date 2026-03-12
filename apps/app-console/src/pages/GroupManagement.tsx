import { useCallback, useState } from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  HTMLTable,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import DataTable, { type ColumnDef } from "../components/DataTable";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

interface Group {
  id: string;
  name: string;
  description?: string;
}

interface GroupListResponse {
  data: Group[];
}

interface GroupMember {
  principalId: string;
  principalType: string;
}

interface GroupMemberListResponse {
  data: GroupMember[];
}

export default function GroupManagement() {
  const { data, loading, refetch } = useApi<GroupListResponse>(
    "/api/v2/admin/groups",
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Member management
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const { data: membersData, loading: membersLoading, refetch: refetchMembers } =
    useApi<GroupMemberListResponse>(
      membersGroupId
        ? `/api/v2/admin/groups/${membersGroupId}/groupMembers`
        : "",
    );
  const [addMemberId, setAddMemberId] = useState("");

  const groups = data?.data ?? [];
  const members = membersData?.data ?? [];

  const columns: ColumnDef<Group>[] = [
    { key: "name", header: "Name", sortable: true, render: (r) => r.name },
    { key: "description", header: "Description", render: (r) => r.description ?? "-" },
    { key: "id", header: "ID", render: (r) => r.id },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button
          minimal
          icon="people"
          text="Members"
          onClick={() => setMembersGroupId(r.id)}
        />
      ),
    },
  ];

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/admin/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc || undefined,
        }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      refetch();
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, refetch]);

  const handleAddMember = useCallback(async () => {
    if (!membersGroupId || !addMemberId) return;
    await fetch(
      `${API_BASE_URL}/api/v2/admin/groups/${membersGroupId}/groupMembers/${addMemberId}`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    setAddMemberId("");
    refetchMembers();
  }, [membersGroupId, addMemberId, refetchMembers]);

  const handleRemoveMember = useCallback(
    async (principalId: string) => {
      if (!membersGroupId) return;
      await fetch(
        `${API_BASE_URL}/api/v2/admin/groups/${membersGroupId}/groupMembers/${principalId}`,
        { method: "DELETE" },
      );
      refetchMembers();
    },
    [membersGroupId, refetchMembers],
  );

  return (
    <>
      <PageHeader
        title="Group Management"
        actions={
          <Button
            icon="add"
            intent={Intent.PRIMARY}
            text="Create Group"
            onClick={() => setCreateOpen(true)}
          />
        }
      />

      {loading ? (
        <Spinner size={40} />
      ) : (
        <DataTable
          columns={columns}
          rows={groups}
          rowKey={(r) => r.id}
          emptyMessage="No groups found"
        />
      )}

      {/* Create Group Dialog */}
      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Group"
      >
        <DialogBody>
          <FormGroup label="Group Name" labelFor="g-name">
            <InputGroup
              id="g-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="g-desc">
            <InputGroup
              id="g-desc"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setCreateOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Create"
                loading={creating}
                disabled={!newName}
                onClick={handleCreate}
              />
            </>
          }
        />
      </Dialog>

      {/* Member Management Dialog */}
      <Dialog
        isOpen={!!membersGroupId}
        onClose={() => setMembersGroupId(null)}
        title="Group Members"
        style={{ width: 550 }}
      >
        <DialogBody>
          {membersLoading ? (
            <Spinner size={30} />
          ) : members.length === 0 ? (
            <NonIdealState icon="people" title="No members" />
          ) : (
            <HTMLTable bordered compact striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Principal ID</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.principalId}>
                    <td>{m.principalId}</td>
                    <td>
                      <Tag minimal>{m.principalType}</Tag>
                    </td>
                    <td>
                      <Button
                        minimal
                        icon="cross"
                        intent={Intent.DANGER}
                        onClick={() => handleRemoveMember(m.principalId)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}

          <div className="toolbar" style={{ marginTop: 12 }}>
            <InputGroup
              placeholder="Principal ID to add"
              value={addMemberId}
              onChange={(e) => setAddMemberId(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button
              icon="add"
              intent={Intent.PRIMARY}
              text="Add"
              disabled={!addMemberId}
              onClick={handleAddMember}
            />
          </div>
        </DialogBody>
        <DialogFooter
          actions={
            <Button text="Close" onClick={() => setMembersGroupId(null)} />
          }
        />
      </Dialog>
    </>
  );
}
