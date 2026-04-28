import builderHog from "@renderer/assets/images/hedgehogs/builder-hog-03.png";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import happyHog from "@renderer/assets/images/hedgehogs/happy-hog.png";
import type { TourDefinition } from "../types";

export const createFirstTaskTour: TourDefinition = {
  id: "create-first-task",
  steps: [
    {
      id: "folder-picker",
      target: "folder-picker",
      hogSrc: explorerHog,
      message: "Pick a repo to work with. This tells me where your code lives!",
      advanceOn: { type: "action" },
    },
    {
      id: "task-editor",
      target: "task-input-editor",
      hogSrc: builderHog,
      message:
        "Describe what you want to build or fix. Be as specific as you like!",
      advanceOn: { type: "action" },
    },
    {
      id: "submit-button",
      target: "task-input-submit",
      hogSrc: happyHog,
      message: "Hit send or press Enter to launch your first agent!",
      advanceOn: { type: "click" },
    },
  ],
};
