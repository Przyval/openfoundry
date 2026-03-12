import { NonIdealState } from "@blueprintjs/core";

interface ImageWidgetProps {
  config: Record<string, unknown>;
}

export function ImageWidget({ config }: ImageWidgetProps) {
  const src = (config.src as string) || "";
  const alt = (config.alt as string) || "Image";
  const objectFit = (config.objectFit as string) || "cover";

  if (!src) {
    return <NonIdealState icon="media" title="No image URL" description="Set an image URL in the config panel" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: "100%",
        height: "100%",
        objectFit: objectFit as React.CSSProperties["objectFit"],
        borderRadius: 2,
      }}
    />
  );
}
