import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "@blueprintjs/core";
import { ConfirmDialog } from "@openfoundry/ui-components";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  argTypes: {
    isOpen: { control: "boolean" },
    title: { control: "text" },
    message: { control: "text" },
    confirmLabel: { control: "text" },
    cancelLabel: { control: "text" },
    intent: { control: "select", options: ["primary", "danger"] },
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    isOpen: true,
    title: "Confirm Action",
    message: "Are you sure you want to proceed with this action?",
    onConfirm: () => alert("Confirmed"),
    onCancel: () => alert("Cancelled"),
  },
};

export const DangerIntent: Story = {
  args: {
    isOpen: true,
    title: "Delete Object Type",
    message:
      "This will permanently delete the object type and all associated objects. This action cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Keep",
    intent: "danger",
    onConfirm: () => alert("Deleted"),
    onCancel: () => alert("Cancelled"),
  },
};

export const CustomLabels: Story = {
  args: {
    isOpen: true,
    title: "Publish Changes",
    message: "Publishing will make your changes visible to all users in the organization.",
    confirmLabel: "Publish Now",
    cancelLabel: "Go Back",
    intent: "primary",
    onConfirm: () => alert("Published"),
    onCancel: () => alert("Cancelled"),
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    title: "Hidden Dialog",
    message: "This dialog is not visible.",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const Interactive: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button text="Open Dialog" onClick={() => setIsOpen(true)} intent="primary" />
        <ConfirmDialog
          isOpen={isOpen}
          title="Confirm Deletion"
          message="Are you sure you want to delete this resource?"
          intent="danger"
          confirmLabel="Delete"
          onConfirm={() => {
            setIsOpen(false);
            alert("Resource deleted.");
          }}
          onCancel={() => setIsOpen(false)}
        />
      </>
    );
  },
};
