import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  GitBranch,
  GithubLogo,
  Terminal,
  Warning,
} from "@phosphor-icons/react";
import { Box, Button, Code, Flex, Text } from "@radix-ui/themes";
import builderHog from "@renderer/assets/images/hedgehogs/builder-hog-03.png";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EXTERNAL_LINKS } from "@utils/links";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

interface CliInstallStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function CliInstallStep({ onNext, onBack }: CliInstallStepProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [isCheckingGh, setIsCheckingGh] = useState(false);

  const { data: gitStatus, isLoading: isLoadingGit } = useQuery(
    trpc.git.getGitStatus.queryOptions(undefined, { staleTime: 30_000 }),
  );
  const { data: ghStatus, isLoading: isLoadingGh } = useQuery(
    trpc.git.getGhStatus.queryOptions(undefined, { staleTime: 30_000 }),
  );

  const gitInstalled = gitStatus?.installed ?? false;
  const ghInstalled = ghStatus?.installed ?? false;
  const ghAuthenticated = ghStatus?.authenticated ?? false;
  const allReady = gitInstalled && ghInstalled && ghAuthenticated;

  const handleCheckGit = useCallback(async () => {
    setIsCheckingGit(true);
    await queryClient.invalidateQueries(trpc.git.getGitStatus.queryFilter());
    setIsCheckingGit(false);
  }, [queryClient, trpc]);

  const handleCheckGh = useCallback(async () => {
    setIsCheckingGh(true);
    await queryClient.invalidateQueries(trpc.git.getGhStatus.queryFilter());
    setIsCheckingGh(false);
  }, [queryClient, trpc]);

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        align="center"
        style={{
          width: "100%",
          height: "100%",
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <Flex
          direction="column"
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex
            direction="column"
            gap="5"
            style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}
          >
            <Flex direction="column" gap="5" style={{ width: "100%" }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Flex direction="column" gap="2">
                  <Text
                    size="6"
                    weight="bold"
                    style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                  >
                    Install required tools
                  </Text>
                  <Text size="2" style={{ color: "var(--gray-11)" }}>
                    These CLI tools are needed for code management and GitHub
                    workflows.
                  </Text>
                </Flex>
              </motion.div>

              {/* Git box */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                <Box
                  p="5"
                  style={{
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a3)",
                    borderRadius: 12,
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  <Flex direction="column" gap="3">
                    <Flex align="center" justify="between">
                      <Flex align="center" gap="2">
                        <GitBranch
                          size={18}
                          style={{ color: "var(--gray-12)" }}
                        />
                        <Text
                          size="3"
                          weight="bold"
                          style={{ color: "var(--gray-12)" }}
                        >
                          Git
                        </Text>
                      </Flex>
                      {isLoadingGit && (
                        <CircleNotch
                          size={14}
                          style={{
                            color: "var(--gray-9)",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                      )}
                      {!isLoadingGit && gitInstalled && (
                        <Flex align="center" gap="1">
                          <CheckCircle
                            size={14}
                            weight="fill"
                            style={{ color: "var(--green-9)" }}
                          />
                          <Text size="1" style={{ color: "var(--green-11)" }}>
                            Installed
                            {gitStatus?.version
                              ? ` (${gitStatus.version})`
                              : ""}
                          </Text>
                        </Flex>
                      )}
                    </Flex>
                    {!isLoadingGit && !gitInstalled && (
                      <Flex direction="column" gap="3">
                        <Text size="2" style={{ color: "var(--gray-11)" }}>
                          Install with Homebrew or Xcode Command Line Tools:
                        </Text>
                        <Flex direction="column" gap="2">
                          <Flex align="center" gap="2">
                            <Terminal
                              size={14}
                              style={{ color: "var(--gray-9)", flexShrink: 0 }}
                            />
                            <Code size="2" variant="soft">
                              brew install git
                            </Code>
                          </Flex>
                          <Flex align="center" gap="2">
                            <Terminal
                              size={14}
                              style={{ color: "var(--gray-9)", flexShrink: 0 }}
                            />
                            <Code size="2" variant="soft">
                              xcode-select --install
                            </Code>
                          </Flex>
                        </Flex>
                        <Flex align="center" gap="3">
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() =>
                              trpcClient.os.openExternal.mutate({
                                url: EXTERNAL_LINKS.gitInstall,
                              })
                            }
                          >
                            Other install methods
                            <ArrowSquareOut size={12} />
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() => void handleCheckGit()}
                            loading={isCheckingGit}
                          >
                            <ArrowsClockwise size={12} />
                            Check again
                          </Button>
                        </Flex>
                      </Flex>
                    )}
                  </Flex>
                </Box>
              </motion.div>

              {/* GitHub CLI box */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <Box
                  p="5"
                  style={{
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a3)",
                    borderRadius: 12,
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  <Flex direction="column" gap="3">
                    <Flex align="center" justify="between">
                      <Flex align="center" gap="2">
                        <GithubLogo
                          size={18}
                          style={{ color: "var(--gray-12)" }}
                        />
                        <Text
                          size="3"
                          weight="bold"
                          style={{ color: "var(--gray-12)" }}
                        >
                          GitHub CLI
                        </Text>
                      </Flex>
                      {isLoadingGh && (
                        <CircleNotch
                          size={14}
                          style={{
                            color: "var(--gray-9)",
                            animation: "spin 1s linear infinite",
                          }}
                        />
                      )}
                      {!isLoadingGh && ghInstalled && ghAuthenticated && (
                        <Flex align="center" gap="1">
                          <CheckCircle
                            size={14}
                            weight="fill"
                            style={{ color: "var(--green-9)" }}
                          />
                          <Text size="1" style={{ color: "var(--green-11)" }}>
                            {ghStatus?.username
                              ? `Logged in as ${ghStatus.username}`
                              : "Authenticated"}
                          </Text>
                        </Flex>
                      )}
                      {!isLoadingGh && ghInstalled && !ghAuthenticated && (
                        <Flex align="center" gap="1">
                          <Warning
                            size={14}
                            weight="fill"
                            style={{ color: "var(--amber-9)" }}
                          />
                          <Text size="1" style={{ color: "var(--amber-11)" }}>
                            Not logged in
                          </Text>
                        </Flex>
                      )}
                    </Flex>
                    {!isLoadingGh && !ghInstalled && (
                      <Flex direction="column" gap="3">
                        <Text size="2" style={{ color: "var(--gray-11)" }}>
                          Install with Homebrew:
                        </Text>
                        <Flex align="center" gap="2">
                          <Terminal
                            size={14}
                            style={{ color: "var(--gray-9)", flexShrink: 0 }}
                          />
                          <Code size="2" variant="soft">
                            brew install gh
                          </Code>
                        </Flex>
                        <Flex align="center" gap="3">
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() =>
                              trpcClient.os.openExternal.mutate({
                                url: EXTERNAL_LINKS.ghInstall,
                              })
                            }
                          >
                            Other install methods
                            <ArrowSquareOut size={12} />
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() => void handleCheckGh()}
                            loading={isCheckingGh}
                          >
                            <ArrowsClockwise size={12} />
                            Check again
                          </Button>
                        </Flex>
                      </Flex>
                    )}
                    {!isLoadingGh && ghInstalled && !ghAuthenticated && (
                      <Flex direction="column" gap="3">
                        <Text size="2" style={{ color: "var(--gray-11)" }}>
                          Run this in your terminal to log in:
                        </Text>
                        <Flex align="center" gap="2">
                          <Terminal
                            size={14}
                            style={{ color: "var(--gray-9)", flexShrink: 0 }}
                          />
                          <Code size="2" variant="soft">
                            gh auth login
                          </Code>
                        </Flex>
                        <Button
                          size="1"
                          variant="soft"
                          color="gray"
                          onClick={() => void handleCheckGh()}
                          loading={isCheckingGh}
                          style={{ alignSelf: "flex-start" }}
                        >
                          <ArrowsClockwise size={12} />
                          Check again
                        </Button>
                      </Flex>
                    )}
                  </Flex>
                </Box>
              </motion.div>
            </Flex>

            <OnboardingHogTip
              hogSrc={builderHog}
              message="Agents use these tools to manage branches and open pull requests."
              delay={0.15}
            />
          </Flex>
        </Flex>

        <StepActions>
          <Button size="3" variant="outline" color="gray" onClick={onBack}>
            <ArrowLeft size={16} weight="bold" />
            Back
          </Button>
          {allReady ? (
            <Button size="3" onClick={onNext}>
              Continue
              <ArrowRight size={16} weight="bold" />
            </Button>
          ) : (
            <Button size="3" variant="outline" color="gray" onClick={onNext}>
              Skip for now
              <ArrowRight size={16} weight="bold" />
            </Button>
          )}
        </StepActions>
      </Flex>
    </Flex>
  );
}
