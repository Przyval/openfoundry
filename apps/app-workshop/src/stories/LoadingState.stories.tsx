import type { Meta, StoryObj } from "@storybook/react";
import { LoadingState, ErrorState, EmptyState } from "@openfoundry/ui-components";

const loadingMeta: Meta<typeof LoadingState> = {
  title: "Components/LoadingState",
  component: LoadingState,
  argTypes: {
    message: { control: "text" },
  },
};

export default loadingMeta;
type LoadingStory = StoryObj<typeof LoadingState>;

export const Default: LoadingStory = {
  args: {},
};

export const CustomMessage: LoadingStory = {
  args: {
    message: "Fetching object types...",
  },
};

export const ErrorDefault: StoryObj<typeof ErrorState> = {
  render: () => (
    <ErrorState
      title="Failed to load data"
      message="An unexpected error occurred while fetching objects. Please try again."
      onRetry={() => alert("Retrying...")}
    />
  ),
};

export const ErrorWithoutRetry: StoryObj<typeof ErrorState> = {
  render: () => (
    <ErrorState
      title="Permission Denied"
      message="You do not have access to view this resource. Contact your administrator."
    />
  ),
};

export const EmptyDefault: StoryObj<typeof EmptyState> = {
  render: () => (
    <EmptyState
      title="No objects found"
      description="There are no objects matching your current filters."
    />
  ),
};

export const EmptyWithAction: StoryObj<typeof EmptyState> = {
  render: () => (
    <EmptyState
      title="No object types"
      description="Get started by creating your first object type."
      action={{
        label: "Create Object Type",
        onClick: () => alert("Creating..."),
      }}
    />
  ),
};

export const EmptyMinimal: StoryObj<typeof EmptyState> = {
  render: () => <EmptyState title="No results" />,
};
