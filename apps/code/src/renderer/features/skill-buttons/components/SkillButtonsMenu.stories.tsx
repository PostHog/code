import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkillButtonsMenu } from "./SkillButtonsMenu";

const meta: Meta<typeof SkillButtonsMenu> = {
  title: "Skill Buttons/SkillButtonsMenu",
  component: SkillButtonsMenu,
  parameters: {
    layout: "centered",
  },
  args: {
    taskId: "storybook-task",
  },
};

export default meta;
type Story = StoryObj<typeof SkillButtonsMenu>;

export const Default: Story = {};
