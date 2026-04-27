import { Plugs } from "@phosphor-icons/react";
import { Flex } from "@radix-ui/themes";

const BRAND_ICONS: Record<string, string> = {
  airops: "/services/airops.png",
  atlassian: "/services/atlassian.svg",
  attio: "/services/attio.png",
  box: "/services/box.svg",
  browserbase: "/services/browserbase.svg",
  canva: "/services/canva.svg",
  circle: "/services/circle.png",
  cisco_thousandeyes: "/services/cisco_thousandeyes.png",
  clerk: "/services/clerk.svg",
  clickhouse: "/services/clickhouse.svg",
  cloudflare: "/services/cloudflare.svg",
  context7: "/services/context7.svg",
  datadog: "/services/datadog.svg",
  figma: "/services/figma.svg",
  firetiger: "/services/firetiger.svg",
  github: "/services/github.svg",
  gitlab: "/services/gitlab.svg",
  hex: "/services/hex.svg",
  hubspot: "/services/hubspot.svg",
  launchdarkly: "/services/launchdarkly.png",
  linear: "/services/linear.svg",
  monday: "/services/monday.svg",
  neon: "/services/neon.svg",
  notion: "/services/notion.svg",
  pagerduty: "/services/pagerduty.svg",
  planetscale: "/services/planetscale.svg",
  postman: "/services/postman.svg",
  prisma: "/services/prisma.svg",
  render: "/services/render.svg",
  sanity: "/services/sanity.svg",
  sentry: "/services/sentry.svg",
  slack: "/services/slack.png",
  stripe: "/services/stripe.png",
  supabase: "/services/supabase.svg",
  svelte: "/services/svelte.png",
  wix: "/services/wix.png",
};

export function resolveServerIcon(
  iconKey: string | null | undefined,
): string | undefined {
  return iconKey ? BRAND_ICONS[iconKey] : undefined;
}

interface ServerIconProps {
  iconKey?: string | null;
  size?: number;
  className?: string;
}

export function ServerIcon({ iconKey, size = 32, className }: ServerIconProps) {
  const src = resolveServerIcon(iconKey);
  const dimension = `${size}px`;
  const radius = 2;
  return (
    <Flex
      align="center"
      justify="center"
      className={`shrink-0 overflow-hidden bg-gray-3 ${className ?? ""}`}
      style={{ width: dimension, height: dimension, borderRadius: radius }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          style={{ borderRadius: radius }}
        />
      ) : (
        <Plugs size={Math.round(size * 0.55)} className="text-gray-11" />
      )}
    </Flex>
  );
}
