import { ErrorBoundary } from "@components/ErrorBoundary";
import { LoginTransition } from "@components/LoginTransition";
import { MainLayout } from "@components/MainLayout";
import { ScopeReauthPrompt } from "@components/ScopeReauthPrompt";
import { UpdatePrompt } from "@components/UpdatePrompt";
import { AuthScreen } from "@features/auth/components/AuthScreen";
import { InviteCodeScreen } from "@features/auth/components/InviteCodeScreen";
import { useAuthStore } from "@features/auth/stores/authStore";
import { OnboardingFlow } from "@features/onboarding/components/OnboardingFlow";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { initializeConnectivityStore } from "@renderer/stores/connectivityStore";
import { useFocusStore } from "@renderer/stores/focusStore";
import { useThemeStore } from "@renderer/stores/themeStore";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import { initializePostHog } from "@utils/analytics";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";

const log = logger.scope("app");

function App() {
  const { isAuthenticated, hasCompletedOnboarding, hasTwigAccess } =
    useAuthStore();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const [isLoading, setIsLoading] = useState(true);
  const [showTransition, setShowTransition] = useState(false);
  const wasInMainApp = useRef(isAuthenticated && hasCompletedOnboarding);

  // Initialize PostHog analytics
  useEffect(() => {
    initializePostHog();
  }, []);

  // Initialize connectivity monitoring
  useEffect(() => {
    return initializeConnectivityStore();
  }, []);

  // Dev-only inbox demo command for local QA from the renderer console.
  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    void import("@features/inbox/devtools/inboxDemoConsole").then(
      ({ registerInboxDemoConsoleCommand }) => {
        registerInboxDemoConsoleCommand();
      },
    );
  }, []);

  // Global workspace error listener for toasts
  useEffect(() => {
    const subscription = trpcVanilla.workspace.onError.subscribe(undefined, {
      onData: (data) => {
        toast.error("Workspace error", { description: data.message });
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  const trpcUtils = trpcReact.useUtils();

  trpcReact.workspace.onPromoted.useSubscription(undefined, {
    onData: (data) => {
      void trpcUtils.workspace.getAll.invalidate();
      toast.info(
        "Task moved to worktree",
        `Task is now working in its own worktree on branch "${data.fromBranch}"`,
      );
    },
  });

  trpcReact.workspace.onBranchChanged.useSubscription(undefined, {
    onData: () => {
      void trpcUtils.workspace.getAll.invalidate();
    },
  });

  trpcReact.focus.onBranchRenamed.useSubscription(undefined, {
    onData: ({ worktreePath, newBranch }) => {
      useFocusStore.getState().updateSessionBranch(worktreePath, newBranch);
      void trpcUtils.workspace.getAll.invalidate();
    },
  });

  // Auto-unfocus when user manually checks out to a different branch
  trpcReact.focus.onForeignBranchCheckout.useSubscription(undefined, {
    onData: async ({ focusedBranch, foreignBranch }) => {
      log.warn(
        `Foreign branch checkout detected: ${focusedBranch} -> ${foreignBranch}. Auto-unfocusing.`,
      );
      await useFocusStore.getState().disableFocus();
    },
  });

  // Wait for authStore to hydrate, then restore session from stored tokens
  useEffect(() => {
    const initialize = async () => {
      if (!useAuthStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          useAuthStore.persist.onFinishHydration(() => resolve());
        });
      }
      await useAuthStore.getState().initializeOAuth();
      setIsLoading(false);
    };
    initialize();
  }, []);

  // Handle transition into main app — only show the dark overlay if dark mode is active
  useEffect(() => {
    const isInMainApp = isAuthenticated && hasCompletedOnboarding;
    if (!wasInMainApp.current && isInMainApp && isDarkMode) {
      setShowTransition(true);
    }
    wasInMainApp.current = isInMainApp;
  }, [isAuthenticated, hasCompletedOnboarding, isDarkMode]);

  const handleTransitionComplete = () => {
    setShowTransition(false);
  };

  if (isLoading) {
    return (
      <Flex align="center" justify="center" minHeight="100vh">
        <Flex align="center" gap="3">
          <Spinner size="3" />
          <Text color="gray">Loading...</Text>
        </Flex>
      </Flex>
    );
  }

  // Four-phase rendering: auth → access gate → onboarding → main app
  const renderContent = () => {
    if (!isAuthenticated) {
      return (
        <motion.div key="auth" initial={{ opacity: 1 }}>
          <AuthScreen />
        </motion.div>
      );
    }

    // Access check loading state
    if (hasTwigAccess === null) {
      return (
        <motion.div key="access-check">
          <Flex align="center" justify="center" minHeight="100vh">
            <Flex align="center" gap="3">
              <Spinner size="3" />
              <Text color="gray">Checking access...</Text>
            </Flex>
          </Flex>
        </motion.div>
      );
    }

    // Access gate: show invite code screen if flag is not enabled
    if (!hasTwigAccess) {
      return (
        <motion.div key="invite-code">
          <InviteCodeScreen />
        </motion.div>
      );
    }

    if (!hasCompletedOnboarding) {
      return (
        <motion.div key="onboarding">
          <OnboardingFlow />
        </motion.div>
      );
    }

    return (
      <motion.div
        key="main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: showTransition ? 1.5 : 0 }}
      >
        <MainLayout />
      </motion.div>
    );
  };

  return (
    <ErrorBoundary name="App">
      <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
      <LoginTransition
        isAnimating={showTransition}
        isDarkMode={isDarkMode}
        onComplete={handleTransitionComplete}
      />
      <ScopeReauthPrompt />
      <UpdatePrompt />
      <Toaster position="bottom-right" />
    </ErrorBoundary>
  );
}

export default App;
