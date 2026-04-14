import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useLogoutMutation } from "@features/auth/hooks/authMutations";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { ArrowRight, Lifebuoy, SignOut } from "@phosphor-icons/react";
import { Button, Flex, Theme } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark.svg";
import phWordmarkWhite from "@renderer/assets/images/wordmark-white.svg";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { useThemeStore } from "@stores/themeStore";
import { EXTERNAL_LINKS } from "@utils/links";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";

import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { usePrefetchSignalData } from "../hooks/usePrefetchSignalData";
import { ContextCollectionStep } from "./ContextCollectionStep";
import { ParticleBackground } from "./context-collection/ParticleBackground";
import { GitIntegrationStep } from "./GitIntegrationStep";
import { OrgStep } from "./OrgStep";
import { ProjectSelectStep } from "./ProjectSelectStep";
import { SignalsStep } from "./SignalsStep";
import { StepIndicator } from "./StepIndicator";
import { WelcomeScreen } from "./WelcomeScreen";

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 20 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -20 }),
};

export function OnboardingFlow() {
  const {
    currentStep,
    activeSteps,
    direction,
    next,
    back,
    selectedDirectory,
    detectedRepo,
    isDetectingRepo,
    handleDirectoryChange,
  } = useOnboardingFlow();
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const resetOnboarding = useOnboardingStore((state) => state.resetOnboarding);
  const logoutMutation = useLogoutMutation();
  const isAuthenticated = useAuthStateValue(
    (state) => state.status === "authenticated",
  );
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  usePrefetchSignalData();

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
    <Theme
      appearance={isDarkMode ? "dark" : "light"}
      accentColor={isDarkMode ? "yellow" : "orange"}
      radius="medium"
    >
      <LayoutGroup>
        <Flex
          direction="column"
          height="100vh"
          style={{ position: "relative", overflow: "hidden" }}
        >
          <DraggableTitleBar />

          {/* Background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "var(--color-background)",
            }}
          />

          {/* Particle background for context-collection step */}
          {currentStep === "context-collection" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
              }}
            >
              <ParticleBackground />
            </div>
          )}

          {/* Content */}
          <Flex
            direction="column"
            flexGrow="1"
            style={{
              position: "relative",
              zIndex: 1,
              minHeight: 0,
              width: "100%",
            }}
          >
            <img
              src={isDarkMode ? phWordmarkWhite : phWordmark}
              alt="PostHog"
              style={{
                height: "40px",
                objectFit: "contain",
                alignSelf: "flex-start",
                marginLeft: 32,
                marginTop: "clamp(24px, 6vh, 80px)",
                flexShrink: 0,
              }}
            />
            <Flex
              direction="column"
              flexGrow="1"
              overflow="hidden"
              style={{ minHeight: 0 }}
            >
              <AnimatePresence mode="wait" custom={direction}>
                {currentStep === "welcome" && (
                  <motion.div
                    key="welcome"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", flex: 1, minHeight: 0 }}
                  >
                    <WelcomeScreen onNext={next} />
                  </motion.div>
                )}

                {currentStep === "project-select" && (
                  <motion.div
                    key="project-select"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", flex: 1, minHeight: 0 }}
                  >
                    <ProjectSelectStep onNext={next} onBack={back} />
                  </motion.div>
                )}

                {currentStep === "org" && (
                  <motion.div
                    key="org"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", flex: 1, minHeight: 0 }}
                  >
                    <OrgStep onNext={next} onBack={back} />
                  </motion.div>
                )}

                {currentStep === "github" && (
                  <motion.div
                    key="github"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", flex: 1, minHeight: 0 }}
                  >
                    <GitIntegrationStep
                      onNext={next}
                      onBack={back}
                      selectedDirectory={selectedDirectory}
                      detectedRepo={detectedRepo}
                      isDetectingRepo={isDetectingRepo}
                      onDirectoryChange={handleDirectoryChange}
                    />
                  </motion.div>
                )}

                {currentStep === "context-collection" && (
                  <motion.div
                    key="context-collection"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{
                      width: "100%",
                      flex: 1,
                      minHeight: 0,
                      position: "relative",
                    }}
                  >
                    <ContextCollectionStep onNext={next} onBack={back} />
                  </motion.div>
                )}

                {currentStep === "signals" && (
                  <motion.div
                    key="signals"
                    custom={direction}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    variants={stepVariants}
                    transition={{ duration: 0.3 }}
                    style={{ width: "100%", flex: 1, minHeight: 0 }}
                  >
                    <SignalsStep onNext={next} onBack={back} />
                  </motion.div>
                )}
              </AnimatePresence>
            </Flex>

            <StepIndicator
              currentStep={currentStep}
              activeSteps={activeSteps}
            />
            <Flex
              justify="between"
              style={{
                position: "absolute",
                bottom: 20,
                left: 32,
                right: 32,
                zIndex: 2,
              }}
            >
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() =>
                  trpcClient.os.openExternal.mutate({
                    url: EXTERNAL_LINKS.discord,
                  })
                }
                style={{ opacity: 0.5 }}
              >
                <Lifebuoy size={14} />
                Get support
              </Button>
              <Flex gap="5">
                {isAuthenticated && (
                  <Button
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={() => {
                      logoutMutation.mutate();
                      resetOnboarding();
                    }}
                    style={{ opacity: 0.5 }}
                  >
                    <SignOut size={14} />
                    Log out
                  </Button>
                )}
                {IS_DEV && (
                  <Button
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={handleComplete}
                    style={{ opacity: 0.5 }}
                  >
                    <ArrowRight size={14} />
                    Skip setup
                  </Button>
                )}
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </LayoutGroup>
    </Theme>
  );
}
