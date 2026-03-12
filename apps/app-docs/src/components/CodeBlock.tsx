interface CodeBlockProps {
  language?: string;
  title?: string;
  children: string;
}

export function CodeBlock({ language = "typescript", title, children }: CodeBlockProps) {
  return (
    <div className="code-block">
      {title && <div className="code-block-title">{title}</div>}
      <pre className="code-block-pre">
        <code className={`language-${language}`}>{children.trim()}</code>
      </pre>
    </div>
  );
}
