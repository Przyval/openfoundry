import { useCallback, useRef } from "react";
import { Button, Icon } from "@blueprintjs/core";
import { WidgetRenderer } from "../widgets/WidgetRenderer";
import { getWidgetDef, type WidgetInstance } from "../widgets/widget-registry";
import type { IconName } from "@blueprintjs/icons";

interface CanvasProps {
  widgets: WidgetInstance[];
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  onUpdateWidget: (id: string, updates: Partial<WidgetInstance>) => void;
  onDeleteWidget: (id: string) => void;
  previewMode: boolean;
}

export function Canvas({
  widgets,
  selectedWidgetId,
  onSelectWidget,
  onUpdateWidget,
  onDeleteWidget,
  previewMode,
}: CanvasProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("canvas-grid")) {
        onSelectWidget(null);
      }
    },
    [onSelectWidget],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, widgetId: string, handle: "right" | "bottom" | "corner") => {
      e.stopPropagation();
      e.preventDefault();
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = widget.position.w;
      const startH = widget.position.h;

      const onMouseMove = (moveEvt: MouseEvent) => {
        if (!gridRef.current) return;
        const gridRect = gridRef.current.getBoundingClientRect();
        const colWidth = gridRect.width / 12;
        const rowHeight = 68; // 60px row + 8px gap

        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (handle === "right" || handle === "corner") {
          newW = Math.max(1, Math.round(startW + dx / colWidth));
          newW = Math.min(newW, 12 - widget.position.x + 1);
        }
        if (handle === "bottom" || handle === "corner") {
          newH = Math.max(1, Math.round(startH + dy / rowHeight));
        }

        onUpdateWidget(widgetId, {
          position: { ...widget.position, w: newW, h: newH },
        });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [widgets, onUpdateWidget],
  );

  // Drag to move widgets
  const handleDragStart = useCallback(
    (e: React.MouseEvent, widgetId: string) => {
      if (previewMode) return;
      e.preventDefault();
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget || !gridRef.current) return;

      const gridRect = gridRef.current.getBoundingClientRect();
      const colWidth = gridRect.width / 12;
      const rowHeight = 68;
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = widget.position.x;
      const origY = widget.position.y;

      const onMouseMove = (moveEvt: MouseEvent) => {
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        let newX = Math.max(1, Math.round(origX + dx / colWidth));
        let newY = Math.max(1, Math.round(origY + dy / rowHeight));
        newX = Math.min(newX, 12 - widget.position.w + 1);

        onUpdateWidget(widgetId, {
          position: { ...widget.position, x: newX, y: newY },
        });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [widgets, onUpdateWidget, previewMode],
  );

  return (
    <div
      className={`canvas-container ${previewMode ? "preview-mode" : ""}`}
      onClick={handleCanvasClick}
    >
      <div className="canvas-grid" ref={gridRef}>
        {widgets.length === 0 && !previewMode && (
          <div className="canvas-empty-hint">
            Click a widget in the palette to add it to the canvas
          </div>
        )}
        {widgets.map((widget) => {
          const def = getWidgetDef(widget.type);
          const isSelected = widget.id === selectedWidgetId;

          return (
            <div
              key={widget.id}
              className={`canvas-widget ${isSelected ? "selected" : ""}`}
              style={{
                gridColumn: `${widget.position.x} / span ${widget.position.w}`,
                gridRow: `${widget.position.y} / span ${widget.position.h}`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!previewMode) onSelectWidget(widget.id);
              }}
            >
              {!previewMode && (
                <div
                  className="widget-header"
                  onMouseDown={(e) => handleDragStart(e, widget.id)}
                >
                  <span className="widget-type-label">
                    <Icon icon={def?.icon as IconName} size={12} />{" "}
                    {def?.name || widget.type}
                  </span>
                  <Button
                    minimal
                    small
                    icon="cross"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onDeleteWidget(widget.id);
                    }}
                  />
                </div>
              )}
              <div className="widget-body">
                <WidgetRenderer type={widget.type} config={widget.config} />
              </div>
              {/* Resize handles (only when selected and not in preview) */}
              {isSelected && !previewMode && (
                <>
                  <div
                    className="resize-handle right"
                    onMouseDown={(e) => handleResizeStart(e, widget.id, "right")}
                  />
                  <div
                    className="resize-handle bottom"
                    onMouseDown={(e) => handleResizeStart(e, widget.id, "bottom")}
                  />
                  <div
                    className="resize-handle corner"
                    onMouseDown={(e) => handleResizeStart(e, widget.id, "corner")}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
