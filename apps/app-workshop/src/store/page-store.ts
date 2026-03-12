import { WidgetInstance } from "../widgets/widget-registry";

/** A Workshop page */
export interface WorkshopPage {
  rid: string;
  name: string;
  description: string;
  widgets: WidgetInstance[];
  createdAt: string;
  updatedAt: string;
}

type Listener = () => void;

/** Generate a page RID */
function generateRid(): string {
  return `ri.workshop.page.${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-memory store for Workshop pages.
 * Implements a simple pub-sub pattern for React integration.
 */
class PageStore {
  private pages: Map<string, WorkshopPage> = new Map();
  private listeners: Set<Listener> = new Set();

  constructor() {
    // Load from localStorage if available
    this.loadFromStorage();
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
    this.saveToStorage();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): WorkshopPage[] {
    return Array.from(this.pages.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  getPage(rid: string): WorkshopPage | undefined {
    return this.pages.get(rid);
  }

  createPage(name: string, description = ""): WorkshopPage {
    const now = new Date().toISOString();
    const page: WorkshopPage = {
      rid: generateRid(),
      name,
      description,
      widgets: [],
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(page.rid, page);
    this.notify();
    return page;
  }

  updatePage(rid: string, updates: Partial<Pick<WorkshopPage, "name" | "description" | "widgets">>): void {
    const page = this.pages.get(rid);
    if (!page) return;
    const updated = {
      ...page,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.pages.set(rid, updated);
    this.notify();
  }

  deletePage(rid: string): void {
    this.pages.delete(rid);
    this.notify();
  }

  /** Export a single page as JSON */
  exportPage(rid: string): string | null {
    const page = this.pages.get(rid);
    if (!page) return null;
    return JSON.stringify(page, null, 2);
  }

  /** Export all pages as JSON */
  exportAll(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  /** Import a page from JSON, returns the page RID */
  importPage(json: string): string {
    const data = JSON.parse(json) as WorkshopPage;
    // Assign a new RID to avoid collisions
    const now = new Date().toISOString();
    const page: WorkshopPage = {
      ...data,
      rid: generateRid(),
      createdAt: now,
      updatedAt: now,
    };
    this.pages.set(page.rid, page);
    this.notify();
    return page.rid;
  }

  private saveToStorage(): void {
    try {
      const data = JSON.stringify(Array.from(this.pages.entries()));
      localStorage.setItem("openfoundry_workshop_pages", data);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem("openfoundry_workshop_pages");
      if (raw) {
        const entries = JSON.parse(raw) as [string, WorkshopPage][];
        this.pages = new Map(entries);
      }
    } catch {
      // Silently fail
    }
  }
}

/** Singleton store instance */
export const pageStore = new PageStore();

// ── React hook ──

import { useSyncExternalStore, useCallback } from "react";

export function usePageStore() {
  const pages = useSyncExternalStore(
    (cb) => pageStore.subscribe(cb),
    () => pageStore.getSnapshot(),
  );

  const getPage = useCallback((rid: string) => pageStore.getPage(rid), []);
  const createPage = useCallback((name: string, desc?: string) => pageStore.createPage(name, desc), []);
  const updatePage = useCallback(
    (rid: string, updates: Partial<Pick<WorkshopPage, "name" | "description" | "widgets">>) =>
      pageStore.updatePage(rid, updates),
    [],
  );
  const deletePage = useCallback((rid: string) => pageStore.deletePage(rid), []);
  const exportPage = useCallback((rid: string) => pageStore.exportPage(rid), []);
  const exportAll = useCallback(() => pageStore.exportAll(), []);
  const importPage = useCallback((json: string) => pageStore.importPage(json), []);

  return { pages, getPage, createPage, updatePage, deletePage, exportPage, exportAll, importPage };
}
