import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    secureStore: {
      getItem: { query: vi.fn() },
      setItem: { query: vi.fn() },
    },
  },
}));

import type { SendMessagesWith } from "@stores/settingsStore";
import { useSettingsStore } from "@stores/settingsStore";
import { isSendMessageSubmitKey } from "./sendMessageKey";

interface SubmitCase {
  mode: SendMessagesWith;
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  expected: boolean;
}

const cases: SubmitCase[] = [
  { mode: "enter", key: "a", expected: false },
  { mode: "enter", key: "Enter", expected: true },
  { mode: "enter", key: "Enter", shiftKey: true, expected: false },
  { mode: "enter", key: "Enter", metaKey: true, expected: true },
  { mode: "cmd+enter", key: "Enter", expected: false },
  { mode: "cmd+enter", key: "Enter", shiftKey: true, expected: false },
  { mode: "cmd+enter", key: "Enter", metaKey: true, expected: true },
  { mode: "cmd+enter", key: "Enter", ctrlKey: true, expected: true },
];

describe("isSendMessageSubmitKey", () => {
  beforeEach(() => {
    useSettingsStore.setState({ sendMessagesWith: "enter" });
  });

  it.each(cases)(
    "mode=$mode key=$key meta=$metaKey ctrl=$ctrlKey shift=$shiftKey -> $expected",
    ({ mode, key, metaKey, ctrlKey, shiftKey, expected }) => {
      useSettingsStore.setState({ sendMessagesWith: mode });
      expect(
        isSendMessageSubmitKey({
          key,
          metaKey: !!metaKey,
          ctrlKey: !!ctrlKey,
          shiftKey: !!shiftKey,
        }),
      ).toBe(expected);
    },
  );
});
