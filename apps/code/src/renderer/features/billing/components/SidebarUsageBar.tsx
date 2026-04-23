import { useFreeUsage } from "@features/billing/hooks/useFreeUsage";
import { isUsageExceeded } from "@features/billing/utils";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { Circle } from "@phosphor-icons/react";
import { BILLING_FLAG } from "@shared/constants";

export function SidebarUsageBar() {
  const billingEnabled = useFeatureFlag(BILLING_FLAG);
  const usage = useFreeUsage(billingEnabled);

  if (!usage) return null;

  const usagePercent = Math.max(
    usage.sustained.used_percent,
    usage.burst.used_percent,
  );
  const exceeded = isUsageExceeded(usage);

  const handleUpgrade = () => {
    useSettingsDialogStore.getState().open("plan-usage");
  };

  return (
    <div className="shrink-0 border-gray-6 border-t px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-11 text-xs">
          Free plan
          <Circle
            size={4}
            weight="fill"
            className="mx-1.5 inline text-gray-8"
          />
          <span className="font-normal text-gray-10">
            {exceeded
              ? "Limit reached"
              : `${Math.min(Math.round(usagePercent), 100)}% used`}
          </span>
        </span>
        <button
          type="button"
          className="bg-transparent font-medium text-accent-11 text-xs transition-colors hover:text-accent-12"
          onClick={handleUpgrade}
        >
          Upgrade
        </button>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-4">
        <div
          className={`h-full rounded-full transition-all ${exceeded ? "bg-red-9" : "bg-accent-9"}`}
          style={{ width: `${Math.min(Math.round(usagePercent), 100)}%` }}
        />
      </div>
    </div>
  );
}
