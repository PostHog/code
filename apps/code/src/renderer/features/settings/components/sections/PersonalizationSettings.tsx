import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Flex, Text, TextArea } from "@radix-ui/themes";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { track } from "@utils/analytics";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_INSTRUCTIONS_LENGTH = 2000;
const DEBOUNCE_MS = 500;

export function PersonalizationSettings() {
  const customInstructions = useSettingsStore((s) => s.customInstructions);
  const setCustomInstructions = useSettingsStore(
    (s) => s.setCustomInstructions,
  );

  const [localInstructions, setLocalInstructions] =
    useState(customInstructions);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when store changes externally
  useEffect(() => {
    setLocalInstructions(customInstructions);
  }, [customInstructions]);

  const saveInstructions = useCallback(
    (value: string) => {
      const current = useSettingsStore.getState().customInstructions;
      if (value === current) return;
      setCustomInstructions(value);
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "custom_instructions",
        new_value: value.length > 0,
      });
    },
    [setCustomInstructions],
  );

  const handleInstructionsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setLocalInstructions(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        saveInstructions(value);
      }, DEBOUNCE_MS);
    },
    [saveInstructions],
  );

  const handleInstructionsBlur = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveInstructions(localInstructions);
  }, [localInstructions, saveInstructions]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <Flex direction="column" gap="1" py="4">
      <Flex direction="column" gap="1" className="mb-2">
        <Text className="font-medium text-sm">Custom instructions</Text>
        <Text color="gray" className="text-[13px]">
          Instructions included in every agent session
        </Text>
      </Flex>
      <TextArea
        value={localInstructions}
        onChange={handleInstructionsChange}
        onBlur={handleInstructionsBlur}
        maxLength={MAX_INSTRUCTIONS_LENGTH}
        placeholder="e.g. Always write tests for new code. Prefer functional patterns."
        rows={6}
        size="1"
        className="w-full"
      />
      <Text color="gray" align="right" className="text-[13px]">
        {localInstructions.length}/{MAX_INSTRUCTIONS_LENGTH}
      </Text>
    </Flex>
  );
}
