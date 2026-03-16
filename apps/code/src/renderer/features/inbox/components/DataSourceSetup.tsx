import { useAuthStore } from "@features/auth/stores/authStore";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { Box, Button, Flex, Text, TextField } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type DataSourceType = "github" | "linear" | "zendesk";

const REQUIRED_SCHEMAS: Record<DataSourceType, string[]> = {
  github: ["issues"],
  linear: ["issues"],
  zendesk: ["tickets"],
};

function schemasPayload(source: DataSourceType) {
  return REQUIRED_SCHEMAS[source].map((name) => ({
    name,
    should_sync: true,
    sync_type: "full_refresh" as const,
  }));
}

interface DataSourceSetupProps {
  source: DataSourceType;
  onComplete: () => void;
  onCancel: () => void;
}

export function DataSourceSetup({
  source,
  onComplete,
  onCancel,
}: DataSourceSetupProps) {
  switch (source) {
    case "github":
      return <GitHubSetup onComplete={onComplete} onCancel={onCancel} />;
    case "linear":
      return <LinearSetup onComplete={onComplete} onCancel={onCancel} />;
    case "zendesk":
      return <ZendeskSetup onComplete={onComplete} onCancel={onCancel} />;
  }
}

interface SetupFormProps {
  onComplete: () => void;
  onCancel: () => void;
}

function GitHubSetup({ onComplete, onCancel }: SetupFormProps) {
  const projectId = useAuthStore((s) => s.projectId);
  const client = useAuthStore((s) => s.client);
  const { githubIntegration, repositories, isLoadingRepos } =
    useRepositoryIntegration();
  const [repo, setRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-select the first repo once loaded
  useEffect(() => {
    if (repo === null && repositories.length > 0) {
      setRepo(repositories[0]);
    }
  }, [repo, repositories]);

  const handleSubmit = useCallback(async () => {
    if (!projectId || !client || !repo) return;

    setLoading(true);
    try {
      await client.createExternalDataSource(projectId, {
        source_type: "Github",
        payload: { repository: repo, schemas: schemasPayload("github") },
      });
      toast.success("GitHub data source created");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, client, repo, onComplete]);

  if (!githubIntegration) {
    return (
      <SetupFormContainer title="Connect GitHub" onCancel={onCancel}>
        <Text size="2" style={{ color: "var(--gray-11)" }}>
          No GitHub integration found. Please connect GitHub during onboarding
          first.
        </Text>
      </SetupFormContainer>
    );
  }

  return (
    <SetupFormContainer title="Connect GitHub" onCancel={onCancel}>
      <Flex direction="column" gap="3">
        <GitHubRepoPicker
          value={repo}
          onChange={setRepo}
          repositories={repositories}
          isLoading={isLoadingRepos}
          placeholder="Select repository..."
          size="2"
        />

        <Flex gap="2" justify="end">
          <Button size="2" variant="soft" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="2" onClick={handleSubmit} disabled={!repo || loading}>
            {loading ? "Creating..." : "Create source"}
          </Button>
        </Flex>
      </Flex>
    </SetupFormContainer>
  );
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

function LinearSetup({ onComplete, onCancel }: SetupFormProps) {
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const projectId = useAuthStore((s) => s.projectId);
  const client = useAuthStore((s) => s.client);
  const [loading, setLoading] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleOAuthConnect = useCallback(async () => {
    if (!cloudRegion || !projectId || !client) return;
    setLoading(true);
    setPollError(null);
    try {
      await trpcClient.linearIntegration.startFlow.mutate({
        region: cloudRegion,
        projectId,
      });

      // Poll for the new Linear integration
      pollTimerRef.current = setInterval(async () => {
        try {
          const integrations =
            await client.getIntegrationsForProject(projectId);
          const hasLinear = integrations.some(
            (i: { kind: string }) => i.kind === "linear",
          );
          if (hasLinear) {
            stopPolling();
            setLoading(false);
            setOauthConnected(true);
            toast.success("Linear connected");
          }
        } catch {
          // Ignore individual poll failures
        }
      }, POLL_INTERVAL_MS);

      // Timeout after 5 minutes
      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        setLoading(false);
        setPollError("Connection timed out. Please try again.");
      }, POLL_TIMEOUT_MS);
    } catch (error) {
      setLoading(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to connect Linear",
      );
    }
  }, [cloudRegion, projectId, client, stopPolling]);

  const handleSubmit = useCallback(async () => {
    if (!projectId || !client) return;

    setLoading(true);
    try {
      await client.createExternalDataSource(projectId, {
        source_type: "Linear",
        payload: { schemas: schemasPayload("linear") },
      });
      toast.success("Linear data source created");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, client, onComplete]);

  return (
    <SetupFormContainer title="Connect Linear" onCancel={onCancel}>
      <Flex direction="column" gap="3">
        <Button
          size="2"
          variant="soft"
          onClick={handleOAuthConnect}
          disabled={loading || oauthConnected}
        >
          {oauthConnected
            ? "Linear connected"
            : loading
              ? "Waiting for authorization..."
              : "Connect Linear"}
        </Button>

        {pollError && (
          <Text size="2" style={{ color: "var(--red-11)" }}>
            {pollError}
          </Text>
        )}

        <Flex gap="2" justify="end">
          <Button
            size="2"
            onClick={handleSubmit}
            disabled={!oauthConnected || loading}
          >
            {loading ? "Creating..." : "Create source"}
          </Button>
        </Flex>
      </Flex>
    </SetupFormContainer>
  );
}

function ZendeskSetup({ onComplete, onCancel }: SetupFormProps) {
  const projectId = useAuthStore((s) => s.projectId);
  const client = useAuthStore((s) => s.client);
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!projectId || !client) return;
    if (!subdomain.trim() || !apiKey.trim() || !email.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      await client.createExternalDataSource(projectId, {
        source_type: "Zendesk",
        payload: {
          subdomain: subdomain.trim(),
          api_key: apiKey.trim(),
          email_address: email.trim(),
          schemas: schemasPayload("zendesk"),
        },
      });
      toast.success("Zendesk data source created");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, client, subdomain, apiKey, email, onComplete]);

  const canSubmit = subdomain.trim() && apiKey.trim() && email.trim();

  return (
    <SetupFormContainer title="Connect Zendesk" onCancel={onCancel}>
      <Flex direction="column" gap="3">
        <TextField.Root
          placeholder="Subdomain (e.g. mycompany)"
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
        />
        <TextField.Root
          placeholder="API key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <TextField.Root
          placeholder="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Flex gap="2" justify="end">
          <Button size="2" variant="soft" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="2"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
          >
            {loading ? "Creating..." : "Create source"}
          </Button>
        </Flex>
      </Flex>
    </SetupFormContainer>
  );
}

function SetupFormContainer({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-4)",
      }}
    >
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between">
          <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
            {title}
          </Text>
          <Button size="1" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </Flex>
        {children}
      </Flex>
    </Box>
  );
}
