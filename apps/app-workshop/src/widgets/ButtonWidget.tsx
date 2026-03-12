import { Button, Intent } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

interface ButtonWidgetProps {
  config: Record<string, unknown>;
}

function toIntent(value: string): Intent {
  switch (value) {
    case "primary": return Intent.PRIMARY;
    case "success": return Intent.SUCCESS;
    case "warning": return Intent.WARNING;
    case "danger": return Intent.DANGER;
    default: return Intent.NONE;
  }
}

export function ButtonWidget({ config }: ButtonWidgetProps) {
  const text = (config.text as string) || "Button";
  const intent = (config.intent as string) || "none";
  const icon = (config.icon as string) || undefined;
  const action = (config.action as string) || "none";
  const navigateTo = (config.navigateTo as string) || "";

  const handleClick = () => {
    if (action === "navigate" && navigateTo) {
      window.location.href = navigateTo;
    } else if (action === "alert") {
      alert(`Button "${text}" clicked!`);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <Button
        text={text}
        intent={toIntent(intent)}
        icon={icon as IconName}
        onClick={handleClick}
        large
      />
    </div>
  );
}
