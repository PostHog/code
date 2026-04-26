import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewService } from "../preview/service";
import type { ScratchpadService } from "../scratchpad/service";
import type { ClarificationRequestedEventPayload } from "./schemas";
import { PosthogCodeMcpEvent, PosthogCodeMcpService } from "./service";

describe("PosthogCodeMcpService", () => {
  let service: PosthogCodeMcpService;

  beforeEach(() => {
    const previewStub = {
      register: vi.fn(),
      unregister: vi.fn(),
      list: vi.fn(),
    } as unknown as PreviewService;
    const scratchpadStub = {
      getScratchpadPath: vi.fn(async () => null),
      readManifest: vi.fn(),
      writeManifest: vi.fn(),
    } as unknown as ScratchpadService;
    service = new PosthogCodeMcpService(previewStub, scratchpadStub);
  });

  afterEach(async () => {
    await service.stop();
    vi.restoreAllMocks();
  });

  it("emits ClarificationRequested and resolves with the user's answers", async () => {
    const events: ClarificationRequestedEventPayload[] = [];
    service.on(PosthogCodeMcpEvent.ClarificationRequested, (e) => {
      events.push(e);
    });

    const toolPromise = service.handleAskClarification({
      questions: [
        {
          id: "q1",
          question: "What's the primary user action?",
          prefilledAnswer: "Track habits",
          kind: "text",
        },
      ],
      roundIndex: 0,
      roundsTotal: 3,
    });

    // Wait a tick for the event to fire.
    await Promise.resolve();
    expect(events).toHaveLength(1);
    const { requestId } = events[0];

    const resolved = service.resolveRequest(requestId, {
      answers: [{ id: "q1", answer: "Build streaks" }],
    });
    expect(resolved).toBe(true);

    const result = await toolPromise;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      answers: [{ id: "q1", answer: "Build streaks" }],
      stop: undefined,
    });
  });

  it("returns a recoverable structured error when the round cap is exceeded", async () => {
    const events: ClarificationRequestedEventPayload[] = [];
    service.on(PosthogCodeMcpEvent.ClarificationRequested, (e) => {
      events.push(e);
    });

    const result = await service.handleAskClarification({
      questions: [
        {
          id: "q1",
          question: "Anything?",
          prefilledAnswer: "Yes",
          kind: "text",
        },
      ],
      // Caller has already used all 3 rounds.
      roundIndex: 3,
      roundsTotal: 3,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Round cap reached/);
    // No event should be emitted when the cap is hit.
    expect(events).toHaveLength(0);
  });

  it("propagates stop: true through the resolved tool output", async () => {
    const events: ClarificationRequestedEventPayload[] = [];
    service.on(PosthogCodeMcpEvent.ClarificationRequested, (e) => {
      events.push(e);
    });

    const toolPromise = service.handleAskClarification({
      questions: [
        {
          id: "q1",
          question: "What's the data shape?",
          prefilledAnswer: "JSON",
          kind: "text",
        },
      ],
      roundIndex: 1,
      roundsTotal: 3,
    });

    await Promise.resolve();
    const { requestId } = events[0];
    service.resolveRequest(requestId, {
      answers: [{ id: "q1", answer: "JSON" }],
      stop: true,
    });

    const result = await toolPromise;
    expect(result.structuredContent).toEqual({
      answers: [{ id: "q1", answer: "JSON" }],
      stop: true,
    });
  });

  it("handles two concurrent clarifications independently", async () => {
    const events: ClarificationRequestedEventPayload[] = [];
    service.on(PosthogCodeMcpEvent.ClarificationRequested, (e) => {
      events.push(e);
    });

    const firstPromise = service.handleAskClarification({
      questions: [
        { id: "q1", question: "First?", prefilledAnswer: "A", kind: "text" },
      ],
      roundIndex: 0,
      roundsTotal: 3,
    });
    const secondPromise = service.handleAskClarification({
      questions: [
        { id: "q2", question: "Second?", prefilledAnswer: "B", kind: "text" },
      ],
      roundIndex: 0,
      roundsTotal: 3,
    });

    await Promise.resolve();
    expect(events).toHaveLength(2);
    const [firstReq, secondReq] = events;
    expect(firstReq.requestId).not.toBe(secondReq.requestId);

    // Resolve out of order to confirm the requests are routed by ID, not FIFO.
    service.resolveRequest(secondReq.requestId, {
      answers: [{ id: "q2", answer: "second-answer" }],
    });
    service.resolveRequest(firstReq.requestId, {
      answers: [{ id: "q1", answer: "first-answer" }],
    });

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(firstResult.structuredContent?.answers).toEqual([
      { id: "q1", answer: "first-answer" },
    ]);
    expect(secondResult.structuredContent?.answers).toEqual([
      { id: "q2", answer: "second-answer" },
    ]);
  });

  it("returns false when resolving an unknown request id", () => {
    const resolved = service.resolveRequest("does-not-exist", {
      answers: [],
    });
    expect(resolved).toBe(false);
  });
});
