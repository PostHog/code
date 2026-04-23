import {
  DiscordLogo,
  FigmaLogo,
  GithubLogo,
  GitlabLogo,
  GoogleLogo,
  LinkedinLogo,
  type Icon as PhosphorIcon,
  Plugs,
  SlackLogo,
} from "@phosphor-icons/react";
import { Flex } from "@radix-ui/themes";

const BRAND_ICONS: Record<string, PhosphorIcon> = {
  GitHub: GithubLogo,
  Gitlab: GitlabLogo,
  Slack: SlackLogo,
  Discord: DiscordLogo,
  Figma: FigmaLogo,
  LinkedIn: LinkedinLogo,
  Google: GoogleLogo,
};

function normalizeKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const key of Object.keys(BRAND_ICONS)) {
    if (key.toLowerCase() === trimmed.toLowerCase()) return key;
  }
  return null;
}

export function resolveServerIcon(
  ...keys: (string | null | undefined)[]
): PhosphorIcon {
  for (const raw of keys) {
    const normalized = normalizeKey(raw);
    if (normalized) return BRAND_ICONS[normalized];
  }
  return Plugs;
}

interface ServerIconProps {
  iconKey?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function ServerIcon({
  iconKey,
  name,
  size = 32,
  className,
}: ServerIconProps) {
  const IconComponent = resolveServerIcon(iconKey, name);
  const dimension = `${size}px`;
  return (
    <Flex
      align="center"
      justify="center"
      className={`shrink-0 rounded bg-gray-3 ${className ?? ""}`}
      style={{ width: dimension, height: dimension }}
    >
      <IconComponent size={Math.round(size * 0.55)} className="text-gray-11" />
    </Flex>
  );
}
