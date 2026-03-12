import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
