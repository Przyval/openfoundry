interface TextWidgetProps {
  config: Record<string, unknown>;
}

export function TextWidget({ config }: TextWidgetProps) {
  const content = (config.content as string) || "<p>No content</p>";

  return (
    <div
      className="text-widget"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
