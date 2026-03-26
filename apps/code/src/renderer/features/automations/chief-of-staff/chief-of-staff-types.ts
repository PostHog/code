import type { AutomationTemplate } from "@shared/types/automations";
import { AUTOMATION_TEMPLATES } from "../templates";

export interface SuggestedAutomation {
  id: string;
  name: string;
  description: string;
  prompt: string;
  source: "existing" | "generated";
  mcps?: string[];
}

export interface LlmSuggestionResponse {
  software: string[];
  existingTemplateIds: string[];
  generatedAutomations: {
    name: string;
    description: string;
    prompt: string;
  }[];
}

export const ALL_SOFTWARE = [
  ...new Set(AUTOMATION_TEMPLATES.flatMap((t) => t.mcps ?? [])),
].sort();

export const ALL_CATEGORIES = [
  ...new Set(AUTOMATION_TEMPLATES.map((t) => t.category)),
].sort();

export function templateToSuggestion(
  template: AutomationTemplate,
): SuggestedAutomation {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    prompt: template.prompt,
    source: "existing",
    mcps: template.mcps,
  };
}
