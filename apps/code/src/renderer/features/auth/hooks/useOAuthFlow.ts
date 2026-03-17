import { useAuthStore } from "@features/auth/stores/authStore";
import { trpcClient } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type AuthMode = "login" | "signup";

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
  const staleRegion = useAuthStore((s) => s.staleTokens?.cloudRegion);
  const [region, setRegion] = useState<CloudRegion>(staleRegion ?? "us");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const { loginWithOAuth, signupWithOAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
    },
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      await signupWithOAuth(region);
    },
  });

  const handleAuth = () => {
    if (authMode === "login") {
      loginMutation.mutate();
    } else {
      signupMutation.mutate();
    }
  };

  const handleRegionChange = (value: CloudRegion) => {
    setRegion(value);
    loginMutation.reset();
    signupMutation.reset();
  };

  const handleCancel = async () => {
    loginMutation.reset();
    signupMutation.reset();
    await trpcClient.oauth.cancelFlow.mutate();
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;
  const error = loginMutation.error || signupMutation.error;
  const errorMessage = getErrorMessage(error);

  return {
    region,
    authMode,
    setAuthMode,
    handleAuth,
    handleRegionChange,
    handleCancel,
    isPending,
    errorMessage,
  };
}
