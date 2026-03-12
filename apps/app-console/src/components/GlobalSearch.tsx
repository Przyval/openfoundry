import { useCallback, useEffect, useRef, useState } from "react";
import {
  InputGroup,
  Menu,
  MenuItem,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SearchResult {
  rid: string;
  entityType: string;
  title: string;
  description?: string;
  highlight?: string;
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ENTITY_ICON: Record<string, IconName> = {
  ONTOLOGY: "diagram-tree",
  OBJECT_TYPE: "cube",
  OBJECT: "th",
  DATASET: "database",
  RESOURCE: "folder-close",
  FUNCTION: "function",
  ACTION: "play",
  USER: "person",
  GROUP: "group-objects",
};

function iconForType(entityType: string): IconName {
  return ENTITY_ICON[entityType] ?? "search";
}

/** Map an entity type + rid to a client-side route. */
function routeForResult(result: SearchResult): string {
  switch (result.entityType) {
    case "ONTOLOGY":
      return "/ontology";
    case "DATASET":
      return "/datasets";
    case "FUNCTION":
      return "/functions";
    case "ACTION":
      return "/actions";
    case "USER":
      return "/admin/users";
    case "GROUP":
      return "/admin/groups";
    default:
      return "/";
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Debounced fetch
  // -----------------------------------------------------------------------

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTotalCount(0);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const url = `${API_BASE_URL}/api/v2/search?q=${encodeURIComponent(q)}&limit=10`;
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setResults([]);
        setTotalCount(0);
        return;
      }
      const data = (await res.json()) as SearchResponse;
      setResults(data.results);
      setTotalCount(data.totalCount);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchResults(value);
      }, 300);
    },
    [fetchResults],
  );

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || results.length === 0) {
        if (e.key === "Escape") {
          setOpen(false);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            const result = results[activeIndex];
            navigate(routeForResult(result));
            setOpen(false);
            setQuery("");
          }
          break;
        case "Escape":
          setOpen(false);
          break;
      }
    },
    [open, results, activeIndex, navigate],
  );

  // -----------------------------------------------------------------------
  // Click outside to close
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div ref={containerRef} style={{ position: "relative", width: 320 }}>
      <InputGroup
        inputRef={inputRef}
        leftIcon="search"
        placeholder="Search everything..."
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query.trim() && results.length > 0) setOpen(true);
        }}
        rightElement={loading ? <Spinner size={16} /> : undefined}
        small
      />

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: 400,
            overflowY: "auto",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            borderRadius: 4,
            background: "var(--pt-app-background-color, #fff)",
          }}
        >
          <Menu>
            {results.map((result, idx) => (
              <MenuItem
                key={result.rid}
                icon={iconForType(result.entityType)}
                text={
                  <div>
                    <div style={{ fontWeight: 500 }}>{result.title}</div>
                    {result.description && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "#5c7080",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 260,
                        }}
                      >
                        {result.description}
                      </div>
                    )}
                  </div>
                }
                labelElement={
                  <Tag minimal round style={{ fontSize: "0.7rem" }}>
                    {result.entityType}
                  </Tag>
                }
                active={idx === activeIndex}
                onClick={() => {
                  navigate(routeForResult(result));
                  setOpen(false);
                  setQuery("");
                }}
              />
            ))}
            {totalCount > results.length && (
              <MenuItem
                disabled
                text={`${totalCount - results.length} more results...`}
                style={{ fontStyle: "italic", fontSize: "0.85rem" }}
              />
            )}
          </Menu>
        </div>
      )}

      {open && query.trim() && !loading && results.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            padding: "12px 16px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            borderRadius: 4,
            background: "var(--pt-app-background-color, #fff)",
            color: "#5c7080",
            fontSize: "0.9rem",
          }}
        >
          No results found.
        </div>
      )}
    </div>
  );
}
