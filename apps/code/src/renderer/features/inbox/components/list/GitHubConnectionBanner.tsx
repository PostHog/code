import { Button } from "@components/ui/Button";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useGithubUserConnect } from "@features/integrations/hooks/useGithubUserConnect";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import { useUserRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowSquareOutIcon,
  GithubLogoIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { Spinner } from "@radix-ui/themes";

export function GitHubConnectionBanner() {
  const { data: githubLogin, isLoading: loginLoading } = useAuthenticatedQuery(
    ["github_login"],
    async (client) => client.getGithubLogin(),
    { staleTime: 5 * 60 * 1000 },
  );
  const { hasGithubIntegration: hasGithubForProject } =
    useUserRepositoryIntegration();
  const projectId = useAuthStateValue((s) => s.projectId);
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);

  const { state, connect } = useGithubUserConnect({ projectId });
  const connecting = state === "connecting";
  const canConnectCloud = projectId != null && cloudRegion != null;

  if (loginLoading) {
    return null;
  }

  if (githubLogin) {
    return null;
  }

  if (!cloudRegion) {
    return null;
  }

  const label = connecting
    ? "Waiting for GitHub connection to complete in browser…"
    : hasGithubForProject
      ? "Connect your GitHub profile to highlight what's relevant to you"
      : "Connect your GitHub repo(s) to highlight what's relevant to you";

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-60">
      <Button
        type="button"
        size="1"
        variant="solid"
        color="gray"
        highContrast
        disabled={!canConnectCloud || connecting}
        disabledReason={
          !canConnectCloud
            ? "Sign in to PostHog and select a cloud project."
            : connecting
              ? "Finish the GitHub flow in your browser, then return to PostHog Code."
              : null
        }
        className="h-fit w-full flex-wrap items-center justify-start gap-x-2 gap-y-1 whitespace-normal border-transparent bg-black py-1 text-left text-[12px] text-white shadow-none hover:bg-neutral-900"
        tooltipContent={
          <>
            <InfoIcon size={14} className="mr-0.5" />
            <div>
              PostHog Code suggests report ownership using cutting-edge{" "}
              <code>git blame</code> technology.
              <br />
              {hasGithubForProject
                ? "You'll authorize with GitHub in the browser via PostHog Cloud to link your profile."
                : "You'll connect GitHub via PostHog Cloud (GitHub App or quick OAuth—depending on your setup)."}{" "}
              Your identity is stored as a GitHub UserIntegration so Code can
              highlight relevant work.
            </div>
          </>
        }
        onClick={() => {
          if (!canConnectCloud) return;
          void connect();
        }}
      >
        {connecting ? (
          <>
            <Spinner size="1" className="shrink-0 text-current" />
            <span className="min-w-0 flex-1 basis-0 text-balance">{label}</span>
          </>
        ) : (
          <>
            <GithubLogoIcon className="flex-none" size={12} />
            <span className="min-w-0 flex-1 basis-0 text-balance">{label}</span>
            <ArrowSquareOutIcon className="flex-none" size={11} />
          </>
        )}
      </Button>
    </div>
  );
}
