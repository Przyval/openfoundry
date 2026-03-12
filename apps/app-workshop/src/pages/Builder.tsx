import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ButtonGroup,
  EditableText,
  Tooltip,
} from "@blueprintjs/core";
import { WidgetPalette } from "../components/WidgetPalette";
import { Canvas } from "../components/Canvas";
import { ConfigPanel } from "../components/ConfigPanel";
import {
  createWidgetInstance,
  type WidgetInstance,
  type WidgetType,
} from "../widgets/widget-registry";
import { usePageStore } from "../store/page-store";

export function Builder() {
  const { pageId } = useParams<{ pageId?: string }>();
  const navigate = useNavigate();
  const { getPage, createPage, updatePage, importPage } = usePageStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize or load page
  const [currentPageId, setCurrentPageId] = useState<string | null>(pageId ?? null);
  const [pageName, setPageName] = useState("Untitled Page");
  const [pageDescription, setPageDescription] = useState("");
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Load existing page
  useEffect(() => {
    if (pageId) {
      const page = getPage(pageId);
      if (page) {
        setCurrentPageId(page.rid);
        setPageName(page.name);
        setPageDescription(page.description);
        setWidgets(page.widgets);
      }
    }
  }, [pageId, getPage]);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId],
  );

  // ── Widget operations ──

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      // Find a free position: simple auto-placement
      const maxY = widgets.reduce(
        (max, w) => Math.max(max, w.position.y + w.position.h),
        0,
      );
      const instance = createWidgetInstance(type, { x: 1, y: maxY + 1 });
      setWidgets((prev) => [...prev, instance]);
      setSelectedWidgetId(instance.id);
    },
    [widgets],
  );

  const handleUpdateWidget = useCallback(
    (id: string, updates: Partial<WidgetInstance>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w)),
      );
    },
    [],
  );

  const handleUpdateConfig = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, config } : w)),
      );
    },
    [],
  );

  const handleUpdatePosition = useCallback(
    (id: string, position: { x: number; y: number; w: number; h: number }) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, position } : w)),
      );
    },
    [],
  );

  const handleDeleteWidget = useCallback(
    (id: string) => {
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      if (selectedWidgetId === id) setSelectedWidgetId(null);
    },
    [selectedWidgetId],
  );

  // ── Page operations ──

  const handleSave = useCallback(() => {
    if (currentPageId) {
      updatePage(currentPageId, { name: pageName, description: pageDescription, widgets });
    } else {
      const page = createPage(pageName, pageDescription);
      updatePage(page.rid, { widgets });
      setCurrentPageId(page.rid);
      navigate(`/builder/${page.rid}`, { replace: true });
    }
  }, [currentPageId, pageName, pageDescription, widgets, updatePage, createPage, navigate]);

  const handleExportJson = useCallback(() => {
    const data = JSON.stringify(
      { name: pageName, description: pageDescription, widgets },
      null,
      2,
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pageName.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pageName, pageDescription, widgets]);

  const handleImportJson = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (data.widgets) {
            setWidgets(data.widgets);
            setPageName(data.name || "Imported Page");
            setPageDescription(data.description || "");
          } else {
            // Assume it's a full page export from the store
            const rid = importPage(reader.result as string);
            navigate(`/builder/${rid}`);
          }
        } catch (err) {
          alert("Failed to parse JSON file");
        }
      };
      reader.readAsText(file);
      // Reset input so same file can be re-imported
      e.target.value = "";
    },
    [importPage, navigate],
  );

  const handlePreview = useCallback(() => {
    if (currentPageId) {
      // Save first, then navigate to preview
      updatePage(currentPageId, { name: pageName, description: pageDescription, widgets });
      navigate(`/preview/${currentPageId}`);
    } else {
      // Just toggle inline preview
      setPreviewMode((p) => !p);
    }
  }, [currentPageId, pageName, pageDescription, widgets, updatePage, navigate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div className="builder-toolbar">
        <EditableText
          className="page-name-input"
          value={pageName}
          onChange={setPageName}
          placeholder="Page name..."
          selectAllOnFocus
        />
        <div className="toolbar-spacer" />
        <ButtonGroup>
          <Tooltip content="Save page">
            <Button icon="floppy-disk" text="Save" intent="primary" onClick={handleSave} />
          </Tooltip>
          <Tooltip content={previewMode ? "Edit mode" : "Preview mode"}>
            <Button
              icon={previewMode ? "edit" : "eye-open"}
              text={previewMode ? "Edit" : "Preview"}
              onClick={() => {
                if (!previewMode && currentPageId) {
                  handlePreview();
                } else {
                  setPreviewMode((p) => !p);
                }
              }}
            />
          </Tooltip>
          <Tooltip content="Export as JSON">
            <Button icon="export" onClick={handleExportJson} />
          </Tooltip>
          <Tooltip content="Import from JSON">
            <Button icon="import" onClick={handleImportJson} />
          </Tooltip>
        </ButtonGroup>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {/* Three-panel layout */}
      <div className="builder-layout">
        {!previewMode && <WidgetPalette onAddWidget={handleAddWidget} />}
        <Canvas
          widgets={widgets}
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
          onUpdateWidget={handleUpdateWidget}
          onDeleteWidget={handleDeleteWidget}
          previewMode={previewMode}
        />
        {!previewMode && (
          <ConfigPanel
            widget={selectedWidget}
            onUpdateConfig={handleUpdateConfig}
            onUpdatePosition={handleUpdatePosition}
            onDeleteWidget={handleDeleteWidget}
          />
        )}
      </div>
    </div>
  );
}
