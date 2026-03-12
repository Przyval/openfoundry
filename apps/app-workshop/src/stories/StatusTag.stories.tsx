import type { Meta, StoryObj } from "@storybook/react";
import { StatusTag } from "@openfoundry/ui-components";

const meta: Meta<typeof StatusTag> = {
  title: "Components/StatusTag",
  component: StatusTag,
  argTypes: {
    status: { control: "text" },
    intent: {
      control: "select",
      options: ["none", "primary", "success", "warning", "danger"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusTag>;

export const Active: Story = {
  args: { status: "ACTIVE" },
};

export const Inactive: Story = {
  args: { status: "INACTIVE" },
};

export const Pending: Story = {
  args: { status: "PENDING" },
};

export const Error: Story = {
  args: { status: "ERROR" },
};

export const Warning: Story = {
  args: { status: "WARNING" },
};

export const Running: Story = {
  args: { status: "RUNNING" },
};

export const Failed: Story = {
  args: { status: "FAILED" },
};

export const CustomIntent: Story = {
  args: { status: "Custom Status", intent: "warning" },
};

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {[
        "ACTIVE",
        "RUNNING",
        "HEALTHY",
        "COMPLETED",
        "INACTIVE",
        "PAUSED",
        "DISABLED",
        "PENDING",
        "PROCESSING",
        "IN_PROGRESS",
        "WARNING",
        "DEGRADED",
        "UNSTABLE",
        "ERROR",
        "FAILED",
        "CRITICAL",
        "DELETED",
      ].map((status) => (
        <StatusTag key={status} status={status} />
      ))}
    </div>
  ),
};
