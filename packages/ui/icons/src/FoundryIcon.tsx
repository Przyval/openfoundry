import { Icon, type IconName } from "@blueprintjs/core";
import { iconMap } from "./icon-map.js";

export interface FoundryIconProps {
  name: keyof typeof iconMap;
  size?: number;
  color?: string;
  className?: string;
}

export function FoundryIcon({
  name,
  size = 16,
  color,
  className,
}: FoundryIconProps): JSX.Element {
  const blueprintIcon = iconMap[name] as IconName;

  return (
    <Icon
      icon={blueprintIcon}
      size={size}
      color={color}
      className={className}
    />
  );
}
