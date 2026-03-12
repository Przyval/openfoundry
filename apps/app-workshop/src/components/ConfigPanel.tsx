import { useCallback } from "react";
import {
  FormGroup,
  InputGroup,
  NumericInput,
  Switch,
  TextArea,
  HTMLSelect,
  Button,
  Divider,
} from "@blueprintjs/core";
import {
  getWidgetDef,
  type WidgetInstance,
  type ConfigField,
} from "../widgets/widget-registry";

interface ConfigPanelProps {
  widget: WidgetInstance | null;
  onUpdateConfig: (id: string, config: Record<string, unknown>) => void;
  onUpdatePosition: (
    id: string,
    position: { x: number; y: number; w: number; h: number },
  ) => void;
  onDeleteWidget: (id: string) => void;
}

export function ConfigPanel({
  widget,
  onUpdateConfig,
  onUpdatePosition,
  onDeleteWidget,
}: ConfigPanelProps) {
  if (!widget) {
    return (
      <div className="config-panel">
        <div className="config-panel-empty">
          Select a widget on the canvas to configure it
        </div>
      </div>
    );
  }

  const def = getWidgetDef(widget.type);
  const schema = def?.configSchema || [];

  return (
    <div className="config-panel">
      <h4>
        {def?.name || widget.type} Configuration
      </h4>

      {/* Position controls */}
      <div className="config-section">
        <label>Position &amp; Size</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <FormGroup label="Col (x)" style={{ margin: 0 }}>
            <NumericInput
              fill
              min={1}
              max={12}
              value={widget.position.x}
              onValueChange={(val) =>
                onUpdatePosition(widget.id, { ...widget.position, x: Math.max(1, val) })
              }
            />
          </FormGroup>
          <FormGroup label="Row (y)" style={{ margin: 0 }}>
            <NumericInput
              fill
              min={1}
              value={widget.position.y}
              onValueChange={(val) =>
                onUpdatePosition(widget.id, { ...widget.position, y: Math.max(1, val) })
              }
            />
          </FormGroup>
          <FormGroup label="Width" style={{ margin: 0 }}>
            <NumericInput
              fill
              min={1}
              max={12}
              value={widget.position.w}
              onValueChange={(val) =>
                onUpdatePosition(widget.id, { ...widget.position, w: Math.max(1, val) })
              }
            />
          </FormGroup>
          <FormGroup label="Height" style={{ margin: 0 }}>
            <NumericInput
              fill
              min={1}
              value={widget.position.h}
              onValueChange={(val) =>
                onUpdatePosition(widget.id, { ...widget.position, h: Math.max(1, val) })
              }
            />
          </FormGroup>
        </div>
      </div>

      <Divider />

      {/* Config fields */}
      {schema.map((field) => (
        <div className="config-section" key={field.key}>
          <ConfigFieldEditor
            field={field}
            value={widget.config[field.key]}
            onChange={(val) => {
              onUpdateConfig(widget.id, { ...widget.config, [field.key]: val });
            }}
          />
        </div>
      ))}

      <Divider />

      <div className="config-section">
        <Button
          intent="danger"
          icon="trash"
          text="Delete Widget"
          fill
          onClick={() => onDeleteWidget(widget.id)}
        />
      </div>
    </div>
  );
}

// ── Individual config field editor ──

interface ConfigFieldEditorProps {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ConfigFieldEditor({ field, value, onChange }: ConfigFieldEditorProps) {
  const handleChange = useCallback(
    (newVal: unknown) => onChange(newVal),
    [onChange],
  );

  switch (field.type) {
    case "string":
      return (
        <FormGroup label={field.label} style={{ margin: 0 }}>
          <InputGroup
            fill
            value={String(value ?? "")}
            onChange={(e) => handleChange(e.target.value)}
          />
        </FormGroup>
      );

    case "number":
      return (
        <FormGroup label={field.label} style={{ margin: 0 }}>
          <NumericInput
            fill
            value={Number(value ?? 0)}
            onValueChange={(val) => handleChange(val)}
          />
        </FormGroup>
      );

    case "boolean":
      return (
        <Switch
          label={field.label}
          checked={Boolean(value)}
          onChange={(e) => handleChange((e.target as HTMLInputElement).checked)}
        />
      );

    case "json":
      return (
        <FormGroup label={field.label} style={{ margin: 0 }}>
          <TextArea
            fill
            rows={4}
            value={String(value ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 12 }}
          />
        </FormGroup>
      );

    case "select":
      return (
        <FormGroup label={field.label} style={{ margin: 0 }}>
          <HTMLSelect
            fill
            value={String(value ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            options={
              field.options?.map((opt) => ({
                label: opt.label,
                value: opt.value,
              })) ?? []
            }
          />
        </FormGroup>
      );

    default:
      return null;
  }
}
