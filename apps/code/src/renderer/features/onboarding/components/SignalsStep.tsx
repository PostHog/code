import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowLeft,
  ArrowRight,
  GithubLogo,
  KanbanIcon,
  TicketIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Flex,
  Separator,
  Spinner,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import detectiveHog from "@renderer/assets/images/hedgehogs/detective-hog.png";
import { trpcClient } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useProjectsWithIntegrations } from "../hooks/useProjectsWithIntegrations";
import { OnboardingHogTip } from "./OnboardingHogTip";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;

interface SignalsStepProps {
  onNext: () => void;
  onBack: () => void;
}

function IntegrationCard({ children }: { children: React.ReactNode }) {
  return (
    <Box
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-a3)",
        borderRadius: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
}

interface GitHubIssuesCardProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresSetup?: boolean;
  loading?: boolean;
  hasGitIntegration: boolean;
  onSetupComplete: () => void;
}

function GitHubIssuesCard({
  checked,
  onCheckedChange,
  disabled,
  requiresSetup,
  loading,
  hasGitIntegration,
  onSetupComplete,
}: GitHubIssuesCardProps) {
  const projectId = useAuthStateValue((s) => s.projectId);
  const client = useOptionalAuthenticatedClient();
  const { repositories, isLoadingRepos } = useRepositoryIntegration();
  const [expanded, setExpanded] = useState(false);
  const [repo, setRepo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (repo === null && repositories.length > 0) {
      setRepo(repositories[0]);
    }
  }, [repo, repositories]);

  const handleSubmit = useCallback(async () => {
    if (!projectId || !client || !repo) return;
    setSubmitting(true);
    try {
      await client.createExternalDataSource(projectId, {
        source_type: "Github",
        payload: {
          repository: repo,
          schemas: [
            {
              name: "issues",
              should_sync: true,
              sync_type: "full_refresh" as const,
            },
          ],
        },
      });
      toast.success("GitHub Issues source created");
      setExpanded(false);
      onSetupComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, client, repo, onSetupComplete]);

  const isUnavailable = !hasGitIntegration;

  return (
    <IntegrationCard>
      <Flex
        align="center"
        justify="between"
        gap="4"
        px="4"
        py="4"
        style={{
          cursor: isUnavailable || disabled || loading ? "default" : "pointer",
          opacity: isUnavailable ? 0.5 : 1,
        }}
        onClick={
          isUnavailable || disabled || loading
            ? undefined
            : requiresSetup
              ? () => setExpanded(!expanded)
              : () => onCheckedChange(!checked)
        }
      >
        <Flex align="start" gap="3">
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "var(--gray-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--gray-11)",
            }}
          >
            <GithubLogo size={18} />
          </Box>
          <Flex direction="column" gap="1">
            <Text size="2" weight="bold" style={{ color: "var(--gray-12)" }}>
              GitHub Issues
            </Text>
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              {isUnavailable
                ? "Connect GitHub first to enable this source."
                : "Surface action items from your GitHub issues."}
            </Text>
          </Flex>
        </Flex>

        {isUnavailable ? null : loading ? (
          <Spinner size="2" style={{ flexShrink: 0 }} />
        ) : requiresSetup ? (
          <Button
            size="1"
            variant="soft"
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            Choose repos
          </Button>
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            style={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Flex>

      <AnimatePresence>
        {expanded && !isUnavailable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <Separator size="4" />
            <Flex direction="column" gap="3" px="4" py="3">
              <GitHubRepoPicker
                value={repo}
                onChange={setRepo}
                repositories={repositories}
                isLoading={isLoadingRepos}
                placeholder="Select repository..."
                size="2"
              />
              <Flex gap="2" justify="end">
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setExpanded(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="1"
                  onClick={() => void handleSubmit()}
                  disabled={!repo || submitting}
                >
                  {submitting ? "Creating..." : "Create source"}
                </Button>
              </Flex>
            </Flex>
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationCard>
  );
}

interface ZendeskCardProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresSetup?: boolean;
  loading?: boolean;
  onSetupComplete: () => void;
}

function ZendeskCard({
  checked,
  onCheckedChange,
  disabled,
  requiresSetup,
  loading,
  onSetupComplete,
}: ZendeskCardProps) {
  const projectId = useAuthStateValue((s) => s.projectId);
  const client = useOptionalAuthenticatedClient();
  const [expanded, setExpanded] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = subdomain.trim() && apiKey.trim() && email.trim();

  const handleSubmit = useCallback(async () => {
    if (!projectId || !client || !canSubmit) return;
    setSubmitting(true);
    try {
      await client.createExternalDataSource(projectId, {
        source_type: "Zendesk",
        payload: {
          subdomain: subdomain.trim(),
          api_key: apiKey.trim(),
          email_address: email.trim(),
          schemas: [
            {
              name: "tickets",
              should_sync: true,
              sync_type: "full_refresh" as const,
            },
          ],
        },
      });
      toast.success("Zendesk source created");
      setExpanded(false);
      onSetupComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, client, subdomain, apiKey, email, canSubmit, onSetupComplete]);

  return (
    <IntegrationCard>
      <Flex
        align="center"
        justify="between"
        gap="4"
        px="4"
        py="4"
        style={{
          cursor: disabled || loading ? "default" : "pointer",
        }}
        onClick={
          disabled || loading
            ? undefined
            : requiresSetup
              ? () => setExpanded(!expanded)
              : () => onCheckedChange(!checked)
        }
      >
        <Flex align="start" gap="3">
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "var(--gray-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--gray-11)",
            }}
          >
            <TicketIcon size={18} />
          </Box>
          <Flex direction="column" gap="1">
            <Text size="2" weight="bold" style={{ color: "var(--gray-12)" }}>
              Zendesk
            </Text>
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              Surface action items from your support tickets.
            </Text>
          </Flex>
        </Flex>

        {loading ? (
          <Spinner size="2" style={{ flexShrink: 0 }} />
        ) : requiresSetup ? (
          <Button
            size="1"
            variant="soft"
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            Connect
          </Button>
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            style={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Flex>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <Separator size="4" />
            <Flex direction="column" gap="3" px="4" py="3">
              <TextField.Root
                placeholder="Subdomain (e.g. mycompany)"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                size="2"
                onClick={(e) => e.stopPropagation()}
              />
              <TextField.Root
                placeholder="API key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                size="2"
                onClick={(e) => e.stopPropagation()}
              />
              <TextField.Root
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="2"
                onClick={(e) => e.stopPropagation()}
              />
              <Flex gap="2" justify="end">
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => setExpanded(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="1"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? "Creating..." : "Create source"}
                </Button>
              </Flex>
            </Flex>
          </motion.div>
        )}
      </AnimatePresence>
    </IntegrationCard>
  );
}

interface ExternalSourceCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresSetup?: boolean;
  onSetup?: () => void;
  loading?: boolean;
  isPolling?: boolean;
}

function ExternalSourceCard({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  requiresSetup,
  onSetup,
  loading,
  isPolling,
}: ExternalSourceCardProps) {
  return (
    <IntegrationCard>
      <Flex
        align="center"
        justify="between"
        gap="4"
        px="4"
        py="4"
        style={{
          cursor: disabled || loading ? "default" : "pointer",
        }}
        onClick={
          disabled || loading
            ? undefined
            : requiresSetup || isPolling
              ? onSetup
              : () => onCheckedChange(!checked)
        }
      >
        <Flex align="start" gap="3">
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "var(--gray-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--gray-11)",
            }}
          >
            {icon}
          </Box>
          <Flex direction="column" gap="1">
            <Text size="2" weight="bold" style={{ color: "var(--gray-12)" }}>
              {label}
            </Text>
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              {description}
            </Text>
          </Flex>
        </Flex>

        {loading ? (
          <Spinner size="2" style={{ flexShrink: 0 }} />
        ) : requiresSetup || isPolling ? (
          <Button
            size="1"
            variant="soft"
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              onSetup?.();
            }}
          >
            {isPolling ? "Retry" : "Connect"}
          </Button>
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            style={{ flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Flex>
    </IntegrationCard>
  );
}

export function SignalsStep({ onNext, onBack }: SignalsStepProps) {
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);
  const currentProjectId = useAuthStateValue((s) => s.projectId);
  const client = useOptionalAuthenticatedClient();
  const queryClient = useQueryClient();
  const { projects } = useProjectsWithIntegrations();

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId),
    [projects, currentProjectId],
  );

  const hasGitIntegration = selectedProject?.hasGithubIntegration ?? false;

  const {
    displayValues,
    sourceStates,
    isLoading: signalsLoading,
    handleToggle,
    handleSetupComplete,
  } = useSignalSourceManager();
  const autoEnabledRef = useRef(false);
  useEffect(() => {
    if (signalsLoading || autoEnabledRef.current) return;
    autoEnabledRef.current = true;
    if (!displayValues.session_replay) {
      void handleToggle("session_replay", true);
    }
  }, [signalsLoading, displayValues, handleToggle]);

  const linearPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const linearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnectingLinear, setIsConnectingLinear] = useState(false);

  const stopLinearPolling = useCallback(() => {
    if (linearPollRef.current) {
      clearInterval(linearPollRef.current);
      linearPollRef.current = null;
    }
    if (linearTimeoutRef.current) {
      clearTimeout(linearTimeoutRef.current);
      linearTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopLinearPolling, [stopLinearPolling]);

  const handleConnectLinear = useCallback(async () => {
    const pid = currentProjectId;
    if (!cloudRegion || !pid || !client) return;
    stopLinearPolling();
    setIsConnectingLinear(true);
    try {
      await trpcClient.linearIntegration.startFlow.mutate({
        region: cloudRegion,
        projectId: pid,
      });

      linearPollRef.current = setInterval(async () => {
        try {
          const integrations = await client.getIntegrationsForProject(pid);
          const hasLinear = integrations.some(
            (i: { kind: string }) => i.kind === "linear",
          );
          if (hasLinear) {
            stopLinearPolling();
            await client.createExternalDataSource(pid, {
              source_type: "Linear",
              payload: {
                schemas: [
                  {
                    name: "issues",
                    should_sync: true,
                    sync_type: "full_refresh" as const,
                  },
                ],
              },
            });
            await queryClient.invalidateQueries({
              queryKey: ["external-data-sources"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["signals", "source-configs"],
            });
            toast.success("Linear connected");
            setIsConnectingLinear(false);
          }
        } catch {
          // Ignore individual poll failures
        }
      }, POLL_INTERVAL_MS);

      linearTimeoutRef.current = setTimeout(() => {
        stopLinearPolling();
        setIsConnectingLinear(false);
      }, POLL_TIMEOUT_MS);
    } catch {
      setIsConnectingLinear(false);
      toast.error("Failed to connect Linear");
    }
  }, [cloudRegion, currentProjectId, client, stopLinearPolling, queryClient]);

  const handleInlineSetupComplete = useCallback(() => {
    void handleSetupComplete();
  }, [handleSetupComplete]);

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
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            width: "100%",
            scrollbarWidth: "none",
          }}
        >
          <Flex
            direction="column"
            gap="5"
            style={{
              width: "100%",
              maxWidth: 560,
              margin: "auto auto",
              padding: "16px 0",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Text
                size="6"
                style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
              >
                Teach your agent what matters
              </Text>
            </motion.div>

            <Flex direction="column" gap="2">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                <GitHubIssuesCard
                  checked={displayValues.github}
                  onCheckedChange={(checked) =>
                    void handleToggle("github", checked)
                  }
                  disabled={signalsLoading}
                  requiresSetup={sourceStates?.github?.requiresSetup}
                  loading={sourceStates?.github?.loading}
                  hasGitIntegration={hasGitIntegration}
                  onSetupComplete={handleInlineSetupComplete}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <ExternalSourceCard
                  icon={<KanbanIcon size={18} />}
                  label="Linear"
                  description="Surface action items from your Linear issues."
                  checked={displayValues.linear}
                  onCheckedChange={(checked) =>
                    void handleToggle("linear", checked)
                  }
                  disabled={signalsLoading}
                  requiresSetup={sourceStates?.linear?.requiresSetup}
                  onSetup={() => void handleConnectLinear()}
                  loading={sourceStates?.linear?.loading}
                  isPolling={isConnectingLinear}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                <ZendeskCard
                  checked={displayValues.zendesk}
                  onCheckedChange={(checked) =>
                    void handleToggle("zendesk", checked)
                  }
                  disabled={signalsLoading}
                  requiresSetup={sourceStates?.zendesk?.requiresSetup}
                  loading={sourceStates?.zendesk?.loading}
                  onSetupComplete={handleInlineSetupComplete}
                />
              </motion.div>
            </Flex>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <OnboardingHogTip
                hogSrc={detectiveHog}
                message="These help me find things worth working on beyond your PostHog data."
              />
            </motion.div>
          </Flex>
        </Flex>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.25 }}
        >
          <Flex gap="4" align="center" flexShrink="0">
            <Button size="3" variant="outline" color="gray" onClick={onBack}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button size="3" onClick={onNext}>
              Continue
              <ArrowRight size={16} />
            </Button>
          </Flex>
        </motion.div>
      </Flex>
    </Flex>
  );
}
