import type {
  SessionConfigOption,
  SessionConfigSelectGroup,
  SessionConfigSelectOption,
  SessionConfigSelectOptions,
} from "@agentclientprotocol/sdk";
import type { ModeInfo } from "@posthog/agent/execution-mode";

export type PermissionModeAdapter = "claude" | "codex";

const UNSAFE_MODE_BY_ADAPTER: Record<PermissionModeAdapter, string> = {
  claude: "bypassPermissions",
  codex: "full-access",
};

const DEFAULT_MODE_BY_ADAPTER: Record<PermissionModeAdapter, string> = {
  claude: "plan",
  codex: "auto",
};

export function getDefaultPermissionMode(
  adapter: PermissionModeAdapter,
): string {
  return DEFAULT_MODE_BY_ADAPTER[adapter];
}

export function sanitizeSelectablePermissionMode(
  mode: string | undefined,
  adapter: PermissionModeAdapter,
  allowBypassPermissions: boolean,
): string {
  if (!mode) {
    return getDefaultPermissionMode(adapter);
  }

  if (
    !allowBypassPermissions &&
    mode === UNSAFE_MODE_BY_ADAPTER[adapter]
  ) {
    return getDefaultPermissionMode(adapter);
  }

  return mode;
}

export function filterAvailableModes(
  modes: ModeInfo[],
  adapter: PermissionModeAdapter,
  allowBypassPermissions: boolean,
): ModeInfo[] {
  if (allowBypassPermissions) {
    return modes;
  }

  const unsafeMode = UNSAFE_MODE_BY_ADAPTER[adapter];
  return modes.filter((mode) => mode.id !== unsafeMode);
}

function isSelectGroupOption(
  option: SessionConfigSelectOption | SessionConfigSelectGroup,
): option is SessionConfigSelectGroup {
  return "options" in option;
}

function filterModeSelectOptions(
  options: SessionConfigSelectOptions,
  adapter: PermissionModeAdapter,
  allowBypassPermissions: boolean,
): SessionConfigSelectOptions {
  if (allowBypassPermissions) {
    return options;
  }

  const unsafeMode = UNSAFE_MODE_BY_ADAPTER[adapter];

  return options.flatMap((candidate) => {
    if (isSelectGroupOption(candidate)) {
      const filteredGroupOptions = candidate.options.filter(
        (option) => option.value !== unsafeMode,
      );

      if (filteredGroupOptions.length === 0) {
        return [];
      }

      return [{ ...candidate, options: filteredGroupOptions }];
    }

    if (candidate.value === unsafeMode) {
      return [];
    }

    return [candidate];
  });
}

export function filterModeConfigOptions(
  configOptions: SessionConfigOption[] | undefined,
  adapter: PermissionModeAdapter,
  allowBypassPermissions: boolean,
): SessionConfigOption[] | undefined {
  if (!configOptions) {
    return undefined;
  }

  return configOptions.map((option) => {
    if (option.id !== "mode" || option.type !== "select") {
      return option;
    }

    return {
      ...option,
      options: filterModeSelectOptions(
        option.options,
        adapter,
        allowBypassPermissions,
      ),
    } as SessionConfigOption;
  });
}
