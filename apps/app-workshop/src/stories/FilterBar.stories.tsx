import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FilterBar, type Filter, type FilterProperty } from "@openfoundry/ui-components";

const meta: Meta<typeof FilterBar> = {
  title: "Components/FilterBar",
  component: FilterBar,
};

export default meta;
type Story = StoryObj<typeof FilterBar>;

const stringProperties: FilterProperty[] = [
  { apiName: "name", displayName: "Name", type: "STRING" },
  { apiName: "description", displayName: "Description", type: "STRING" },
  { apiName: "owner", displayName: "Owner", type: "STRING" },
];

const mixedProperties: FilterProperty[] = [
  { apiName: "name", displayName: "Name", type: "STRING" },
  { apiName: "age", displayName: "Age", type: "INTEGER" },
  { apiName: "salary", displayName: "Salary", type: "DOUBLE" },
  { apiName: "isActive", displayName: "Active", type: "BOOLEAN" },
  { apiName: "createdAt", displayName: "Created At", type: "DATETIME" },
];

export const Default: Story = {
  render: () => {
    const [filters, setFilters] = useState<Filter[]>([]);
    return (
      <FilterBar
        properties={stringProperties}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  },
};

export const WithActiveFilters: Story = {
  render: () => {
    const [filters, setFilters] = useState<Filter[]>([
      { property: "name", operator: "contains", value: "Employee" },
      { property: "owner", operator: "eq", value: "admin" },
    ]);
    return (
      <FilterBar
        properties={stringProperties}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  },
};

export const MixedPropertyTypes: Story = {
  render: () => {
    const [filters, setFilters] = useState<Filter[]>([
      { property: "name", operator: "contains", value: "John" },
      { property: "age", operator: "gte", value: "25" },
      { property: "isActive", operator: "eq", value: "true" },
    ]);
    return (
      <FilterBar
        properties={mixedProperties}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  },
};

export const SingleFilter: Story = {
  render: () => {
    const [filters, setFilters] = useState<Filter[]>([
      { property: "name", operator: "eq", value: "Project Alpha" },
    ]);
    return (
      <FilterBar
        properties={stringProperties}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  },
};
