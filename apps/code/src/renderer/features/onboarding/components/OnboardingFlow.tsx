import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { ZenHedgehog } from "@components/ZenHedgehog";
import { useLogoutMutation } from "@features/auth/hooks/authMutations";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { SignOut } from "@phosphor-icons/react";
import { Button, Flex, Theme } from "@radix-ui/themes";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";

import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { BillingStep } from "./BillingStep";
import { GitIntegrationStep } from "./GitIntegrationStep";
import { OrgBillingStep } from "./OrgBillingStep";
import { SignalsStep } from "./SignalsStep";
import { StepIndicator } from "./StepIndicator";
import { TutorialStep } from "./TutorialStep";
import { WelcomeStep } from "./WelcomeStep";

export function OnboardingFlow() {
  const { currentStep, activeSteps, next, back } = useOnboardingFlow();
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );
  const logoutMutation = useLogoutMutation();

  const handleComplete = () => {
    completeOnboarding();
  };

  const isTutorial = currentStep === "tutorial";

  return (
    <Theme appearance="light" accentColor="orange" radius="medium">
      <LayoutGroup>
        <Flex
          direction="column"
          height="100vh"
          style={{ position: "relative", overflow: "hidden" }}
        >
          <DraggableTitleBar />

          {isTutorial ? (
            <TutorialStep onComplete={handleComplete} onBack={back} />
          ) : (
            <>
              {/* Background */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "rgb(243, 244, 240)",
                }}
              />

              {/* Right panel — zen hedgehog */}
              <Flex
                align="center"
                justify="center"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: "55%",
                  backgroundColor: "rgb(243, 244, 240)",
                }}
              >
                <ZenHedgehog />
              </Flex>

              {/* Content */}
              <Flex
                direction="column"
                flexGrow="1"
                style={{
                  position: "relative",
                  zIndex: 1,
                  minHeight: 0,
                  width: "45%",
                }}
              >
                <Flex
                  direction="column"
                  flexGrow="1"
                  overflow="hidden"
                  style={{ minHeight: 0 }}
                >
                  <AnimatePresence mode="wait">
                    {currentStep === "welcome" && (
                      <motion.div
                        key="welcome"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        style={{ width: "100%", flex: 1, minHeight: 0 }}
                      >
                        <WelcomeStep onNext={next} />
                      </motion.div>
                    )}

                    {currentStep === "org-billing" && (
                      <motion.div
                        key="org-billing"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        style={{ width: "100%", flex: 1, minHeight: 0 }}
                      >
                        <OrgBillingStep onNext={next} onBack={back} />
                      </motion.div>
                    )}

                    {currentStep === "billing" && (
                      <motion.div
                        key="billing"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        style={{ width: "100%", flex: 1, minHeight: 0 }}
                      >
                        <BillingStep onNext={next} onBack={back} />
                      </motion.div>
                    )}

                    {currentStep === "git-integration" && (
                      <motion.div
                        key="git-integration"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        style={{ width: "100%", flex: 1, minHeight: 0 }}
                      >
                        <GitIntegrationStep onNext={next} onBack={back} />
                      </motion.div>
                    )}

                    {currentStep === "signals" && (
                      <motion.div
                        key="signals"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
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
                    onClick={() => logoutMutation.mutate()}
                    style={{ opacity: 0.5 }}
                  >
                    <SignOut size={14} />
                    Log out
                  </Button>
                  <Button
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={handleComplete}
                    style={{ opacity: 0.5 }}
                  >
                    Skip setup
                  </Button>
                </Flex>
              </Flex>
            </>
          )}
        </Flex>
      </LayoutGroup>
    </Theme>
  );
}
