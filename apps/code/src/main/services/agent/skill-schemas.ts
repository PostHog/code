import { z } from "zod";

export type { SkillInfo, SkillSource } from "@shared/types/skills";

export const skillSource = z.enum(["bundled", "user", "repo", "marketplace"]);

export const skillInfo = z.object({
  name: z.string(),
  description: z.string(),
  source: skillSource,
  path: z.string(),
  repoName: z.string().optional(),
});

export const listSkillsOutput = z.array(skillInfo);
