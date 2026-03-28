import { IS_ROOT } from "./utils/common";

export interface ModeInfo {
  id: CodeExecutionMode;
  name: string;
  description: string;
}

// Helper constant that can easily be toggled for env/feature flag/etc
const ALLOW_BYPASS = !IS_ROOT;

const availableModes: ModeInfo[] = [
  {
    id: "default",
    name: "Default",
    description: "Standard behavior, prompts for dangerous operations",
  },
  {
    id: "acceptEdits",
    name: "Accept Edits",
    description: "Auto-accept file edit operations",
  },
  {
    id: "plan",
    name: "Plan Mode",
    description: "Planning mode, no actual tool execution",
  },
  // {
  //   id: "dontAsk",
  //   name: "Don't Ask",
  //   description: "Don't prompt for permissions, deny if not pre-approved",
  // },
];

if (ALLOW_BYPASS) {
  availableModes.push({
    id: "bypassPermissions",
    name: "Auto-accept Permissions",
    description: "Auto-accept all permission requests",
  });
}

// Expose execution mode IDs in type-safe order for type checks
export const CODE_EXECUTION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  // "dontAsk",
  "bypassPermissions",
] as const;

export type CodeExecutionMode = (typeof CODE_EXECUTION_MODES)[number];

export function getAvailableModes(): ModeInfo[] {
  // When IS_ROOT, do not allow bypassPermissions
  return IS_ROOT
    ? availableModes.filter((m) => m.id !== "bypassPermissions")
    : availableModes;
}
