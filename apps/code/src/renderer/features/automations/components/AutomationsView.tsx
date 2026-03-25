import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import {
  ClockCounterClockwise,
  FloppyDisk,
  Play,
  Plus,
  Robot,
  Trash,
} from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Flex,
  ScrollArea,
  Separator,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import type { Automation } from "@shared/types/automations";
import { useEffect, useMemo, useState } from "react";
import { runAutomationNow } from "../hooks/useAutomationScheduler";
import { useAutomationStore } from "../stores/automationStore";
import { AUTOMATION_TEMPLATES } from "../templates";
import { formatAutomationDateTime, getLocalTimezone } from "../utils/schedule";

interface AutomationDraft {
  name: string;
  prompt: string;
  repoPath: string;
  repository: string | null;
  githubIntegrationId: number | null;
  scheduleTime: string;
  templateId: string | null;
}

function toDraft(
  automation?: Automation | null,
  githubIntegrationId?: number | null,
): AutomationDraft {
  if (!automation) {
    return {
      name: "",
      prompt: "",
      repoPath: "",
      repository: null,
      githubIntegrationId: githubIntegrationId ?? null,
      scheduleTime: "09:00",
      templateId: null,
    };
  }

  return {
    name: automation.name,
    prompt: automation.prompt,
    repoPath: automation.repoPath,
    repository: automation.repository ?? null,
    githubIntegrationId:
      automation.githubIntegrationId ?? githubIntegrationId ?? null,
    scheduleTime: automation.scheduleTime,
    templateId: automation.templateId ?? null,
  };
}

function AutomationStatusBadge({ automation }: { automation: Automation }) {
  if (!automation.enabled) {
    return (
      <Badge size="1" variant="soft" color="gray">
        Paused
      </Badge>
    );
  }

  if (automation.lastRunStatus === "failed") {
    return (
      <Badge size="1" variant="soft" color="red">
        Failed
      </Badge>
    );
  }

  if (automation.lastRunStatus === "success") {
    return (
      <Badge size="1" variant="soft" color="green">
        Healthy
      </Badge>
    );
  }

  return (
    <Badge size="1" variant="soft" color="blue">
      Active
    </Badge>
  );
}

export function AutomationsView() {
  const automations = useAutomationStore((state) => state.automations);
  const selectedAutomationId = useAutomationStore(
    (state) => state.selectedAutomationId,
  );
  const runningAutomationIds = useAutomationStore(
    (state) => state.runningAutomationIds,
  );
  const setSelectedAutomationId = useAutomationStore(
    (state) => state.setSelectedAutomationId,
  );
  const createAutomation = useAutomationStore(
    (state) => state.createAutomation,
  );
  const updateAutomation = useAutomationStore(
    (state) => state.updateAutomation,
  );
  const deleteAutomation = useAutomationStore(
    (state) => state.deleteAutomation,
  );
  const toggleAutomation = useAutomationStore(
    (state) => state.toggleAutomation,
  );

  const { githubIntegration, repositories, isLoadingRepos } =
    useRepositoryIntegration();

  const selectedAutomation = useMemo(
    () =>
      automations.find(
        (automation) => automation.id === selectedAutomationId,
      ) ?? null,
    [automations, selectedAutomationId],
  );

  const [isCreating, setIsCreating] = useState(automations.length === 0);
  const [draft, setDraft] = useState<AutomationDraft>(() =>
    toDraft(null, githubIntegration?.id),
  );

  useEffect(() => {
    if (!isCreating && selectedAutomation) {
      setDraft(toDraft(selectedAutomation, githubIntegration?.id));
    }
  }, [isCreating, selectedAutomation, githubIntegration?.id]);

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <ClockCounterClockwise size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap font-mono text-[12px]"
          title="Automations"
        >
          Automations
        </Text>
      </Flex>
    ),
    [],
  );

  useSetHeaderContent(headerContent);

  const openCreate = () => {
    setIsCreating(true);
    setSelectedAutomationId(null);
    setDraft(toDraft(null, githubIntegration?.id));
  };

  const openExisting = (automation: Automation) => {
    setIsCreating(false);
    setSelectedAutomationId(automation.id);
    setDraft(toDraft(automation, githubIntegration?.id));
  };

  const applyTemplate = (templateId: string) => {
    const template = AUTOMATION_TEMPLATES.find(
      (item) => item.id === templateId,
    );
    if (!template) {
      return;
    }

    setDraft((current) => ({
      ...current,
      name: current.name || template.name,
      prompt: template.prompt,
      templateId: template.id,
    }));
  };

  const handleSave = () => {
    if (!draft.name.trim() || !draft.prompt.trim() || !draft.repoPath.trim()) {
      return;
    }

    if (isCreating || !selectedAutomation) {
      const automationId = createAutomation({
        name: draft.name,
        prompt: draft.prompt,
        repoPath: draft.repoPath,
        repository: draft.repository,
        githubIntegrationId: draft.githubIntegrationId,
        scheduleTime: draft.scheduleTime,
        templateId: draft.templateId,
      });
      const created = useAutomationStore
        .getState()
        .automations.find((item) => item.id === automationId);
      if (created) {
        openExisting(created);
      }
      return;
    }

    updateAutomation(selectedAutomation.id, {
      name: draft.name,
      prompt: draft.prompt,
      repoPath: draft.repoPath,
      repository: draft.repository,
      githubIntegrationId: draft.githubIntegrationId,
      scheduleTime: draft.scheduleTime,
      templateId: draft.templateId,
    });
  };

  const handleDelete = () => {
    if (!selectedAutomation) {
      return;
    }
    deleteAutomation(selectedAutomation.id);
    openCreate();
  };

  const enabledCount = automations.filter(
    (automation) => automation.enabled,
  ).length;
  const timezone = getLocalTimezone();

  return (
    <Flex direction="column" height="100%" className="overflow-hidden">
      <Flex
        align="center"
        gap="3"
        px="3"
        py="2"
        className="shrink-0 border-gray-6 border-b"
      >
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          {automations.length} automation{automations.length === 1 ? "" : "s"}
        </Text>
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          {enabledCount} enabled
        </Text>
        <div className="flex-1" />
        <Button size="1" variant="soft" onClick={openCreate}>
          <Plus size={12} />
          New automation
        </Button>
      </Flex>

      <Flex style={{ minHeight: 0 }} className="flex-1">
        <Box width="360px" className="border-gray-6 border-r">
          <ScrollArea type="auto" style={{ height: "100%" }}>
            <Flex direction="column" gap="2" p="3">
              {automations.length === 0 ? (
                <Flex
                  direction="column"
                  align="center"
                  justify="center"
                  gap="3"
                  className="rounded-lg border border-gray-6 border-dashed p-6"
                >
                  <Robot size={28} className="text-gray-8" />
                  <Text size="2" className="font-mono text-[12px] text-gray-10">
                    No automations yet
                  </Text>
                </Flex>
              ) : (
                automations.map((automation) => {
                  const isSelected =
                    !isCreating && selectedAutomation?.id === automation.id;

                  return (
                    <button
                      key={automation.id}
                      type="button"
                      onClick={() => openExisting(automation)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-accent-8 bg-accent-2"
                          : "border-gray-5 bg-gray-1 hover:border-gray-7 hover:bg-gray-2"
                      }`}
                    >
                      <Flex direction="column" gap="2">
                        <Flex align="center" justify="between" gap="2">
                          <Text
                            size="2"
                            weight="medium"
                            className="min-w-0 flex-1 truncate font-mono text-[12px]"
                          >
                            {automation.name}
                          </Text>
                          <AutomationStatusBadge automation={automation} />
                        </Flex>
                        <Text
                          size="1"
                          className="font-mono text-[11px] text-gray-10"
                        >
                          Next run{" "}
                          {automation.enabled
                            ? formatAutomationDateTime(
                                automation.nextRunAt,
                                automation.timezone,
                              )
                            : "paused"}
                        </Text>
                        <Text
                          size="1"
                          className="truncate font-mono text-[11px] text-gray-10"
                        >
                          {automation.repoPath}
                        </Text>
                      </Flex>
                    </button>
                  );
                })
              )}
            </Flex>
          </ScrollArea>
        </Box>

        <Box flexGrow="1" style={{ minWidth: 0 }}>
          <ScrollArea type="auto" style={{ height: "100%" }}>
            <Flex direction="column" gap="5" p="4" style={{ maxWidth: 900 }}>
              <Flex direction="column" gap="2">
                <Text size="2" weight="medium">
                  {isCreating
                    ? "New automation"
                    : (selectedAutomation?.name ?? "Automation")}
                </Text>
                <Text size="1" className="font-mono text-[11px] text-gray-10">
                  Runs locally on this app while it is open. Missed runs are
                  skipped.
                </Text>
              </Flex>

              <Flex direction="column" gap="3">
                <Text
                  size="1"
                  weight="medium"
                  className="font-mono text-[11px]"
                >
                  Template library
                </Text>
                <Flex gap="3" wrap="wrap">
                  {AUTOMATION_TEMPLATES.map((template) => (
                    <Box
                      key={template.id}
                      className="min-w-[220px] flex-1 rounded-lg border border-gray-5 bg-gray-1 p-3"
                    >
                      <Flex direction="column" gap="2">
                        <Flex align="center" justify="between" gap="2">
                          <Text size="2" weight="medium">
                            {template.name}
                          </Text>
                          <Badge size="1" variant="soft">
                            {template.category}
                          </Badge>
                        </Flex>
                        <Text size="1" className="text-gray-10">
                          {template.description}
                        </Text>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => applyTemplate(template.id)}
                        >
                          Use template
                        </Button>
                      </Flex>
                    </Box>
                  ))}
                </Flex>
              </Flex>

              <Separator size="4" />

              <Flex direction="column" gap="4">
                <Flex direction="column" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    Name
                  </Text>
                  <TextField.Root
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Morning repo check"
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    Prompt
                  </Text>
                  <TextArea
                    value={draft.prompt}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                    placeholder="Tell the agent what to review and summarize."
                    rows={10}
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    Local context
                  </Text>
                  <FolderPicker
                    value={draft.repoPath}
                    onChange={(repoPath) =>
                      setDraft((current) => ({ ...current, repoPath }))
                    }
                    placeholder="Select repository..."
                    size="2"
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text
                    size="1"
                    weight="medium"
                    className="font-mono text-[11px]"
                  >
                    GitHub repository
                  </Text>
                  <GitHubRepoPicker
                    value={draft.repository}
                    onChange={(repository) =>
                      setDraft((current) => ({
                        ...current,
                        repository,
                        githubIntegrationId: githubIntegration?.id ?? null,
                      }))
                    }
                    repositories={repositories}
                    isLoading={isLoadingRepos}
                    placeholder="Optional"
                    size="2"
                  />
                </Flex>

                <Flex gap="4" wrap="wrap">
                  <Flex direction="column" gap="2">
                    <Text
                      size="1"
                      weight="medium"
                      className="font-mono text-[11px]"
                    >
                      Daily time
                    </Text>
                    <TextField.Root
                      type="time"
                      value={draft.scheduleTime}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          scheduleTime: event.target.value,
                        }))
                      }
                    />
                  </Flex>

                  <Flex direction="column" gap="2">
                    <Text
                      size="1"
                      weight="medium"
                      className="font-mono text-[11px]"
                    >
                      Timezone
                    </Text>
                    <Box className="rounded border border-gray-6 bg-gray-2 px-3 py-2">
                      <Text
                        size="1"
                        className="font-mono text-[11px] text-gray-10"
                      >
                        {timezone}
                      </Text>
                    </Box>
                  </Flex>
                </Flex>

                {!isCreating && selectedAutomation ? (
                  <Flex direction="column" gap="2">
                    <Text
                      size="1"
                      weight="medium"
                      className="font-mono text-[11px]"
                    >
                      Run status
                    </Text>
                    <Flex direction="column" gap="1">
                      <Text
                        size="1"
                        className="font-mono text-[11px] text-gray-10"
                      >
                        Next run:{" "}
                        {selectedAutomation.enabled
                          ? formatAutomationDateTime(
                              selectedAutomation.nextRunAt,
                              selectedAutomation.timezone,
                            )
                          : "Paused"}
                      </Text>
                      <Text
                        size="1"
                        className="font-mono text-[11px] text-gray-10"
                      >
                        Last run:{" "}
                        {formatAutomationDateTime(
                          selectedAutomation.lastRunAt,
                          selectedAutomation.timezone,
                        )}
                      </Text>
                      {selectedAutomation.lastError ? (
                        <Text
                          size="1"
                          className="font-mono text-[11px] text-red-10"
                        >
                          {selectedAutomation.lastError}
                        </Text>
                      ) : null}
                    </Flex>
                  </Flex>
                ) : null}
              </Flex>

              <Flex align="center" gap="3" wrap="wrap">
                {!isCreating && selectedAutomation ? (
                  <>
                    <Switch
                      checked={selectedAutomation.enabled}
                      onCheckedChange={() =>
                        toggleAutomation(selectedAutomation.id)
                      }
                    />
                    <Text
                      size="1"
                      className="font-mono text-[11px] text-gray-10"
                    >
                      {selectedAutomation.enabled ? "Enabled" : "Paused"}
                    </Text>
                  </>
                ) : null}
                <div className="flex-1" />
                {!isCreating && selectedAutomation ? (
                  <Button
                    color="gray"
                    variant="soft"
                    disabled={runningAutomationIds.includes(
                      selectedAutomation.id,
                    )}
                    onClick={() => void runAutomationNow(selectedAutomation.id)}
                  >
                    <Play size={12} />
                    Run now
                  </Button>
                ) : null}
                {!isCreating && selectedAutomation ? (
                  <Button color="red" variant="soft" onClick={handleDelete}>
                    <Trash size={12} />
                    Delete
                  </Button>
                ) : null}
                <Button
                  onClick={handleSave}
                  disabled={
                    !draft.name.trim() ||
                    !draft.prompt.trim() ||
                    !draft.repoPath.trim()
                  }
                >
                  <FloppyDisk size={12} />
                  {isCreating ? "Create automation" : "Save changes"}
                </Button>
              </Flex>
            </Flex>
          </ScrollArea>
        </Box>
      </Flex>
    </Flex>
  );
}
