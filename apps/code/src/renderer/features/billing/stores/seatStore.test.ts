import type { SeatData } from "@shared/types/seat";
import { PLAN_FREE, PLAN_PRO } from "@shared/types/seat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsFeatureFlagEnabled = vi.hoisted(() => vi.fn());
const mockGetAuthenticatedClient = vi.hoisted(() => vi.fn());

vi.mock("@utils/analytics", () => ({
  isFeatureFlagEnabled: mockIsFeatureFlagEnabled,
}));

vi.mock("@features/auth/hooks/authClient", () => ({
  getAuthenticatedClient: mockGetAuthenticatedClient,
}));

vi.mock("@renderer/api/posthogClient", () => ({
  SeatSubscriptionRequiredError: class SeatSubscriptionRequiredError extends Error {
    redirectUrl: string;
    constructor(redirectUrl: string) {
      super("Billing subscription required");
      this.name = "SeatSubscriptionRequiredError";
      this.redirectUrl = redirectUrl;
    }
  },
  SeatPaymentFailedError: class SeatPaymentFailedError extends Error {
    constructor(message?: string) {
      super(message ?? "Payment failed");
      this.name = "SeatPaymentFailedError";
    }
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@utils/urls", () => ({
  getPostHogUrl: (path: string) => `https://posthog.com${path}`,
}));

import { useSeatStore } from "./seatStore";

function makeSeat(overrides: Partial<SeatData> = {}): SeatData {
  return {
    id: 1,
    user_distinct_id: "user-123",
    product_key: "posthog_code",
    plan_key: PLAN_FREE,
    status: "active",
    end_reason: null,
    created_at: Date.now(),
    active_until: null,
    active_from: Date.now(),
    ...overrides,
  };
}

function mockClient(overrides: Record<string, unknown> = {}) {
  const client = {
    getMySeat: vi.fn().mockResolvedValue(null),
    createSeat: vi.fn().mockResolvedValue(makeSeat()),
    upgradeSeat: vi.fn().mockResolvedValue(makeSeat({ plan_key: PLAN_PRO })),
    cancelSeat: vi.fn().mockResolvedValue(undefined),
    reactivateSeat: vi.fn().mockResolvedValue(makeSeat()),
    ...overrides,
  };
  mockGetAuthenticatedClient.mockResolvedValue(client);
  return client;
}

describe("seatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSeatStore.setState({
      seat: null,
      isLoading: false,
      error: null,
      redirectUrl: null,
    });
  });

  describe("billing flag gate", () => {
    it("fetchSeat does not call API when billing is disabled", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(false);
      const client = mockClient();

      await useSeatStore.getState().fetchSeat({ autoProvision: true });

      expect(client.getMySeat).not.toHaveBeenCalled();
      expect(client.createSeat).not.toHaveBeenCalled();
      expect(useSeatStore.getState().seat).toBeNull();
      expect(useSeatStore.getState().error).toBe("Billing is not enabled");
    });

    it("provisionFreeSeat does not call API when billing is disabled", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(false);
      const client = mockClient();

      await useSeatStore.getState().provisionFreeSeat();

      expect(client.getMySeat).not.toHaveBeenCalled();
      expect(client.createSeat).not.toHaveBeenCalled();
    });

    it("upgradeToPro does not call API when billing is disabled", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(false);
      const client = mockClient();

      await useSeatStore.getState().upgradeToPro();

      expect(client.getMySeat).not.toHaveBeenCalled();
      expect(client.upgradeSeat).not.toHaveBeenCalled();
    });

    it("cancelSeat does not call API when billing is disabled", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(false);
      const client = mockClient();

      await useSeatStore.getState().cancelSeat();

      expect(client.cancelSeat).not.toHaveBeenCalled();
    });

    it("reactivateSeat does not call API when billing is disabled", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(false);
      const client = mockClient();

      await useSeatStore.getState().reactivateSeat();

      expect(client.reactivateSeat).not.toHaveBeenCalled();
    });
  });

  describe("fetchSeat", () => {
    it("fetches existing seat", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const seat = makeSeat();
      mockClient({ getMySeat: vi.fn().mockResolvedValue(seat) });

      await useSeatStore.getState().fetchSeat();

      const state = useSeatStore.getState();
      expect(state.seat).toEqual(seat);
      expect(state.isLoading).toBe(false);
    });

    it("auto-provisions free seat when none exists", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const seat = makeSeat();
      const client = mockClient({
        getMySeat: vi.fn().mockResolvedValue(null),
        createSeat: vi.fn().mockResolvedValue(seat),
      });

      await useSeatStore.getState().fetchSeat({ autoProvision: true });

      expect(client.createSeat).toHaveBeenCalledWith(PLAN_FREE);
      expect(useSeatStore.getState().seat).toEqual(seat);
    });

    it("does not auto-provision when option is false", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const client = mockClient();

      await useSeatStore.getState().fetchSeat();

      expect(client.createSeat).not.toHaveBeenCalled();
      expect(useSeatStore.getState().seat).toBeNull();
    });
  });

  describe("provisionFreeSeat", () => {
    it("creates free seat when none exists", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const seat = makeSeat();
      const client = mockClient({
        createSeat: vi.fn().mockResolvedValue(seat),
      });

      await useSeatStore.getState().provisionFreeSeat();

      expect(client.createSeat).toHaveBeenCalledWith(PLAN_FREE);
      expect(useSeatStore.getState().seat).toEqual(seat);
    });

    it("uses existing seat instead of creating", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const existing = makeSeat();
      const client = mockClient({
        getMySeat: vi.fn().mockResolvedValue(existing),
      });

      await useSeatStore.getState().provisionFreeSeat();

      expect(client.createSeat).not.toHaveBeenCalled();
      expect(useSeatStore.getState().seat).toEqual(existing);
    });
  });

  describe("upgradeToPro", () => {
    it("upgrades existing free seat to pro", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const freeSeat = makeSeat({ plan_key: PLAN_FREE });
      const proSeat = makeSeat({ plan_key: PLAN_PRO });
      const client = mockClient({
        getMySeat: vi.fn().mockResolvedValue(freeSeat),
        upgradeSeat: vi.fn().mockResolvedValue(proSeat),
      });

      await useSeatStore.getState().upgradeToPro();

      expect(client.upgradeSeat).toHaveBeenCalledWith(PLAN_PRO);
      expect(useSeatStore.getState().seat).toEqual(proSeat);
    });

    it("no-ops when already on pro", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const proSeat = makeSeat({ plan_key: PLAN_PRO });
      const client = mockClient({
        getMySeat: vi.fn().mockResolvedValue(proSeat),
      });

      await useSeatStore.getState().upgradeToPro();

      expect(client.upgradeSeat).not.toHaveBeenCalled();
      expect(client.createSeat).not.toHaveBeenCalled();
      expect(useSeatStore.getState().seat).toEqual(proSeat);
    });

    it("creates pro seat when none exists", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const proSeat = makeSeat({ plan_key: PLAN_PRO });
      const client = mockClient({
        createSeat: vi.fn().mockResolvedValue(proSeat),
      });

      await useSeatStore.getState().upgradeToPro();

      expect(client.createSeat).toHaveBeenCalledWith(PLAN_PRO);
    });
  });

  describe("cancelSeat", () => {
    it("cancels and re-fetches seat", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const canceledSeat = makeSeat({ status: "canceling" });
      const client = mockClient({
        getMySeat: vi.fn().mockResolvedValue(canceledSeat),
      });

      await useSeatStore.getState().cancelSeat();

      expect(client.cancelSeat).toHaveBeenCalled();
      expect(useSeatStore.getState().seat).toEqual(canceledSeat);
    });
  });

  describe("reactivateSeat", () => {
    it("reactivates seat", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const seat = makeSeat({ status: "active" });
      mockClient({
        reactivateSeat: vi.fn().mockResolvedValue(seat),
      });

      await useSeatStore.getState().reactivateSeat();

      expect(useSeatStore.getState().seat).toEqual(seat);
    });
  });

  describe("error handling", () => {
    it("sets redirect URL on subscription required error", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const { SeatSubscriptionRequiredError } = await import(
        "@renderer/api/posthogClient"
      );
      mockClient({
        getMySeat: vi
          .fn()
          .mockRejectedValue(
            new SeatSubscriptionRequiredError("/organization/billing"),
          ),
      });

      await useSeatStore.getState().fetchSeat();

      const state = useSeatStore.getState();
      expect(state.error).toBe("Billing subscription required");
      expect(state.redirectUrl).toBe(
        "https://posthog.com/organization/billing",
      );
    });

    it("sets error on payment failure", async () => {
      mockIsFeatureFlagEnabled.mockReturnValue(true);
      const { SeatPaymentFailedError } = await import(
        "@renderer/api/posthogClient"
      );
      mockClient({
        getMySeat: vi
          .fn()
          .mockRejectedValue(new SeatPaymentFailedError("Card declined")),
      });

      await useSeatStore.getState().fetchSeat();

      expect(useSeatStore.getState().error).toBe("Card declined");
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      useSeatStore.setState({
        seat: makeSeat(),
        isLoading: true,
        error: "some error",
        redirectUrl: "https://example.com",
      });

      useSeatStore.getState().reset();

      const state = useSeatStore.getState();
      expect(state.seat).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.redirectUrl).toBeNull();
    });
  });
});
