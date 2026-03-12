import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  InputGroup,
  NonIdealState,
  Icon,
} from "@blueprintjs/core";
import { usePageStore } from "../store/page-store";

export function PagesList() {
  const navigate = useNavigate();
  const { pages, createPage, deletePage } = usePageStore();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [newPageDesc, setNewPageDesc] = useState("");

  const handleCreate = useCallback(() => {
    if (!newPageName.trim()) return;
    const page = createPage(newPageName.trim(), newPageDesc.trim());
    setShowNewDialog(false);
    setNewPageName("");
    setNewPageDesc("");
    navigate(`/builder/${page.rid}`);
  }, [newPageName, newPageDesc, createPage, navigate]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, rid: string) => {
      e.stopPropagation();
      if (confirm("Delete this page?")) {
        deletePage(rid);
      }
    },
    [deletePage],
  );

  return (
    <div className="pages-list">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Workshop Pages</h2>
        <ButtonGroup>
          <Button
            intent="primary"
            icon="plus"
            text="New Page"
            onClick={() => setShowNewDialog(true)}
          />
          <Button
            icon="build"
            text="Quick Builder"
            onClick={() => navigate("/builder")}
          />
        </ButtonGroup>
      </div>

      {pages.length === 0 ? (
        <NonIdealState
          icon="document"
          title="No pages yet"
          description="Create your first Workshop page to get started."
          action={
            <Button
              intent="primary"
              icon="plus"
              text="Create Page"
              onClick={() => setShowNewDialog(true)}
            />
          }
        />
      ) : (
        pages.map((page) => (
          <div
            key={page.rid}
            className="page-card"
            onClick={() => navigate(`/builder/${page.rid}`)}
          >
            <div className="page-card-info">
              <h4>
                <Icon icon="document" size={14} /> {page.name}
              </h4>
              <p>
                {page.description || "No description"} &middot;{" "}
                {page.widgets.length} widget{page.widgets.length !== 1 ? "s" : ""} &middot;{" "}
                Updated {new Date(page.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <ButtonGroup>
              <Button
                minimal
                icon="eye-open"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  navigate(`/preview/${page.rid}`);
                }}
              />
              <Button
                minimal
                icon="trash"
                intent="danger"
                onClick={(e: React.MouseEvent) => handleDelete(e, page.rid)}
              />
            </ButtonGroup>
          </div>
        ))
      )}

      {/* New Page Dialog */}
      <Dialog
        isOpen={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        title="Create New Page"
      >
        <DialogBody>
          <FormGroup label="Page Name" labelFor="page-name">
            <InputGroup
              id="page-name"
              placeholder="My Dashboard"
              value={newPageName}
              onChange={(e) => setNewPageName(e.target.value)}
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="page-desc">
            <InputGroup
              id="page-desc"
              placeholder="Optional description..."
              value={newPageDesc}
              onChange={(e) => setNewPageDesc(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setShowNewDialog(false)} />
              <Button
                intent="primary"
                text="Create"
                onClick={handleCreate}
                disabled={!newPageName.trim()}
              />
            </>
          }
        />
      </Dialog>
    </div>
  );
}
