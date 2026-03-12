import { useCallback } from "react";
import { Tooltip } from "@blueprintjs/core";

export interface RidLinkProps {
  rid: string;
  onClick?: (rid: string) => void;
  compact?: boolean;
}

function abbreviateRid(rid: string): string {
  if (rid.length <= 16) return rid;
  return `${rid.slice(0, 8)}...${rid.slice(-8)}`;
}

export function RidLink({
  rid,
  onClick,
  compact = false,
}: RidLinkProps): JSX.Element {
  const handleClick = useCallback(() => {
    onClick?.(rid);
  }, [rid, onClick]);

  const display = compact ? abbreviateRid(rid) : rid;

  const linkElement = (
    <a
      role="button"
      tabIndex={0}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") handleClick();
            }
          : undefined
      }
      style={{
        cursor: onClick ? "pointer" : "default",
        fontFamily: "monospace",
        fontSize: "12px",
        textDecoration: onClick ? "underline" : "none",
      }}
    >
      {display}
    </a>
  );

  if (compact) {
    return (
      <Tooltip content={rid} placement="top">
        {linkElement}
      </Tooltip>
    );
  }

  return linkElement;
}
