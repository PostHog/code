import { ArrowLeft, ArrowRight, RocketLaunch } from "@phosphor-icons/react";
import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import type { AutomationTemplate } from "@shared/types/automations";
import { AnimatePresence, motion } from "framer-motion";
import { useAutomationStore } from "../stores/automationStore";
import { AUTOMATION_TEMPLATES } from "../templates";
import { AutomationsStep } from "./AutomationsStep";
import { RoleStep } from "./RoleStep";
import { ScheduleStep } from "./ScheduleStep";
import { SoftwareStep } from "./SoftwareStep";
import { useChiefOfStaffState } from "./useChiefOfStaffState";

interface ChiefOfStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_LABELS = ["Role", "Tools", "Automations", "Schedule"];

export function ChiefOfStaffDialog({
  open,
  onOpenChange,
}: ChiefOfStaffDialogProps) {
  const state = useChiefOfStaffState();
  const createAutomation = useAutomationStore((s) => s.createAutomation);
  const addUserTemplates = useAutomationStore((s) => s.addUserTemplates);

  const handleCreate = () => {
    const generatedTemplates: AutomationTemplate[] = [];

    for (const id of state.selectedIds) {
      const generated = state.generatedAutomations.find((g) => g.id === id);
      if (generated) {
        createAutomation({
          name: generated.name,
          prompt: generated.prompt,
          repoPath: state.repoPath,
          repository: state.repository,
          githubIntegrationId: state.githubIntegrationId,
          scheduleTime: state.scheduleTime,
          templateId: generated.id,
        });
        generatedTemplates.push({
          id: generated.id,
          name: generated.name,
          description: generated.description,
          prompt: generated.prompt,
          category: "Generated",
          tags: [],
        });
        continue;
      }

      const template = AUTOMATION_TEMPLATES.find((t) => t.id === id);
      if (template) {
        createAutomation({
          name: template.name,
          prompt: template.prompt,
          repoPath: state.repoPath,
          repository: state.repository,
          githubIntegrationId: state.githubIntegrationId,
          scheduleTime: state.scheduleTime,
          templateId: template.id,
        });
      }
    }

    if (generatedTemplates.length > 0) {
      addUserTemplates(generatedTemplates);
    }

    state.reset();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      state.reset();
    }
    onOpenChange(nextOpen);
  };

  const canGoNext = (() => {
    switch (state.step) {
      case 1:
        return true;
      case 2:
        return state.llmDone && state.selectedSoftware.size > 0;
      case 3:
        return state.selectedCount > 0;
      case 4:
        return state.repoPath.trim().length > 0;
      default:
        return false;
    }
  })();

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        style={{ maxWidth: 640, maxHeight: "85vh" }}
        className="flex flex-col"
      >
        <Dialog.Title className="sr-only">Chief of Staff</Dialog.Title>

        <Flex gap="2" className="mb-4">
          {STEP_LABELS.map((label, i) => (
            <Flex key={label} align="center" gap="1" className="flex-1">
              <div
                className={`h-1 w-full rounded-full transition-colors ${
                  i + 1 <= state.step ? "bg-accent-9" : "bg-gray-5"
                }`}
              />
              <Text
                size="1"
                className={`whitespace-nowrap font-mono text-[10px] ${
                  i + 1 === state.step ? "text-accent-11" : "text-gray-9"
                }`}
              >
                {label}
              </Text>
            </Flex>
          ))}
        </Flex>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {state.step === 1 && (
              <motion.div
                key="role"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <RoleStep
                  roleDescription={state.roleDescription}
                  onRoleDescriptionChange={state.setRoleDescription}
                />
              </motion.div>
            )}

            {state.step === 2 && (
              <motion.div
                key="software"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <SoftwareStep
                  selectedSoftware={state.selectedSoftware}
                  onToggle={state.toggleSoftware}
                  onSelectAll={state.selectAllSoftware}
                  onDeselectAll={state.deselectAllSoftware}
                  isLoading={state.isLoading}
                />
              </motion.div>
            )}

            {state.step === 3 && (
              <motion.div
                key="automations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <AutomationsStep
                  generatedAutomations={state.generatedAutomations}
                  existingTemplates={state.filteredExistingTemplates}
                  selectedIds={state.selectedIds}
                  onToggle={state.toggleTemplate}
                  onSelectAll={state.selectAllTemplates}
                  onDeselectAll={state.deselectAllTemplates}
                />
              </motion.div>
            )}

            {state.step === 4 && (
              <motion.div
                key="schedule"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <ScheduleStep
                  scheduleTime={state.scheduleTime}
                  onScheduleTimeChange={state.setScheduleTime}
                  repoPath={state.repoPath}
                  onRepoPathChange={state.setRepoPath}
                  repository={state.repository}
                  onRepositoryChange={state.setRepository}
                  onGithubIntegrationIdChange={state.setGithubIntegrationId}
                  selectedCount={state.selectedCount}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Flex
          gap="3"
          justify="between"
          className="mt-4 border-gray-6 border-t pt-3"
        >
          {state.step > 1 ? (
            <Button variant="soft" color="gray" onClick={state.back}>
              <ArrowLeft size={12} />
              Back
            </Button>
          ) : (
            <div />
          )}

          {state.step < 4 ? (
            <Button
              onClick={state.step === 1 ? state.handleRoleNext : state.next}
              disabled={!canGoNext}
            >
              {state.step === 1 && !state.roleDescription.trim()
                ? "Let me cook"
                : "Next"}
              <ArrowRight size={12} />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={!canGoNext}>
              <RocketLaunch size={12} />
              Create {state.selectedCount} automation
              {state.selectedCount === 1 ? "" : "s"}
            </Button>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
