import { Button } from "@components/ui/Button";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useMeQuery } from "@hooks/useMeQuery";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { queryClient } from "@utils/queryClient";
import { useEffect, useRef } from "react";

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

  const githubLogin = user.github_login;

  if (githubLogin) {
    return (
      <Button
        size="1"
        variant="soft"
        color="green"
        className="text-[12px]"
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          right: 8,
          zIndex: 20,
        }}
        disabled
      >
        <GithubLogoIcon size={12} />@{githubLogin}
      </Button>
    );
  }

  const connectUrl = cloudRegion
    ? `${getCloudUrlFromRegion(cloudRegion)}/login/github/`
    : null;

  if (!connectUrl) {
    return null;
  }

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
      tooltipContent="Connect your GitHub account so we can prioritize reports where you're a suggested reviewer"
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
