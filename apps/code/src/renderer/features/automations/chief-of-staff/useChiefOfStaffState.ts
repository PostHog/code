import { useAuthStore } from "@features/auth/stores/authStore";
import { trpcClient } from "@renderer/trpc";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { logger } from "@utils/logger";
import { useCallback, useMemo, useState } from "react";
import { AUTOMATION_TEMPLATES } from "../templates";
import {
  ALL_SOFTWARE,
  type LlmSuggestionResponse,
  type SuggestedAutomation,
  templateToSuggestion,
} from "./chief-of-staff-types";

const log = logger.scope("chief-of-staff");

type WizardStep = 1 | 2 | 3 | 4;

const SYSTEM_PROMPT = `You are a setup assistant for an automation tool. Given a user's role description, you must:

1. Select which software tools they likely use from the available list
2. Select which existing automation template IDs are most relevant to them
3. Generate 3-8 NEW custom automations tailored to their specific needs that aren't covered by existing templates

Each generated automation needs:
- name: Short, descriptive name
- description: One sentence explaining what it does
- prompt: The full instruction for an AI agent to execute this automation daily

Respond with ONLY valid JSON in this exact format:
{
  "software": ["Tool1", "Tool2"],
  "existingTemplateIds": ["template-id-1", "template-id-2"],
  "generatedAutomations": [
    {
      "name": "Automation Name",
      "description": "What this automation does",
      "prompt": "Detailed instruction for the AI agent..."
    }
  ]
}`;

function buildUserPrompt(roleDescription: string): string {
  const softwareList = ALL_SOFTWARE.join(", ");
  const templateList = AUTOMATION_TEMPLATES.map(
    (t) =>
      `- ${t.id}: ${t.name} (${t.category}) [${(t.mcps ?? []).join(", ")}] — ${t.description}`,
  ).join("\n");

  return `User's role description:
"${roleDescription}"

Available software tools:
${softwareList}

Available automation templates:
${templateList}

Select the relevant software, pick the most useful existing templates, and generate new custom automations for this person.`;
}

function parseLlmResponse(content: string): LlmSuggestionResponse | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (
      !Array.isArray(parsed.software) ||
      !Array.isArray(parsed.existingTemplateIds) ||
      !Array.isArray(parsed.generatedAutomations)
    ) {
      return null;
    }
    return parsed as LlmSuggestionResponse;
  } catch {
    log.error("Failed to parse LLM response");
    return null;
  }
}

export function useChiefOfStaffState() {
  const [step, setStep] = useState<WizardStep>(1);
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedSoftware, setSelectedSoftware] = useState<Set<string>>(
    new Set(),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatedAutomations, setGeneratedAutomations] = useState<
    SuggestedAutomation[]
  >([]);
  const [llmSuggestedTemplateIds, setLlmSuggestedTemplateIds] = useState<
    Set<string>
  >(new Set());
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [repoPath, setRepoPath] = useState("");
  const [repository, setRepository] = useState<string | null>(null);
  const [githubIntegrationId, setGithubIntegrationId] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [llmDone, setLlmDone] = useState(false);

  const filteredExistingTemplates = useMemo(() => {
    return AUTOMATION_TEMPLATES.filter((template) => {
      if (!llmSuggestedTemplateIds.has(template.id)) return false;
      const mcps = template.mcps ?? [];
      if (mcps.length === 0) return true;
      return mcps.some((mcp) => selectedSoftware.has(mcp));
    }).map(templateToSuggestion);
  }, [llmSuggestedTemplateIds, selectedSoftware]);

  const allSuggestions = useMemo(
    () => [...generatedAutomations, ...filteredExistingTemplates],
    [generatedAutomations, filteredExistingTemplates],
  );

  const fetchSuggestions = useCallback(async (description: string) => {
    setIsLoading(true);
    try {
      const authState = useAuthStore.getState();
      const apiKey = authState.oauthAccessToken;
      const cloudRegion = authState.cloudRegion;
      if (!apiKey || !cloudRegion) {
        throw new Error("Not authenticated");
      }

      const apiHost = getCloudUrlFromRegion(cloudRegion);
      const result = await trpcClient.llmGateway.prompt.mutate({
        credentials: { apiKey, apiHost },
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user" as const, content: buildUserPrompt(description) },
        ],
        maxTokens: 2000,
      });

      const parsed = parseLlmResponse(result.content);
      if (!parsed) {
        throw new Error("Failed to parse LLM response");
      }

      const softwareSet = new Set(
        parsed.software.filter((s) => ALL_SOFTWARE.includes(s)),
      );
      setSelectedSoftware(softwareSet);

      const templateIds = new Set(
        parsed.existingTemplateIds.filter((id) =>
          AUTOMATION_TEMPLATES.some((t) => t.id === id),
        ),
      );
      setLlmSuggestedTemplateIds(templateIds);

      const generated: SuggestedAutomation[] = parsed.generatedAutomations.map(
        (a) => ({
          id: `generated-${crypto.randomUUID()}`,
          name: a.name,
          description: a.description,
          prompt: a.prompt,
          source: "generated" as const,
        }),
      );
      setGeneratedAutomations(generated);

      const allIds = new Set([...templateIds, ...generated.map((g) => g.id)]);
      setSelectedIds(allIds);
      setLlmDone(true);
    } catch (error) {
      log.error("LLM suggestion failed, falling back to all templates", {
        error,
      });
      setSelectedSoftware(new Set(ALL_SOFTWARE));
      const allTemplateIds = new Set(AUTOMATION_TEMPLATES.map((t) => t.id));
      setLlmSuggestedTemplateIds(allTemplateIds);
      setSelectedIds(allTemplateIds);
      setGeneratedAutomations([]);
      setLlmDone(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleSoftware = useCallback((tool: string) => {
    setSelectedSoftware((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) {
        next.delete(tool);
      } else {
        next.add(tool);
      }
      return next;
    });
  }, []);

  const selectAllSoftware = useCallback(() => {
    setSelectedSoftware(new Set(ALL_SOFTWARE));
  }, []);

  const deselectAllSoftware = useCallback(() => {
    setSelectedSoftware(new Set());
  }, []);

  const toggleTemplate = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllTemplates = useCallback(() => {
    setSelectedIds(new Set(allSuggestions.map((s) => s.id)));
  }, [allSuggestions]);

  const deselectAllTemplates = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, 4) as WizardStep);
  }, []);

  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  }, []);

  const handleRoleNext = useCallback(async () => {
    if (roleDescription.trim()) {
      setStep(2);
      await fetchSuggestions(roleDescription.trim());
    } else {
      setSelectedSoftware(new Set(ALL_SOFTWARE));
      const allTemplateIds = new Set(AUTOMATION_TEMPLATES.map((t) => t.id));
      setLlmSuggestedTemplateIds(allTemplateIds);
      setSelectedIds(allTemplateIds);
      setGeneratedAutomations([]);
      setLlmDone(true);
      setStep(2);
    }
  }, [roleDescription, fetchSuggestions]);

  const reset = useCallback(() => {
    setStep(1);
    setRoleDescription("");
    setSelectedSoftware(new Set());
    setSelectedIds(new Set());
    setGeneratedAutomations([]);
    setLlmSuggestedTemplateIds(new Set());
    setScheduleTime("09:00");
    setRepoPath("");
    setRepository(null);
    setGithubIntegrationId(null);
    setIsLoading(false);
    setLlmDone(false);
  }, []);

  const selectedCount = selectedIds.size;

  return {
    step,
    roleDescription,
    setRoleDescription,
    selectedSoftware,
    toggleSoftware,
    selectAllSoftware,
    deselectAllSoftware,
    selectedIds,
    toggleTemplate,
    selectAllTemplates,
    deselectAllTemplates,
    generatedAutomations,
    filteredExistingTemplates,
    allSuggestions,
    scheduleTime,
    setScheduleTime,
    repoPath,
    setRepoPath,
    repository,
    setRepository,
    githubIntegrationId,
    setGithubIntegrationId,
    isLoading,
    llmDone,
    selectedCount,
    next,
    back,
    handleRoleNext,
    reset,
  };
}
