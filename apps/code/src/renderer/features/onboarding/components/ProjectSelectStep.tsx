import { OAuthControls } from "@features/auth/components/OAuthControls";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Command } from "@features/command/components/Command";
import { useProjects } from "@features/projects/hooks/useProjects";
import {
  ArrowRight,
  CaretDown,
  Check,
  CheckCircle,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Popover, Skeleton, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { OnboardingHogTip } from "./OnboardingHogTip";

import "./ProjectSelect.css";

interface ProjectSelectStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ProjectSelectStep({ onNext }: ProjectSelectStepProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const selectProject = useAuthStore((s) => s.selectProject);
  const currentProjectId = useAuthStore((s) => s.projectId);
  const { projects, currentProject, currentUser, isLoading } = useProjects();
  const [open, setOpen] = useState(false);

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
          align="center"
          style={{ flex: 1, minHeight: 0, width: "100%" }}
        >
          <Flex
            direction="column"
            align="start"
            gap="6"
            style={{ width: "100%", maxWidth: 560 }}
          >
            {/* Section 1: Sign in */}
            <Flex direction="column" gap="4" style={{ width: "100%" }}>
              <Text
                size="6"
                style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
              >
                Pick your home base
              </Text>

              <AnimatePresence mode="wait">
                {isAuthenticated ? (
                  <motion.div
                    key="signed-in"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Flex
                      align="center"
                      gap="2"
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "var(--green-a2)",
                        border: "1px solid var(--green-a5)",
                        borderRadius: 8,
                      }}
                    >
                      <CheckCircle
                        size={18}
                        weight="fill"
                        style={{ color: "var(--green-9)" }}
                      />
                      <Text
                        size="2"
                        weight="medium"
                        style={{ color: "var(--green-11)" }}
                      >
                        Signed in
                        {currentUser?.email ? ` as ${currentUser.email}` : ""}
                      </Text>
                    </Flex>
                  </motion.div>
                ) : (
                  <motion.div
                    key="oauth"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <OAuthControls />
                  </motion.div>
                )}
              </AnimatePresence>
            </Flex>

            {/* Section 2: Project selector */}
            <motion.div
              style={{ width: "100%" }}
              animate={{ opacity: isAuthenticated ? 1 : 0.4 }}
              transition={{ duration: 0.3 }}
            >
              <Flex direction="column" gap="4" style={{ width: "100%" }}>
                <Text
                  size="4"
                  weight="medium"
                  style={{ color: "var(--gray-12)" }}
                >
                  Select your project
                </Text>

                {!isAuthenticated ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      all: "unset",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 14px",
                      backgroundColor: "var(--gray-3)",
                      border: "1px solid var(--gray-a3)",
                      borderRadius: 10,
                      fontSize: 14,
                      fontFamily: "inherit",
                      cursor: "not-allowed",
                    }}
                  >
                    <Text size="2" style={{ color: "var(--gray-8)" }}>
                      Sign in to see your projects
                    </Text>
                    <CaretDown
                      size={14}
                      style={{ color: "var(--gray-6)", flexShrink: 0 }}
                    />
                  </button>
                ) : isLoading ? (
                  <Skeleton
                    style={{ height: 40, borderRadius: 8, width: "100%" }}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    style={{ width: "100%" }}
                  >
                    <Popover.Root open={open} onOpenChange={setOpen}>
                      <Popover.Trigger>
                        <button
                          type="button"
                          style={{
                            all: "unset",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 14px",
                            backgroundColor: "var(--color-panel-solid)",
                            border: "1px solid var(--gray-a3)",
                            borderRadius: 10,
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                            cursor: "pointer",
                            fontSize: 14,
                            fontFamily: "inherit",
                          }}
                        >
                          <Flex direction="column" gap="1">
                            <Text
                              size="2"
                              weight="medium"
                              style={{ color: "var(--gray-12)" }}
                            >
                              {currentProject?.name ?? "Select a project..."}
                            </Text>
                            {currentProject && (
                              <Text
                                size="1"
                                style={{ color: "var(--gray-11)" }}
                              >
                                {currentProject.organization.name}
                              </Text>
                            )}
                          </Flex>
                          <CaretDown
                            size={14}
                            style={{ color: "var(--gray-9)", flexShrink: 0 }}
                          />
                        </button>
                      </Popover.Trigger>
                      <Popover.Content
                        className="project-select-popover"
                        style={{
                          padding: 0,
                          width: "var(--radix-popover-trigger-width)",
                        }}
                        side="bottom"
                        align="center"
                        sideOffset={4}
                        avoidCollisions={false}
                      >
                        <Command.Root
                          shouldFilter={true}
                          label="Project picker"
                        >
                          <Command.Input
                            placeholder="Search projects..."
                            autoFocus={true}
                          />
                          <Command.List>
                            <Command.Empty>No projects found.</Command.Empty>
                            {[...projects]
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((project) => (
                                <Command.Item
                                  key={project.id}
                                  value={`${project.name} ${project.id}`}
                                  onSelect={() => {
                                    selectProject(project.id);
                                    setOpen(false);
                                  }}
                                >
                                  <Flex
                                    align="center"
                                    justify="between"
                                    width="100%"
                                  >
                                    <Box>
                                      <Text size="2">{project.name}</Text>
                                    </Box>
                                    {project.id === currentProjectId && (
                                      <Check
                                        size={14}
                                        style={{ color: "var(--accent-11)" }}
                                      />
                                    )}
                                  </Flex>
                                </Command.Item>
                              ))}
                          </Command.List>
                        </Command.Root>
                      </Popover.Content>
                    </Popover.Root>
                  </motion.div>
                )}

                {isAuthenticated && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <OnboardingHogTip
                      hogSrc={explorerHog}
                      message="I'll use data from this project to help drive product decisions."
                    />
                  </motion.div>
                )}
              </Flex>
            </motion.div>
          </Flex>
        </Flex>

        {isAuthenticated && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <Flex gap="3" align="center" flexShrink="0">
              <Button
                size="3"
                onClick={onNext}
                disabled={currentProjectId == null}
              >
                Continue
                <ArrowRight size={16} />
              </Button>
            </Flex>
          </motion.div>
        )}
      </Flex>
    </Flex>
  );
}
