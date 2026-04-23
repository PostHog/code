import { Lifebuoy } from "@phosphor-icons/react";
import { Button, Flex, Theme } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark.svg";
import phWordmarkWhite from "@renderer/assets/images/wordmark-white.svg";
import { trpcClient } from "@renderer/trpc/client";
import { useThemeStore } from "@stores/themeStore";
import { EXTERNAL_LINKS } from "@utils/links";
import type { ReactNode } from "react";
import { DotPatternBackground } from "./DotPatternBackground";
import { DraggableTitleBar } from "./DraggableTitleBar";

interface FullScreenLayoutProps {
  children: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

export function FullScreenLayout({
  children,
  footerLeft,
  footerRight,
}: FullScreenLayoutProps) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <Theme
      appearance={isDarkMode ? "dark" : "light"}
      accentColor={isDarkMode ? "yellow" : "orange"}
      radius="medium"
    >
      <Flex
        direction="column"
        height="100vh"
        style={{ position: "relative", overflow: "hidden" }}
      >
        <DraggableTitleBar />

        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "var(--color-background)",
          }}
        />
        <DotPatternBackground />

        <Flex
          direction="column"
          flexGrow="1"
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: 0,
            width: "100%",
          }}
        >
          <img
            src={isDarkMode ? phWordmarkWhite : phWordmark}
            alt="PostHog"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
              marginLeft: 32,
              marginTop: "clamp(24px, 6vh, 80px)",
              flexShrink: 0,
            }}
          />

          <Flex
            direction="column"
            flexGrow="1"
            overflow="hidden"
            style={{ minHeight: 0 }}
          >
            {children}
          </Flex>

          <Flex
            justify="between"
            style={{
              position: "absolute",
              bottom: 20,
              left: 32,
              right: 32,
              zIndex: 2,
            }}
          >
            {footerLeft ?? (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() =>
                  trpcClient.os.openExternal.mutate({
                    url: EXTERNAL_LINKS.discord,
                  })
                }
                style={{ opacity: 0.5 }}
              >
                <Lifebuoy size={14} />
                Get support
              </Button>
            )}
            {footerRight ?? <div />}
          </Flex>
        </Flex>
      </Flex>
    </Theme>
  );
}
