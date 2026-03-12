import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PaginationBar } from "@openfoundry/ui-components";

const meta: Meta<typeof PaginationBar> = {
  title: "Components/PaginationBar",
  component: PaginationBar,
  argTypes: {
    hasNext: { control: "boolean" },
    hasPrevious: { control: "boolean" },
    pageSize: { control: "number" },
    totalCount: { control: "number" },
  },
};

export default meta;
type Story = StoryObj<typeof PaginationBar>;

export const Default: Story = {
  args: {
    hasNext: true,
    hasPrevious: false,
    pageSize: 25,
    totalCount: 150,
    onNext: () => alert("Next page"),
    onPrevious: () => alert("Previous page"),
  },
};

export const MiddlePage: Story = {
  args: {
    hasNext: true,
    hasPrevious: true,
    pageSize: 25,
    totalCount: 150,
    onNext: () => alert("Next page"),
    onPrevious: () => alert("Previous page"),
  },
};

export const LastPage: Story = {
  args: {
    hasNext: false,
    hasPrevious: true,
    pageSize: 25,
    totalCount: 150,
    onNext: () => alert("Next page"),
    onPrevious: () => alert("Previous page"),
  },
};

export const SinglePage: Story = {
  args: {
    hasNext: false,
    hasPrevious: false,
    pageSize: 25,
    totalCount: 10,
    onNext: () => {},
    onPrevious: () => {},
  },
};

export const WithPageSizeControl: Story = {
  render: () => {
    const [pageSize, setPageSize] = useState(25);
    return (
      <PaginationBar
        hasNext={true}
        hasPrevious={true}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        totalCount={500}
        onNext={() => alert("Next")}
        onPrevious={() => alert("Previous")}
      />
    );
  },
};

export const WithoutTotalCount: Story = {
  args: {
    hasNext: true,
    hasPrevious: false,
    pageSize: 10,
    onNext: () => alert("Next page"),
    onPrevious: () => alert("Previous page"),
  },
};

export const LargeDataset: Story = {
  args: {
    hasNext: true,
    hasPrevious: true,
    pageSize: 100,
    totalCount: 1_250_000,
    onNext: () => alert("Next page"),
    onPrevious: () => alert("Previous page"),
  },
};
