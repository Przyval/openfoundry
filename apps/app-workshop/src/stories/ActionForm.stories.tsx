import type { Meta, StoryObj } from "@storybook/react";
import { ActionForm, type ActionParameter } from "@openfoundry/ui-components";

const meta: Meta<typeof ActionForm> = {
  title: "Components/ActionForm",
  component: ActionForm,
  argTypes: {
    loading: { control: "boolean" },
    actionName: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof ActionForm>;

const stringParams: ActionParameter[] = [
  {
    apiName: "firstName",
    displayName: "First Name",
    type: "STRING",
    required: true,
    description: "The employee's first name",
  },
  {
    apiName: "lastName",
    displayName: "Last Name",
    type: "STRING",
    required: true,
    description: "The employee's last name",
  },
  {
    apiName: "email",
    displayName: "Email",
    type: "STRING",
    required: false,
    description: "Optional email address",
  },
];

const mixedParams: ActionParameter[] = [
  {
    apiName: "title",
    displayName: "Title",
    type: "STRING",
    required: true,
    description: "Project title",
  },
  {
    apiName: "budget",
    displayName: "Budget",
    type: "DOUBLE",
    required: true,
    description: "Project budget in USD",
  },
  {
    apiName: "headcount",
    displayName: "Headcount",
    type: "INTEGER",
    required: false,
    description: "Number of team members",
  },
  {
    apiName: "isPublic",
    displayName: "Public Project",
    type: "BOOLEAN",
    required: false,
    description: "Whether the project is visible to all users",
  },
  {
    apiName: "startDate",
    displayName: "Start Date",
    type: "DATETIME",
    required: false,
    description: "When the project starts",
  },
];

const handleSubmit = (params: Record<string, unknown>) => {
  alert(`Submitted: ${JSON.stringify(params, null, 2)}`);
};

export const Default: Story = {
  args: {
    actionName: "Create Employee",
    parameters: stringParams,
    onSubmit: handleSubmit,
  },
};

export const MixedParameterTypes: Story = {
  args: {
    actionName: "Create Project",
    parameters: mixedParams,
    onSubmit: handleSubmit,
  },
};

export const Loading: Story = {
  args: {
    actionName: "Create Employee",
    parameters: stringParams,
    onSubmit: handleSubmit,
    loading: true,
  },
};

export const SingleParameter: Story = {
  args: {
    actionName: "Delete Object",
    parameters: [
      {
        apiName: "objectRid",
        displayName: "Object RID",
        type: "STRING",
        required: true,
        description: "The resource identifier of the object to delete",
      },
    ],
    onSubmit: handleSubmit,
  },
};

export const BooleanOnly: Story = {
  args: {
    actionName: "Toggle Feature Flags",
    parameters: [
      {
        apiName: "enableBeta",
        displayName: "Enable Beta Features",
        type: "BOOLEAN",
        required: false,
        description: "Enable experimental beta features",
      },
      {
        apiName: "enableNotifications",
        displayName: "Enable Notifications",
        type: "BOOLEAN",
        required: false,
        description: "Send email notifications for changes",
      },
    ],
    onSubmit: handleSubmit,
  },
};
