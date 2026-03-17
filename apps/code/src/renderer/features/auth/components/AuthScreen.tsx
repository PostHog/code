import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { ZenHedgehog } from "@components/ZenHedgehog";
import { Flex, Theme } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
import { OAuthControls } from "./OAuthControls";

export function AuthScreen() {
  return (
    <Theme appearance="light" accentColor="orange" radius="medium">
      <Flex height="100vh" style={{ position: "relative", overflow: "hidden" }}>
        <DraggableTitleBar />

        {/* Background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgb(243, 244, 240)",
          }}
        />

        {/* Right panel — zen hedgehog */}
        <Flex
          align="center"
          justify="center"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "50%",
            backgroundColor: "rgb(243, 244, 240)",
          }}
        >
          <ZenHedgehog />
        </Flex>

        {/* Left side with card */}
        <Flex
          width="50%"
          align="center"
          justify="center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Auth card */}
          <Flex
            direction="column"
            gap="5"
            style={{
              position: "relative",
              width: "360px",
              padding: "32px",
              backgroundColor: "var(--color-panel-solid)",
              borderRadius: "16px",
              border: "1px solid var(--gray-4)",
              boxShadow:
                "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
            }}
          >
            {/* Logo */}
            <img
              src={codeLogo}
              alt="PostHog"
              style={{
                height: "30px",
                objectFit: "contain",
                alignSelf: "center",
              }}
            />

            <OAuthControls />
          </Flex>
        </Flex>

        {/* Right side - shows background */}
        <div style={{ width: "50%" }} />
      </Flex>
    </Theme>
  );
}
