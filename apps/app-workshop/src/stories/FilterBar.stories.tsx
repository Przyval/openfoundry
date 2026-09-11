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

function FilterBarStory({
  properties,
  initialFilters = [],
}: {
  properties: FilterProperty[];
  initialFilters?: Filter[];
}) {
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  return (
    <FilterBar properties={properties} filters={filters} onFiltersChange={setFilters} />
  );
}

export const Default: Story = {
  render: () => <FilterBarStory properties={stringProperties} />,
};

export const WithActiveFilters: Story = {
  render: () => (
    <FilterBarStory
      properties={stringProperties}
      initialFilters={[
        { property: "name", operator: "contains", value: "Employee" },
        { property: "owner", operator: "eq", value: "admin" },
      ]}
    />
  ),
};

export const MixedPropertyTypes: Story = {
  render: () => (
    <FilterBarStory
      properties={mixedProperties}
      initialFilters={[
        { property: "name", operator: "contains", value: "John" },
        { property: "age", operator: "gte", value: "25" },
        { property: "isActive", operator: "eq", value: "true" },
      ]}
    />
  ),
};

export const SingleFilter: Story = {
  render: () => (
    <FilterBarStory
      properties={stringProperties}
      initialFilters={[{ property: "name", operator: "eq", value: "Project Alpha" }]}
    />
  ),
};
