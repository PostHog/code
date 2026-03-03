import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { SignOut } from "@phosphor-icons/react";
import { Button, Flex } from "@radix-ui/themes";
import onboardingBg from "@renderer/assets/images/tree-bg.svg";
import { AnimatePresence, motion } from "framer-motion";

import { useOnboardingFlow } from "../hooks/useOnboardingFlow";
import { BillingStep } from "./BillingStep";
import { GitIntegrationStep } from "./GitIntegrationStep";
import { OrgBillingStep } from "./OrgBillingStep";
import { StepIndicator } from "./StepIndicator";
import { WelcomeStep } from "./WelcomeStep";

export function OnboardingFlow() {
  const { currentStep, activeSteps, next, back } = useOnboardingFlow();
  const { completeOnboarding, logout } = useAuthStore();

  const handleComplete = () => {
    completeOnboarding();
  };

  return (
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
          backgroundColor: "#FAEEDE",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "55%",
          backgroundImage: `url(${onboardingBg})`,
          backgroundSize: "cover",
          backgroundPosition: "left center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Content */}
      <Flex
        direction="column"
        flexGrow="1"
        style={{ position: "relative", zIndex: 1, minHeight: 0 }}
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
                <GitIntegrationStep onNext={handleComplete} onBack={back} />
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
  );
}
