import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpcClient: {
    secureStore: {
      getItem: { query: getItem },
      setItem: { query: setItem },
    },
  },
}));

import { useSettingsStore } from "./settingsStore";

describe("settingsStore sendMessagesWith", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    useSettingsStore.setState({
      sendMessagesWith: "enter",
    });
  });

  it("loads sendMessagesWith from secure store", async () => {
    getItem.mockResolvedValue("cmd+enter");

    await useSettingsStore.getState().loadSendMessagesWith();

    expect(getItem).toHaveBeenCalledWith({ key: "sendMessagesWith" });
    expect(useSettingsStore.getState().sendMessagesWith).toBe("cmd+enter");
  });

  it("keeps default when no value is stored", async () => {
    getItem.mockResolvedValue(null);

    await useSettingsStore.getState().loadSendMessagesWith();

    expect(useSettingsStore.getState().sendMessagesWith).toBe("enter");
  });

  it("persists sendMessagesWith updates", async () => {
    setItem.mockResolvedValue(undefined);

    await useSettingsStore.getState().setSendMessagesWith("cmd+enter");

    expect(setItem).toHaveBeenCalledWith({
      key: "sendMessagesWith",
      value: "cmd+enter",
    });
    expect(useSettingsStore.getState().sendMessagesWith).toBe("cmd+enter");
  });
});
