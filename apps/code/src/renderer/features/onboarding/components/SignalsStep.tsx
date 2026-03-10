import { useAuthStore } from "@features/auth/stores/authStore";
import {
  SignalSourceToggles,
  type SignalSourceValues,
} from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useSignalSourceSelectionsStore } from "@features/inbox/stores/signalSourceSelectionsStore";
import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { ArrowLeft, ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark-alt.png";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

interface SignalsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function SignalsStep({ onNext, onBack }: SignalsStepProps) {
  const projectId = useAuthStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const { data: existingConfigs } = useSignalSourceConfigs();
  const { userSelections, setUserSelections } =
    useSignalSourceSelectionsStore();

  const sources: SignalSourceValues = userSelections ?? {
    session_replay:
      existingConfigs?.some(
        (c) => c.source_product === "session_replay" && c.enabled,
      ) ?? true,
    llm_analytics:
      existingConfigs?.some(
        (c) => c.source_product === "llm_analytics" && c.enabled,
      ) ?? false,
  };

  const [isSaving, setIsSaving] = useState(false);

  const createConfig = useAuthenticatedMutation(
    (
      client,
      options: {
        source_product: "session_replay" | "llm_analytics";
        source_type: "session_analysis_cluster" | "evaluation";
      },
    ) =>
      projectId
        ? client.createSignalSourceConfig(projectId, {
            ...options,
            enabled: true,
          })
        : Promise.reject(new Error("No project selected")),
  );

  const handleContinue = async () => {
    const existingProducts = new Set(
      existingConfigs?.map((c) => c.source_product) ?? [],
    );

    const toCreate: Array<{
      source_product: "session_replay" | "llm_analytics";
      source_type: "session_analysis_cluster" | "evaluation";
    }> = [];

    if (sources.session_replay && !existingProducts.has("session_replay")) {
      toCreate.push({
        source_product: "session_replay",
        source_type: "session_analysis_cluster",
      });
    }
    if (sources.llm_analytics && !existingProducts.has("llm_analytics")) {
      toCreate.push({
        source_product: "llm_analytics",
        source_type: "evaluation",
      });
    }

    if (toCreate.length === 0) {
      onNext();
      return;
    }

    setIsSaving(true);
    const results = await Promise.allSettled(
      toCreate.map((opts) => createConfig.mutateAsync(opts)),
    );
    setIsSaving(false);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      toast.error(
        "Failed to enable some signal sources. You can retry from the inbox.",
      );
    }

    await queryClient.invalidateQueries({
      queryKey: ["signals", "source-configs"],
    });
    onNext();
  };

  const anyEnabled = sources.session_replay || sources.llm_analytics;

  return (
    <Flex align="center" height="100%" px="8">
      <Flex direction="column" gap="6" style={{ width: "100%", maxWidth: 520 }}>
        <Flex direction="column" gap="3">
          <img
            src={phWordmark}
            alt="PostHog"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
          <Text
            size="6"
            style={{
              color: "var(--gray-12)",
              lineHeight: 1.3,
            }}
          >
            Enable "the inbox"
          </Text>
          <Text size="2" style={{ color: "var(--gray-12)", opacity: 0.7 }}>
            Automatically analyze your product data and surface actionable
            insights. Choose which sources to enable for this project.
          </Text>
        </Flex>

        <SignalSourceToggles
          value={sources}
          onChange={setUserSelections}
          disabled={isSaving}
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Flex gap="3" align="center">
            <Button
              size="3"
              variant="ghost"
              onClick={onBack}
              disabled={isSaving}
              style={{ color: "var(--gray-12)" }}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            {anyEnabled ? (
              <Button
                size="3"
                onClick={() => void handleContinue()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <CircleNotch size={16} className="animate-spin" />
                ) : (
                  <ArrowRight size={16} />
                )}
                Continue
              </Button>
            ) : (
              <Button
                size="3"
                variant="outline"
                onClick={onNext}
                disabled={isSaving}
                style={{ color: "var(--gray-12)" }}
              >
                Skip for now
                <ArrowRight size={16} />
              </Button>
            )}
          </Flex>
        </motion.div>
      </Flex>
    </Flex>
  );
}
