import { Button } from "@components/ui/Button";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import {
  ArrowSquareOutIcon,
  GithubLogoIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import type { CloudRegion } from "@shared/types/oauth";
import { queryClient } from "@utils/queryClient";
import { useEffect, useRef } from "react";

/** PostHog Cloud OAuth URL to attach GitHub (`connect_from` is handled by PostHog web after redirect). */
function posthogCloudGithubAccountLinkUrl(region: CloudRegion): string {
  const url = new URL("/login/github/", getCloudUrlFromRegion(region));
  url.searchParams.set("connect_from", "posthog_code");
  return url.toString();
}

export function GitHubConnectionBanner() {
  const { data: githubLogin, isLoading } = useAuthenticatedQuery(
    ["github_login"],
    async (client) => client.getGithubLogin(),
    { staleTime: 5 * 60 * 1000 },
  );
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);
  const awaitingLink = useRef(false);

  // After the user clicks connect and returns to the app, refetch to pick up the new github_login
  useEffect(() => {
    const onFocus = () => {
      if (awaitingLink.current) {
        awaitingLink.current = false;
        void queryClient.invalidateQueries({ queryKey: ["github_login"] });
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (isLoading) {
    return null;
  }

  if (githubLogin) {
    return null;
  }

  if (!cloudRegion) {
    return null;
  }

  const connectUrl = posthogCloudGithubAccountLinkUrl(cloudRegion);

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-20">
      <Button
        size="1"
        variant="solid"
        color="gray"
        highContrast
        className="h-fit w-full flex-wrap items-center justify-start gap-x-2 gap-y-1 whitespace-normal border-transparent bg-black py-1 text-left text-[12px] text-white leading-tight shadow-none hover:bg-neutral-900"
        tooltipContent={
          <>
            <InfoIcon size={14} className="mr-0.5" />
            <div>
              PostHog Code suggests report ownership using cutting-edge{" "}
              <code>git blame</code> technology.
              <br />
              For this, connect your GitHub profile (different from connecting
              repositories).
            </div>
          </>
        }
        onClick={() => {
          awaitingLink.current = true;
          void trpcClient.os.openExternal.mutate({ url: connectUrl });
        }}
      >
        <GithubLogoIcon className="flex-none" size={12} />
        <span className="min-w-0 flex-1 basis-0">
          {`Connect your GitHub profile to highlight what's relevant to you`}
        </span>
        <ArrowSquareOutIcon className="flex-none" size={11} />
      </Button>
    </div>
  );
}
