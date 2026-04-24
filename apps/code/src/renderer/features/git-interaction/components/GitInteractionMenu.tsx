import { Tooltip } from "@components/ui/Tooltip";
import type {
  GitMenuAction,
  GitMenuActionId,
} from "@features/git-interaction/hooks/useGitInteraction";
import {
  ArrowsClockwise,
  CloudArrowUp,
  Eye,
  GitBranch,
  GitCommit,
  GitFork,
  GitPullRequest,
} from "@phosphor-icons/react";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@posthog/quill";
import { Spinner } from "@radix-ui/themes";
import { ChevronDown } from "lucide-react";

interface GitInteractionMenuProps {
  primaryAction: GitMenuAction;
  actions: GitMenuAction[];
  isBusy?: boolean;
  onPrimary: (actionId: GitMenuActionId) => void;
  onSelect: (actionId: GitMenuActionId) => void;
}

function getActionIcon(actionId: GitMenuActionId) {
  switch (actionId) {
    case "commit":
      return <GitCommit size={12} weight="bold" />;
    case "push":
      return <CloudArrowUp size={12} weight="bold" />;
    case "sync":
      return <ArrowsClockwise size={12} weight="bold" />;
    case "publish":
      return <GitBranch size={12} weight="bold" />;
    case "create-pr":
      return <GitPullRequest size={12} weight="bold" />;
    case "view-pr":
      return <Eye size={12} weight="bold" />;
    case "branch-here":
      return <GitFork size={12} weight="bold" />;
    default:
      return <CloudArrowUp size={12} weight="bold" />;
  }
}

export function GitInteractionMenu({
  primaryAction,
  actions,
  isBusy,
  onPrimary,
  onSelect,
}: GitInteractionMenuProps) {
  const allDisabled = actions.every((a) => !a.enabled);
  const showDropdown = actions.length > 1;
  const variant = allDisabled ? "default" : "primary";
  const isPrimaryDisabled = !primaryAction.enabled || isBusy;

  const primaryButton = (
    <Button
      variant={variant}
      disabled={isPrimaryDisabled}
      onClick={() => onPrimary(primaryAction.id)}
      className="bg-primary text-primary-foreground not-disabled:hover:bg-primary/80 hover:text-primary-foreground/80"
    >
      {isBusy ? <Spinner size="1" /> : getActionIcon(primaryAction.id)}
      {primaryAction.label}
    </Button>
  );

  const wrappedPrimaryButton =
    !primaryAction.enabled && primaryAction.disabledReason ? (
      <Tooltip content={primaryAction.disabledReason} side="bottom">
        <span className="inline-flex">{primaryButton}</span>
      </Tooltip>
    ) : (
      primaryButton
    );

  if (!showDropdown || allDisabled) {
    return wrappedPrimaryButton;
  }

  return (
    <ButtonGroup>
      {wrappedPrimaryButton}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="bg-primary not-disabled:hover:bg-primary/80"
              variant={variant}
              disabled={isBusy}
            />
          }
        >
          <ChevronDown size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action) => {
            const icon = getActionIcon(action.id);
            const itemContent = (
              <>
                {icon} {action.label}
              </>
            );

            if (!action.enabled && action.disabledReason) {
              return (
                <Tooltip
                  key={action.id}
                  content={action.disabledReason}
                  side="left"
                >
                  <DropdownMenuItem disabled>{itemContent}</DropdownMenuItem>
                </Tooltip>
              );
            }

            return (
              <DropdownMenuItem
                key={action.id}
                onSelect={() => onSelect(action.id)}
              >
                {itemContent}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
