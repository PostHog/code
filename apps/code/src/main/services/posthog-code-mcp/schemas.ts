import { z } from "zod";

// -----------------------------------------------------------------------------
// MCP tool input/output schemas (askClarification)
// -----------------------------------------------------------------------------

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  prefilledAnswer: z.string(),
  kind: z.enum(["text", "select"]),
  options: z.array(z.string()).optional(),
});

export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

export const askClarificationInputSchema = z.object({
  questions: z.array(clarificationQuestionSchema).min(1),
  roundIndex: z.number().int().nonnegative(),
  roundsTotal: z.number().int().min(1).max(5),
});

export type AskClarificationInput = z.infer<typeof askClarificationInputSchema>;

export const clarificationAnswerSchema = z.object({
  id: z.string().min(1),
  answer: z.string(),
});

export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>;

export const askClarificationOutputSchema = z.object({
  answers: z.array(clarificationAnswerSchema),
  stop: z.boolean().optional(),
});

export type AskClarificationOutput = z.infer<
  typeof askClarificationOutputSchema
>;

// -----------------------------------------------------------------------------
// Service event payloads
// -----------------------------------------------------------------------------

export const clarificationRequestedEventSchema = z.object({
  requestId: z.string().min(1),
  input: askClarificationInputSchema,
});

export type ClarificationRequestedEventPayload = z.infer<
  typeof clarificationRequestedEventSchema
>;

export const clarificationResolvedEventSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(clarificationAnswerSchema),
  stop: z.boolean().optional(),
});

export type ClarificationResolvedEventPayload = z.infer<
  typeof clarificationResolvedEventSchema
>;

// -----------------------------------------------------------------------------
// tRPC input schemas
// -----------------------------------------------------------------------------

export const resolveClarificationInputSchema = z.object({
  requestId: z.string().min(1),
  answers: z.array(clarificationAnswerSchema),
  stop: z.boolean().optional(),
});

export type ResolveClarificationInput = z.infer<
  typeof resolveClarificationInputSchema
>;
