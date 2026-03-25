import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Colors,
  HTMLSelect,
  HTMLTable,
  Icon,
  InputGroup,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Markdown tables parsed from response. */
  tables?: Array<{ headers: string[]; rows: string[][] }>;
  timestamp: Date;
  model?: string;
}

interface AipChatResponse {
  message: { role: string; content: string };
  model?: string;
  sessionId?: string;
  usage?: { promptTokens: number; completionTokens: number };
}

interface AipAgent {
  rid: string;
  displayName: string;
  description: string;
  capabilities: string[];
  status: string;
  icon: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Discover the pest-control ontology RID (cached). */
let _cachedRid: string | null = null;
let _allOntologies: Array<{ rid: string; displayName: string; apiName: string }> = [];

async function fetchOntologies(): Promise<
  Array<{ rid: string; displayName: string; apiName: string }>
> {
  if (_allOntologies.length > 0) return _allOntologies;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const body = await res.json();
    _allOntologies = (body?.data ?? []).map((o: any) => ({
      rid: o.rid,
      displayName: o.displayName ?? o.apiName ?? "Untitled",
      apiName: o.apiName ?? "",
    }));
    return _allOntologies;
  } catch {
    return [];
  }
}

async function getDefaultOntologyRid(): Promise<string | null> {
  if (_cachedRid) return _cachedRid;
  const ontologies = await fetchOntologies();
  const pest = ontologies.find(
    (o) =>
      o.displayName?.toLowerCase().includes("pest") ||
      o.apiName?.toLowerCase().includes("pest"),
  );
  if (pest) {
    _cachedRid = pest.rid;
    return pest.rid;
  }
  if (ontologies.length > 0) {
    _cachedRid = ontologies[0].rid;
    return _cachedRid;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Parse markdown tables from content                                 */
/* ------------------------------------------------------------------ */

interface ParsedContent {
  text: string;
  tables: Array<{ headers: string[]; rows: string[][] }>;
}

function parseMarkdownTables(content: string): ParsedContent {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Detect table start: line with | and next line with |---|
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].trim().match(/^\|[\s\-:|]+\|$/)
    ) {
      // Parse header
      const headers = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i]
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        rows.push(row);
        i++;
      }
      tables.push({ headers, rows });
      // Add a placeholder so we know where to insert the table
      textLines.push(`__TABLE_${tables.length - 1}__`);
    } else {
      textLines.push(line);
      i++;
    }
  }

  return { text: textLines.join("\n"), tables };
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer (bold, italic, code, lists, headings, links)     */
/* ------------------------------------------------------------------ */

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
): React.ReactNode[] {
  // Process: **bold**, *italic*, `code`, [link](url)
  const parts = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g,
  );
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} style={{ color: "#E1E8ED" }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={key} style={{ color: "#D8E1E8" }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          style={{
            background: "#1A2530",
            padding: "1px 5px",
            borderRadius: 3,
            fontSize: "0.88em",
            color: "#48AFF0",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#48AFF0" }}
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function renderMarkdown(
  content: string,
  tables?: Array<{ headers: string[]; rows: string[][] }>,
): React.ReactNode {
  const parsed = tables
    ? { text: content, tables }
    : parseMarkdownTables(content);
  const lines = parsed.text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    // Table placeholder
    const tableMatch = line.match(/^__TABLE_(\d+)__$/);
    if (tableMatch) {
      const tableIdx = parseInt(tableMatch[1], 10);
      const table = parsed.tables[tableIdx];
      if (table) {
        elements.push(
          <div
            key={`table-${lineIdx}`}
            style={{ marginTop: 8, marginBottom: 8, overflowX: "auto" }}
          >
            <HTMLTable
              bordered
              condensed
              striped
              style={{
                width: "100%",
                fontSize: "0.82rem",
                background: "#263238",
              }}
            >
              <thead>
                <tr>
                  {table.headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        color: "#A7B6C2",
                        fontWeight: 600,
                        padding: "6px 10px",
                        borderBottom: "1px solid #5C7080",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: "5px 10px",
                          color: "#E1E8ED",
                          borderBottom: "1px solid #394B59",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </div>,
        );
      }
      return;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<br key={`br-${lineIdx}`} />);
      return;
    }

    // Heading ##
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(
        <div
          key={`line-${lineIdx}`}
          style={{ fontWeight: 700, fontSize: "1.05rem", marginTop: 6, marginBottom: 2, color: "#F5F8FA" }}
        >
          {renderInlineMarkdown(h2Match[1], `l${lineIdx}`)}
        </div>,
      );
      return;
    }

    // Heading ###
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      elements.push(
        <div
          key={`line-${lineIdx}`}
          style={{ fontWeight: 600, fontSize: "0.98rem", marginTop: 4, marginBottom: 2, color: "#E1E8ED" }}
        >
          {renderInlineMarkdown(h3Match[1], `l${lineIdx}`)}
        </div>,
      );
      return;
    }

    // Bullet list
    const isBullet = line.trim().startsWith("- ");
    if (isBullet) {
      const displayLine = line.trim().slice(2);
      elements.push(
        <div
          key={`line-${lineIdx}`}
          style={{ display: "flex", gap: 6, paddingLeft: 8, marginBottom: 2 }}
        >
          <span style={{ flexShrink: 0, color: "#5C7080" }}>&#x2022;</span>
          <span>{renderInlineMarkdown(displayLine, `l${lineIdx}`)}</span>
        </div>,
      );
      return;
    }

    // Numbered list
    const numMatch = line.trim().match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div
          key={`line-${lineIdx}`}
          style={{ display: "flex", gap: 6, paddingLeft: 8, marginBottom: 2 }}
        >
          <span style={{ flexShrink: 0, color: "#5C7080", minWidth: 16, textAlign: "right" }}>
            {numMatch[1]}.
          </span>
          <span>{renderInlineMarkdown(numMatch[2], `l${lineIdx}`)}</span>
        </div>,
      );
      return;
    }

    // Regular line
    elements.push(
      <div key={`line-${lineIdx}`} style={{ marginBottom: 2 }}>
        {renderInlineMarkdown(line, `l${lineIdx}`)}
      </div>,
    );
  });

  return <>{elements}</>;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "calc(100vh - 100px)",
    maxHeight: "calc(100vh - 100px)",
    overflow: "hidden",
  } as React.CSSProperties,

  chatArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  } as React.CSSProperties,

  userBubble: {
    alignSelf: "flex-end" as const,
    background: "#2B95D6",
    color: "#ffffff",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "70%",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
  } as React.CSSProperties,

  assistantBubble: {
    alignSelf: "flex-start" as const,
    background: "#30404D",
    color: "#F5F8FA",
    padding: "12px 16px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "85%",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
    position: "relative" as const,
  } as React.CSSProperties,

  inputBar: {
    padding: "12px 24px 16px 24px",
    borderTop: `1px solid ${Colors.DARK_GRAY5}`,
    background: "#293742",
    display: "flex",
    gap: 8,
    alignItems: "center",
  } as React.CSSProperties,

  suggestionsRow: {
    padding: "8px 24px 0 24px",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  } as React.CSSProperties,

  modelBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    fontSize: "0.7rem",
    color: "#8A9BA8",
    opacity: 0.8,
  } as React.CSSProperties,

  thinkingDots: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    background: "#30404D",
    borderRadius: "16px 16px 16px 4px",
    alignSelf: "flex-start" as const,
    color: "#A7B6C2",
    fontSize: "0.9rem",
  } as React.CSSProperties,

  timestamp: {
    fontSize: "0.7rem",
    color: "#8A9BA8",
    marginTop: 4,
    textAlign: "right" as const,
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Suggested queries                                                  */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  "How many active customers?",
  "Show pending jobs",
  "Who is the best technician?",
  "Total revenue",
  "Low stock products",
  "Give me a summary",
];

/* ------------------------------------------------------------------ */
/*  Welcome message                                                    */
/* ------------------------------------------------------------------ */

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to **AIP Chat** (AI Platform). I can help you query and explore your ontology data using natural language.\n\n" +
    "Ask me anything about **customers**, **technicians**, **service jobs**, **products**, or **invoices**.\n\n" +
    "Type a question below or click one of the suggestions to get started.",
  timestamp: new Date(),
  model: "system",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIPChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [ontologies, setOntologies] = useState<
    Array<{ rid: string; displayName: string }>
  >([]);
  const [selectedOntologyRid, setSelectedOntologyRid] = useState<string>("");
  const [agents, setAgents] = useState<AipAgent[]>([]);
  const [showAgents, setShowAgents] = useState(false);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Load ontologies and agents on mount */
  useEffect(() => {
    (async () => {
      const onts = await fetchOntologies();
      setOntologies(onts);
      const defaultRid = await getDefaultOntologyRid();
      if (defaultRid) setSelectedOntologyRid(defaultRid);
    })();

    // Fetch agents
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v2/aip/agents`, {
          method: "POST",
          headers: authHeaders(),
        });
        if (res.ok) {
          const body = await res.json();
          setAgents(body?.data ?? []);
        }
      } catch {
        // agents not available
      }
    })();
  }, []);

  /* Auto-scroll to bottom */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatAreaRef.current) {
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinking, scrollToBottom]);

  /* Send a message */
  const handleSend = useCallback(
    async (text?: string) => {
      const query = (text ?? input).trim();
      if (!query || thinking) return;

      const userMsg: ChatMessage = {
        id: msgId(),
        role: "user",
        content: query,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setThinking(true);

      try {
        const res = await fetch(`${API_BASE_URL}/api/v2/aip/chat`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            messages: [{ role: "user", content: query }],
            ontologyRid: selectedOntologyRid || undefined,
            sessionId: sessionId ?? undefined,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: AipChatResponse = await res.json();

        // Track model and session
        if (data.model) setActiveModel(data.model);
        if (data.sessionId) setSessionId(data.sessionId);

        const content = data.message?.content ?? "No response received.";

        // Parse any markdown tables from the content
        const parsed = parseMarkdownTables(content);

        const assistantMsg: ChatMessage = {
          id: msgId(),
          role: "assistant",
          content: parsed.text,
          tables:
            parsed.tables.length > 0 ? parsed.tables : undefined,
          timestamp: new Date(),
          model: data.model,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        // If svc-aip is unreachable, show a helpful error
        const errMsg: ChatMessage = {
          id: msgId(),
          role: "assistant",
          content:
            "I was unable to reach the AIP service. Please make sure **svc-aip** is running on port 8092.\n\n" +
            "You can start it with:\n" +
            "```\ncd services/svc-aip && pnpm dev\n```",
          timestamp: new Date(),
          model: "error",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setThinking(false);
        inputRef.current?.focus();
      }
    },
    [input, thinking, selectedOntologyRid, sessionId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      void handleSend(suggestion);
    },
    [handleSend],
  );

  const handleClearChat = useCallback(() => {
    // If there's a session, clear it on the backend too
    if (sessionId) {
      fetch(`${API_BASE_URL}/api/v2/aip/sessions/${sessionId}`, {
        method: "DELETE",
        headers: authHeaders(),
      }).catch(() => {});
    }

    setMessages([
      { ...WELCOME_MESSAGE, id: msgId(), timestamp: new Date() },
    ]);
    setSessionId(null);
    setActiveModel(null);
  }, [sessionId]);

  /* ---------------------------------------------------------------- */
  /*  Model display name                                               */
  /* ---------------------------------------------------------------- */

  function modelDisplayName(model?: string | null): string {
    if (!model || model === "system") return "";
    if (model === "error") return "Offline";
    if (model === "mock-smart") return "Smart Mock (Ontology-Aware)";
    if (model === "mock") return "Mock";
    if (model.includes("gpt")) return `OpenAI ${model}`;
    if (model.includes("claude")) return `Anthropic ${model}`;
    return model;
  }

  function modelIntent(
    model?: string | null,
  ): "none" | "primary" | "success" | "warning" | "danger" {
    if (!model) return "none";
    if (model === "error") return "danger";
    if (model.startsWith("mock")) return "warning";
    if (model.includes("gpt")) return "success";
    if (model.includes("claude")) return "primary";
    return "none";
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <PageHeader
        title="AIP Chat"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Ontology selector */}
            {ontologies.length > 0 && (
              <HTMLSelect
                minimal
                value={selectedOntologyRid}
                onChange={(e) => setSelectedOntologyRid(e.target.value)}
                style={{
                  background: "#30404D",
                  color: "#F5F8FA",
                  border: "1px solid #5C7080",
                  borderRadius: 4,
                  fontSize: "0.85rem",
                }}
              >
                <option value="">All Ontologies</option>
                {ontologies.map((o) => (
                  <option key={o.rid} value={o.rid}>
                    {o.displayName}
                  </option>
                ))}
              </HTMLSelect>
            )}

            {/* Model indicator */}
            {activeModel && activeModel !== "system" && (
              <Tag
                icon="predictive-analysis"
                minimal
                intent={modelIntent(activeModel)}
                round
              >
                {modelDisplayName(activeModel)}
              </Tag>
            )}

            {/* Agents toggle */}
            <Button
              icon="people"
              text="Agents"
              minimal
              small
              active={showAgents}
              onClick={() => setShowAgents((v) => !v)}
            />

            {/* Connection status */}
            <Tag
              icon="globe-network"
              minimal
              intent="success"
              round
            >
              Connected
            </Tag>

            <Button
              icon="trash"
              text="Clear"
              minimal
              small
              onClick={handleClearChat}
            />
          </div>
        }
      />

      {/* Agent cards panel */}
      {showAgents && agents.length > 0 && (
        <Card
          style={{
            marginBottom: 12,
            background: "#1F2933",
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#A7B6C2",
              marginBottom: 10,
            }}
          >
            Available AI Agents
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 10,
            }}
          >
            {agents.map((agent) => (
              <Card
                key={agent.rid}
                interactive
                style={{
                  background: "#293742",
                  padding: "10px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                onClick={() => {
                  void handleSend(
                    `Tell me about the ${agent.displayName} capabilities`,
                  );
                  setShowAgents(false);
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <Icon
                    icon={agent.icon as any}
                    size={14}
                    color="#2B95D6"
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      color: "#F5F8FA",
                      fontSize: "0.88rem",
                    }}
                  >
                    {agent.displayName}
                  </span>
                  <Tag
                    minimal
                    round
                    intent={agent.status === "active" ? "success" : "none"}
                    style={{ fontSize: "0.7rem", marginLeft: "auto" }}
                  >
                    {agent.status}
                  </Tag>
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#A7B6C2",
                    lineHeight: 1.4,
                  }}
                >
                  {agent.description}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      <Card
        style={{
          padding: 0,
          borderRadius: 8,
          overflow: "hidden",
          background: "#1F2933",
        }}
      >
        <div style={styles.container}>
          {/* -------- AIP Header Bar -------- */}
          <div
            style={{
              padding: "12px 24px",
              background:
                "linear-gradient(135deg, #1F4B99 0%, #2B95D6 100%)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Icon icon="chat" size={20} color="#fff" />
            <div>
              <div
                style={{
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "1rem",
                }}
              >
                AIP -- AI Platform
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "0.75rem",
                }}
              >
                Natural Language Ontology Interface
                {selectedOntologyRid
                  ? ` | ${ontologies.find((o) => o.rid === selectedOntologyRid)?.displayName ?? "Selected"}`
                  : ""}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            {sessionId && (
              <Tag
                minimal
                round
                style={{
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)",
                  border: "none",
                  fontSize: "0.7rem",
                }}
              >
                Session active
              </Tag>
            )}
            <Tag
              minimal
              round
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "none",
              }}
            >
              <Icon
                icon="symbol-circle"
                size={8}
                style={{ color: "#3DCC91", marginRight: 4 }}
              />
              Online
            </Tag>
          </div>

          {/* -------- Chat messages -------- */}
          <div ref={chatAreaRef} style={styles.chatArea}>
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  /* User bubble */
                  <div style={styles.userBubble}>{msg.content}</div>
                ) : (
                  /* Assistant bubble */
                  <div style={styles.assistantBubble}>
                    {renderMarkdown(msg.content, msg.tables)}

                    {/* Model badge */}
                    {msg.model && msg.model !== "system" && (
                      <div style={styles.modelBadge}>
                        <Icon
                          icon={
                            msg.model === "error"
                              ? "error"
                              : msg.model?.startsWith("mock")
                                ? "lab-test"
                                : "predictive-analysis"
                          }
                          size={10}
                        />
                        {modelDisplayName(msg.model)}
                      </div>
                    )}

                    {/* Ontology badge for non-error messages */}
                    {msg.model !== "error" && msg.id !== "welcome" && (
                      <div
                        style={{
                          ...styles.modelBadge,
                          marginTop: 2,
                          opacity: 0.6,
                        }}
                      >
                        <Icon icon="database" size={10} />
                        Powered by Ontology
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <div
                  style={{
                    ...styles.timestamp,
                    textAlign:
                      msg.role === "user" ? "right" : "left",
                  }}
                >
                  {msg.timestamp.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && (
              <div style={styles.thinkingDots}>
                <Spinner size={16} intent="primary" />
                <span>AIP is thinking...</span>
              </div>
            )}
          </div>

          {/* -------- Suggestion chips -------- */}
          {messages.length <= 1 && !thinking && (
            <div style={styles.suggestionsRow}>
              {SUGGESTIONS.map((s) => (
                <Tag
                  key={s}
                  interactive
                  round
                  minimal
                  intent="primary"
                  onClick={() => handleSuggestionClick(s)}
                  style={{
                    cursor: "pointer",
                    padding: "4px 12px",
                    fontSize: "0.82rem",
                  }}
                >
                  {s}
                </Tag>
              ))}
            </div>
          )}

          {/* -------- Input bar -------- */}
          <div style={styles.inputBar}>
            <InputGroup
              inputRef={inputRef as any}
              fill
              large
              placeholder="Ask something about your data..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={thinking}
              leftIcon="search"
              style={{
                background: "#1F2933",
                borderRadius: 8,
              }}
              rightElement={
                <Button
                  icon="arrow-right"
                  intent="primary"
                  minimal
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || thinking}
                />
              }
            />
          </div>
        </div>
      </Card>
    </>
  );
}
