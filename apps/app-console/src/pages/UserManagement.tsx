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

interface User {
  id: string;
  username: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

interface UserListResponse {
  data: User[];
}

export default function UserManagement() {
  const { data, loading, refetch } = useApi<UserListResponse>(
    "/api/v2/admin/users",
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formGiven, setFormGiven] = useState("");
  const [formFamily, setFormFamily] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const users = data?.data ?? [];

  const columns: ColumnDef<User>[] = [
    { key: "username", header: "Username", sortable: true, render: (r) => r.username },
    { key: "givenName", header: "First Name", render: (r) => r.givenName ?? "-" },
    { key: "familyName", header: "Last Name", render: (r) => r.familyName ?? "-" },
    { key: "email", header: "Email", render: (r) => r.email ?? "-" },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button minimal icon="edit" onClick={() => openEdit(r)} />
      ),
    },
  ];

  const openCreate = useCallback(() => {
    setEditUser(null);
    setFormUsername("");
    setFormGiven("");
    setFormFamily("");
    setFormEmail("");
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((user: User) => {
    setEditUser(user);
    setFormUsername(user.username);
    setFormGiven(user.givenName ?? "");
    setFormFamily(user.familyName ?? "");
    setFormEmail(user.email ?? "");
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body = {
        username: formUsername,
        givenName: formGiven,
        familyName: formFamily,
        email: formEmail,
      };

      if (editUser) {
        await fetch(`${API_BASE_URL}/api/v2/admin/users/${editUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`${API_BASE_URL}/api/v2/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      setDialogOpen(false);
      refetch();
    } finally {
      setSaving(false);
    }
  }, [editUser, formUsername, formGiven, formFamily, formEmail, refetch]);

  return (
    <>
      <PageHeader
        title="User Management"
        actions={
          <Button
            icon="add"
            intent={Intent.PRIMARY}
            text="Create User"
            onClick={openCreate}
          />
        }
      />

      {loading ? (
        <Spinner size={40} />
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(r) => r.id}
          emptyMessage="No users found"
        />
      )}

      {/* Create/Edit User Dialog */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editUser ? "Edit User" : "Create User"}
      >
        <DialogBody>
          <FormGroup label="Username" labelFor="u-username">
            <InputGroup
              id="u-username"
              value={formUsername}
              onChange={(e) => setFormUsername(e.target.value)}
              disabled={!!editUser}
            />
          </FormGroup>
          <FormGroup label="First Name" labelFor="u-given">
            <InputGroup
              id="u-given"
              value={formGiven}
              onChange={(e) => setFormGiven(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Last Name" labelFor="u-family">
            <InputGroup
              id="u-family"
              value={formFamily}
              onChange={(e) => setFormFamily(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Email" labelFor="u-email">
            <InputGroup
              id="u-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setDialogOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text={editUser ? "Save" : "Create"}
                loading={saving}
                disabled={!formUsername}
                onClick={handleSave}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
