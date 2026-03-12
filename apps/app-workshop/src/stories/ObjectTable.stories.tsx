import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ObjectTable, type ObjectTableColumn } from "@openfoundry/ui-components";

const meta: Meta<typeof ObjectTable> = {
  title: "Components/ObjectTable",
  component: ObjectTable,
  argTypes: {
    loading: { control: "boolean" },
    emptyMessage: { control: "text" },
    primaryKeyField: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof ObjectTable>;

const sampleColumns: ObjectTableColumn[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "createdAt", label: "Created At", sortable: true },
];

const sampleData = [
  { id: "obj-001", name: "Employee", status: "ACTIVE", createdAt: "2025-01-15" },
  { id: "obj-002", name: "Department", status: "ACTIVE", createdAt: "2025-02-01" },
  { id: "obj-003", name: "Equipment", status: "INACTIVE", createdAt: "2025-03-10" },
  { id: "obj-004", name: "Location", status: "PENDING", createdAt: "2025-04-22" },
  { id: "obj-005", name: "Project", status: "ACTIVE", createdAt: "2025-05-30" },
];

export const Default: Story = {
  args: {
    columns: sampleColumns,
    data: sampleData,
  },
};

export const WithRowClick: Story = {
  args: {
    columns: sampleColumns,
    data: sampleData,
    onRowClick: (row) => alert(`Clicked: ${row.name}`),
  },
};

export const Loading: Story = {
  args: {
    columns: sampleColumns,
    data: [],
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    columns: sampleColumns,
    data: [],
    emptyMessage: "No objects found matching your query",
  },
};

export const MinimalColumns: Story = {
  args: {
    columns: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
    ],
    data: [
      { name: "Alpha", value: "100" },
      { name: "Beta", value: "200" },
    ],
  },
};

export const WithSelection: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    return (
      <ObjectTable
        columns={sampleColumns}
        data={sampleData}
        primaryKeyField="id"
        selectedRows={selected}
        onSelectionChange={setSelected}
      />
    );
  },
};

export const LargeDataset: Story = {
  args: {
    columns: [
      { key: "id", label: "ID", sortable: true },
      { key: "name", label: "Name", sortable: true },
      { key: "type", label: "Type", sortable: true },
      { key: "count", label: "Count", sortable: true },
    ],
    data: Array.from({ length: 50 }, (_, i) => ({
      id: `item-${String(i + 1).padStart(3, "0")}`,
      name: `Object Type ${i + 1}`,
      type: ["STRING", "INTEGER", "BOOLEAN", "DATETIME"][i % 4],
      count: String(Math.floor(Math.random() * 1000)),
    })),
  },
};
