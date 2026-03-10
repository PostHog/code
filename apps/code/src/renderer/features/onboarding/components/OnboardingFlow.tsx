import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { ZenHedgehog } from "@components/ZenHedgehog";
import { useAuthStore } from "@features/auth/stores/authStore";
import { SignOut } from "@phosphor-icons/react";
import { Button, Flex, Theme } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";

import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { BillingStep } from "./BillingStep";
import { GitIntegrationStep } from "./GitIntegrationStep";
import { OrgBillingStep } from "./OrgBillingStep";
import { SignalsStep } from "./SignalsStep";
import { StepIndicator } from "./StepIndicator";
import { WelcomeStep } from "./WelcomeStep";

export function OnboardingFlow() {
  const { currentStep, activeSteps, next, back } = useOnboardingFlow();
  const { completeOnboarding, logout } = useAuthStore();

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
    <Theme appearance="light" accentColor="orange">
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
                  <SignalsStep onNext={handleComplete} onBack={back} />
                </motion.div>
              )}
            </AnimatePresence>
          </Flex>

          <StepIndicator currentStep={currentStep} activeSteps={activeSteps} />
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={logout}
            style={{
              position: "absolute",
              bottom: 20,
              left: 32,
              opacity: 0.5,
              zIndex: 2,
            }}
          >
            <SignOut size={14} />
            Log out
          </Button>
        </Flex>
      </Flex>
    </Theme>
  );
}
