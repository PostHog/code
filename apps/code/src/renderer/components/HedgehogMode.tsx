import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useMeQuery } from "@hooks/useMeQuery";
import type {
  HedgehogActorOptions,
  HedgeHogMode as HedgehogModeGame,
} from "@posthog/hedgehog-mode";
import { logger } from "@utils/logger";
import { useEffect, useRef } from "react";

const log = logger.scope("hedgehog-mode");

export function HedgehogMode() {
  const hedgehogMode = useSettingsStore((s) => s.hedgehogMode);
  const setHedgehogMode = useSettingsStore((s) => s.setHedgehogMode);
  const { data: user } = useMeQuery();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<HedgehogModeGame | null>(null);

  useEffect(() => {
    if (!hedgehogMode || !containerRef.current || gameRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    const hedgehogConfig = user?.hedgehog_config as Record<
      string,
      unknown
    > | null;
    const actorOptions = hedgehogConfig?.actor_options as
      | HedgehogActorOptions
      | undefined;

    import("@posthog/hedgehog-mode")
      .then(async ({ HedgeHogMode }) => {
        if (cancelled) return;

        log.info("Creating hedgehog game instance");

        const game = new HedgeHogMode({
          assetsUrl: "./hedgehog-mode",
          state: actorOptions ? { options: actorOptions } : undefined,
          onQuit: (g) => {
            g.getAllHedgehogs().forEach((hedgehog) => {
              hedgehog.updateSprite("wave", { reset: true, loop: false });
            });
            setTimeout(() => setHedgehogMode(false), 1000);
          },
        });

        gameRef.current = game;

        try {
          await game.render(container);
          log.info("Game rendered, hedgehogs:", game.getAllHedgehogs().length);
        } catch (err) {
          log.error("Game render failed", err);
        }
      })
      .catch((err) => {
        log.error("Failed to load hedgehog-mode module", err);
      });

    return () => {
      cancelled = true;
    };
  }, [hedgehogMode, user?.hedgehog_config, setHedgehogMode]);

  useEffect(() => {
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        zIndex: 999998,
        visibility: hedgehogMode ? "visible" : "hidden",
      }}
      className="pointer-events-none fixed inset-0"
    />
  );
}
