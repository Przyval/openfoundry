import type { Meta, StoryObj } from "@storybook/react";
import { FoundryIcon, iconMap } from "@openfoundry/ui-icons";

const meta: Meta<typeof FoundryIcon> = {
  title: "Components/FoundryIcon",
  component: FoundryIcon,
  argTypes: {
    name: {
      control: "select",
      options: Object.keys(iconMap),
    },
    size: { control: { type: "range", min: 12, max: 48, step: 4 } },
    color: { control: "color" },
  },
};

export default meta;
type Story = StoryObj<typeof FoundryIcon>;

export const Default: Story = {
  args: {
    name: "ontology",
    size: 20,
  },
};

export const Large: Story = {
  args: {
    name: "dataset",
    size: 40,
    color: "#2965CC",
  },
};

export const AllIcons: Story = {
  render: () => {
    const names = Object.keys(iconMap) as Array<keyof typeof iconMap>;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 16,
        }}
      >
        {names.map((name) => (
          <div
            key={name}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: 12,
              borderRadius: 4,
              border: "1px solid #e1e8ed",
            }}
          >
            <FoundryIcon name={name} size={24} />
            <span style={{ fontSize: 11, color: "#5c7080", textAlign: "center" }}>
              {name}
            </span>
          </div>
        ))}
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "end", gap: 16 }}>
      {[12, 16, 20, 24, 32, 40, 48].map((size) => (
        <div
          key={size}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <FoundryIcon name="ontology" size={size} />
          <span style={{ fontSize: 11, color: "#5c7080" }}>{size}px</span>
        </div>
      ))}
    </div>
  ),
};

export const Colored: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <FoundryIcon name="objectType" size={24} color="#2965CC" />
      <FoundryIcon name="actionType" size={24} color="#29A634" />
      <FoundryIcon name="linkType" size={24} color="#D13913" />
      <FoundryIcon name="interfaceType" size={24} color="#9179F2" />
      <FoundryIcon name="dataset" size={24} color="#D9822B" />
    </div>
  ),
};
