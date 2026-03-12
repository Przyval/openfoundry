import type { Meta, StoryObj } from "@storybook/react";
import { RidLink } from "@openfoundry/ui-components";

const meta: Meta<typeof RidLink> = {
  title: "Components/RidLink",
  component: RidLink,
  argTypes: {
    rid: { control: "text" },
    compact: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof RidLink>;

const sampleRid = "ri.ontology.main.object-type.abc12345-def6-7890-ghij-klmnopqrstuv";

export const Default: Story = {
  args: {
    rid: sampleRid,
  },
};

export const Compact: Story = {
  args: {
    rid: sampleRid,
    compact: true,
  },
};

export const Clickable: Story = {
  args: {
    rid: sampleRid,
    onClick: (rid: string) => alert(`Navigating to: ${rid}`),
  },
};

export const CompactClickable: Story = {
  args: {
    rid: sampleRid,
    compact: true,
    onClick: (rid: string) => alert(`Navigating to: ${rid}`),
  },
};

export const ShortRid: Story = {
  args: {
    rid: "ri.short.id",
  },
};

export const MultipleRids: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <RidLink rid="ri.ontology.main.object-type.00000001-0000-0000-0000-000000000001" compact />
      <RidLink rid="ri.ontology.main.object-type.00000002-0000-0000-0000-000000000002" compact />
      <RidLink rid="ri.ontology.main.object-type.00000003-0000-0000-0000-000000000003" compact />
      <RidLink rid="ri.ontology.main.link-type.aaaabbbb-cccc-dddd-eeee-ffffffffffff" compact />
      <RidLink rid="ri.ontology.main.action-type.11112222-3333-4444-5555-666677778888" compact />
    </div>
  ),
};
