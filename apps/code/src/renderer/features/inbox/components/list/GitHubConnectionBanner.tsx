import { Button } from "@components/ui/Button";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useMeQuery } from "@hooks/useMeQuery";
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
  const { data: user, isLoading } = useMeQuery();
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);
  const awaitingLink = useRef(false);

  // After the user clicks connect and returns to the app, refetch to pick up the new github_login
  useEffect(() => {
    const onFocus = () => {
      if (awaitingLink.current) {
        awaitingLink.current = false;
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (isLoading || !user) {
    return null;
  }

  if (user.github_login) {
    return null;
  }

  if (!cloudRegion) {
    return null;
  }

  const connectUrl = posthogCloudGithubAccountLinkUrl(cloudRegion);

  return (
    <Button
      size="1"
      variant="soft"
      color="gold"
      className="text-[12px]"
      style={{
        position: "absolute",
        bottom: 8,
        left: 8,
        right: 8,
        zIndex: 20,
      }}
      tooltipContent={
        <>
          <InfoIcon size={14} className="mr-0.5" />
          <div>
            PostHog suggests report ownership based on the code's git history.
            <br />
            With your GitHub account verified,{" "}
            <strong>reports relevant to you appear at the top</strong>.
          </div>
        </>
      }
      onClick={() => {
        awaitingLink.current = true;
        void trpcClient.os.openExternal.mutate({ url: connectUrl });
      }}
    >
      <GithubLogoIcon size={12} />
      Connect your GitHub profile to highlight what's relevant to you
      <ArrowSquareOutIcon size={11} />
    </Button>
  );
}
