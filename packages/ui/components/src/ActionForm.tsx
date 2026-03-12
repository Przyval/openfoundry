import React, { useState, useCallback } from "react";
import {
  Button,
  FormGroup,
  InputGroup,
  NumericInput,
  Switch,
  Intent,
} from "@blueprintjs/core";

export interface ActionParameter {
  apiName: string;
  displayName: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface ActionFormProps {
  actionName: string;
  parameters: ActionParameter[];
  onSubmit: (params: Record<string, unknown>) => void;
  loading?: boolean;
}

export function ActionForm({
  actionName,
  parameters,
  onSubmit,
  loading = false,
}: ActionFormProps): JSX.Element {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const param of parameters) {
      switch (param.type) {
        case "BOOLEAN":
          initial[param.apiName] = false;
          break;
        case "INTEGER":
        case "DOUBLE":
          initial[param.apiName] = undefined;
          break;
        default:
          initial[param.apiName] = "";
      }
    }
    return initial;
  });

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const result: Record<string, unknown> = {};
      for (const param of parameters) {
        const val = values[param.apiName];
        if (val !== undefined && val !== "") {
          result[param.apiName] = val;
        }
      }
      onSubmit(result);
    },
    [values, parameters, onSubmit],
  );

  const renderInput = (param: ActionParameter) => {
    const value = values[param.apiName];

    switch (param.type) {
      case "BOOLEAN":
        return (
          <Switch
            checked={Boolean(value)}
            onChange={(e) =>
              setValue(param.apiName, (e.target as HTMLInputElement).checked)
            }
            label={param.displayName}
            disabled={loading}
          />
        );

      case "INTEGER":
        return (
          <NumericInput
            value={value as number | undefined}
            onValueChange={(num) => setValue(param.apiName, num)}
            fill
            disabled={loading}
            placeholder={param.description ?? `Enter ${param.displayName}`}
            stepSize={1}
            minorStepSize={null}
          />
        );

      case "DOUBLE":
        return (
          <NumericInput
            value={value as number | undefined}
            onValueChange={(num) => setValue(param.apiName, num)}
            fill
            disabled={loading}
            placeholder={param.description ?? `Enter ${param.displayName}`}
            stepSize={0.1}
          />
        );

      case "DATETIME":
        return (
          <InputGroup
            value={String(value ?? "")}
            onChange={(e) => setValue(param.apiName, e.currentTarget.value)}
            fill
            disabled={loading}
            placeholder="YYYY-MM-DDTHH:mm:ss"
            type="datetime-local"
          />
        );

      case "STRING":
      default:
        return (
          <InputGroup
            value={String(value ?? "")}
            onChange={(e) => setValue(param.apiName, e.currentTarget.value)}
            fill
            disabled={loading}
            placeholder={param.description ?? `Enter ${param.displayName}`}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h4 style={{ marginBottom: 16 }}>{actionName}</h4>
      {parameters.map((param) => (
        <FormGroup
          key={param.apiName}
          label={param.type !== "BOOLEAN" ? param.displayName : undefined}
          labelInfo={param.required ? "(required)" : undefined}
          helperText={param.description}
        >
          {renderInput(param)}
        </FormGroup>
      ))}
      <Button
        type="submit"
        intent={Intent.PRIMARY}
        text="Execute"
        loading={loading}
        disabled={loading}
      />
    </form>
  );
}
