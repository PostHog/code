import { useAuthStore } from "@features/auth/stores/authStore";
import { trpcClient } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/regions";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function getErrorMessage(error: unknown) {
  if (!error) {
    return null;
  }
  if (!(error instanceof Error)) {
    return "Failed to authenticate";
  }
  const message = error.message;

  if (message === "2FA_REQUIRED") {
    return null; // 2FA dialog will handle this
  }

  if (message.includes("access_denied")) {
    return "Authorization cancelled.";
  }

  if (message.includes("timed out")) {
    return "Authorization timed out. Please try again.";
  }

  if (message.includes("SSO login required")) {
    return message;
  }

  return message;
}

export function useOAuthFlow() {
  const staleRegion = useAuthStore((s) => s.staleCloudRegion);
  const [region, setRegion] = useState<CloudRegion>(staleRegion ?? "us");
  const { loginWithOAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
    },
  });

  const handleAuth = () => {
    loginMutation.mutate();
  };

  const handleRegionChange = (value: CloudRegion) => {
    setRegion(value);
    loginMutation.reset();
  };

  const handleCancel = async () => {
    loginMutation.reset();
    await trpcClient.oauth.cancelFlow.mutate();
  };

  return {
    region,
    handleAuth,
    handleRegionChange,
    handleCancel,
    isPending: loginMutation.isPending,
    errorMessage: getErrorMessage(loginMutation.error),
  };
}
