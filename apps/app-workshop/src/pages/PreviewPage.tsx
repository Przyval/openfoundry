import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, NonIdealState } from "@blueprintjs/core";
import { Canvas } from "../components/Canvas";
import { usePageStore, type WorkshopPage } from "../store/page-store";

export function PreviewPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const { getPage } = usePageStore();
  const [page, setPage] = useState<WorkshopPage | null>(null);

  useEffect(() => {
    if (pageId) {
      const p = getPage(pageId);
      setPage(p ?? null);
    }
  }, [pageId, getPage]);

  if (!page) {
    return (
      <NonIdealState
        icon="search"
        title="Page not found"
        action={<Button text="Go to pages" onClick={() => navigate("/pages")} />}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="builder-toolbar" style={{ justifyContent: "space-between" }}>
        <strong>{page.name}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            icon="edit"
            text="Edit"
            onClick={() => navigate(`/builder/${page.rid}`)}
          />
          <Button
            icon="arrow-left"
            text="Back to Pages"
            onClick={() => navigate("/pages")}
          />
        </div>
      </div>
      <Canvas
        widgets={page.widgets}
        selectedWidgetId={null}
        onSelectWidget={() => {}}
        onUpdateWidget={() => {}}
        onDeleteWidget={() => {}}
        previewMode={true}
      />
    </div>
  );
}
