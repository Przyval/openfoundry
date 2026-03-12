import type { ReactNode } from "react";
import { DocNav } from "./DocNav";

interface DocLayoutProps {
  children: ReactNode;
}

export function DocLayout({ children }: DocLayoutProps) {
  return (
    <div className="doc-layout">
      <header className="doc-header">
        <div className="doc-header-inner">
          <a href="/" className="doc-logo">
            <span className="doc-logo-mark">OF</span>
            <span className="doc-logo-text">OpenFoundry Docs</span>
          </a>
          <nav className="doc-header-nav">
            <a
              href="https://github.com/openfoundry/openfoundry"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer">
              Console
            </a>
          </nav>
        </div>
      </header>
      <div className="doc-body">
        <aside className="doc-sidebar">
          <DocNav />
        </aside>
        <main className="doc-content">
          {children}
        </main>
      </div>
    </div>
  );
}
