import { ProjectPicker } from "@features/scratchpads/components/ProjectPicker";
import { usePublishScratchpad } from "@features/scratchpads/hooks/usePublishScratchpad";
import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import type { PublishVisibility } from "@main/services/scratchpad/schemas";
import {
  Button,
  Dialog,
  Flex,
  RadioGroup,
  Text,
  TextField,
} from "@radix-ui/themes";
import { trpc, trpcClient } from "@renderer/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useEffect, useMemo, useState } from "react";

const log = logger.scope("publish-dialog");

const REPO_NAME_RE = /^[A-Za-z0-9._-]+$/;

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  /** Default repo name (typically the sanitized product name). */
  defaultRepoName: string;
  /** The current product name on the PostHog project (with `[UNPUBLISHED] ` prefix). */
  productName: string;
}

function sanitizeForRepo(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function PublishDialog({
  open,
  onOpenChange,
  taskId,
  defaultRepoName,
  productName,
}: PublishDialogProps) {
  const posthogClient = useAuthenticatedClient();
  const queryClient = useQueryClient();

  const [repoName, setRepoName] = useState(() =>
    sanitizeForRepo(defaultRepoName),
  );
  const [visibility, setVisibility] = useState<PublishVisibility>("private");
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offendingPaths, setOffendingPaths] = useState<string[] | null>(null);

  // Manifest tells us whether a PostHog project is already linked. If not,
  // we collect a link action (create / pick existing) here before publishing.
  const manifestQuery = useQuery(
    trpc.scratchpad.readManifest.queryOptions(
      { taskId },
      { enabled: open, staleTime: 0 },
    ),
  );
  const linkedProjectId = manifestQuery.data?.projectId ?? null;
  const needsProjectLink = manifestQuery.isSuccess && linkedProjectId === null;

  const [linkMode, setLinkMode] = useState<"create" | "existing">("create");
  const [linkProjectName, setLinkProjectName] = useState("");
  const [linkExistingProjectId, setLinkExistingProjectId] = useState<
    number | null
  >(null);

  // Reset form state on open.
  useEffect(() => {
    if (open) {
      setRepoName(sanitizeForRepo(defaultRepoName));
      setVisibility("private");
      setProgressLabel(null);
      setErrorMessage(null);
      setOffendingPaths(null);
      setLinkMode("create");
      setLinkProjectName(productName || defaultRepoName);
      setLinkExistingProjectId(null);
    }
  }, [open, defaultRepoName, productName]);

  // gh auth token check — disables submit when missing.
  const ghTokenQuery = useQuery(
    trpc.git.getGhAuthToken.queryOptions(undefined, {
      enabled: open,
      staleTime: 30_000,
    }),
  );
  const hasGhToken = ghTokenQuery.data?.success === true;

  const githubLoginQuery = useQuery({
    queryKey: ["github-login"],
    queryFn: () => posthogClient.getGithubLogin(),
    enabled: open,
    staleTime: 60_000,
  });
  const githubLogin = githubLoginQuery.data ?? null;

  const publish = usePublishScratchpad();

  const repoNameValid = useMemo(
    () =>
      repoName.length >= 1 &&
      repoName.length <= 100 &&
      REPO_NAME_RE.test(repoName),
    [repoName],
  );

  const isSubmitting = publish.isPending;
  const linkChoiceValid = needsProjectLink
    ? linkMode === "create"
      ? linkProjectName.trim().length > 0
      : linkExistingProjectId !== null
    : true;
  const submitDisabled =
    !hasGhToken ||
    !repoNameValid ||
    !linkChoiceValid ||
    isSubmitting ||
    offendingPaths !== null;

  const linkProjectIfNeeded = async (): Promise<{
    finalProductName: string;
  } | null> => {
    if (!needsProjectLink) return { finalProductName: productName };

    if (linkMode === "create") {
      setProgressLabel("Creating PostHog project");
      const user = await posthogClient.getCurrentUser();
      const organizationId = (user as { organization?: { id?: string } | null })
        .organization?.id;
      if (!organizationId) {
        throw new Error(
          "Cannot create a PostHog project: current user has no organization",
        );
      }
      const trimmedName = linkProjectName.trim();
      const created = await posthogClient.createProject({
        name: trimmedName,
        organizationId,
      });
      if (typeof created.id !== "number") {
        throw new Error("createProject did not return a numeric project id");
      }
      await trpcClient.scratchpad.writeManifest.mutate({
        taskId,
        patch: { projectId: created.id },
      });
      return { finalProductName: trimmedName };
    }

    // existing
    if (linkExistingProjectId === null) {
      throw new Error("Pick an existing project to publish to");
    }
    const project = await posthogClient
      .getProject(linkExistingProjectId)
      .catch(() => null);
    if (!project) {
      throw new Error("Selected PostHog project is not accessible");
    }
    await trpcClient.scratchpad.writeManifest.mutate({
      taskId,
      patch: { projectId: linkExistingProjectId },
    });
    return { finalProductName: project.name ?? "" };
  };

  const handleSubmit = async () => {
    if (submitDisabled) return;
    setErrorMessage(null);
    setOffendingPaths(null);
    setProgressLabel(
      needsProjectLink ? "Linking PostHog project" : "Initializing git",
    );
    try {
      const linkResult = await linkProjectIfNeeded();
      if (!linkResult) return;

      // Refresh the manifest cache so downstream queries see the new projectId.
      await queryClient.invalidateQueries(
        trpc.scratchpad.readManifest.queryFilter({ taskId }),
      );

      setProgressLabel("Initializing git");
      const outcome = await publish.mutateAsync({
        taskId,
        repoName,
        visibility,
        productName: linkResult.finalProductName,
      });

      if (
        outcome.kind === "project_inaccessible" ||
        outcome.kind === "no_project_linked"
      ) {
        setErrorMessage(outcome.message);
        setProgressLabel(null);
        return;
      }
      if (outcome.kind === "failure") {
        const r = outcome.result;
        if (r.code === "secret_leakage") {
          setOffendingPaths(r.paths ?? []);
          setErrorMessage(r.message);
        } else {
          setErrorMessage(r.message);
        }
        setProgressLabel(null);
        return;
      }
      // success
      setProgressLabel("Done");
      toast.success("Published to GitHub", {
        description: outcome.result.repoFullName,
      });
      onOpenChange(false);
    } catch (err) {
      log.error("Publish flow threw", { err });
      setErrorMessage(err instanceof Error ? err.message : "Failed to publish");
      setProgressLabel(null);
    }
  };

  const handleRecheck = () => {
    setOffendingPaths(null);
    setErrorMessage(null);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Content maxWidth="520px" size="2">
        <Flex direction="column" gap="3">
          <Dialog.Title size="3" className="m-0">
            Publish to GitHub
          </Dialog.Title>

          {needsProjectLink && (
            <Flex direction="column" gap="2">
              <Text color="gray" className="text-[13px]">
                PostHog project
              </Text>
              <Text className="text-[13px]">
                This scratchpad isn't linked to a PostHog project yet. Pick one
                now so analytics, replay, and error tracking work in production.
              </Text>
              <RadioGroup.Root
                value={linkMode}
                onValueChange={(v) => setLinkMode(v as "create" | "existing")}
                size="2"
                disabled={isSubmitting}
              >
                <Flex direction="column" gap="2">
                  <Text as="label" className="text-[13px]">
                    <Flex gap="2" align="center">
                      <RadioGroup.Item value="create" />
                      Create a new project
                    </Flex>
                  </Text>
                  <Text as="label" className="text-[13px]">
                    <Flex gap="2" align="center">
                      <RadioGroup.Item value="existing" />
                      Use an existing project
                    </Flex>
                  </Text>
                </Flex>
              </RadioGroup.Root>

              {linkMode === "create" && (
                <TextField.Root
                  value={linkProjectName}
                  onChange={(e) => setLinkProjectName(e.target.value)}
                  placeholder="Project name"
                  size="2"
                  disabled={isSubmitting}
                />
              )}
              {linkMode === "existing" && (
                <ProjectPicker
                  value={linkExistingProjectId}
                  onChange={setLinkExistingProjectId}
                  disabled={isSubmitting}
                />
              )}
            </Flex>
          )}

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              Repository name
            </Text>
            <TextField.Root
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-product"
              size="2"
              disabled={isSubmitting}
              autoFocus
            />
            {!repoNameValid && repoName.length > 0 && (
              <Text color="red" className="text-[12px]">
                Use letters, numbers, dots, dashes, and underscores only (1-100
                chars).
              </Text>
            )}
          </Flex>

          <Flex direction="column" gap="2">
            <Text color="gray" className="text-[13px]">
              Visibility
            </Text>
            <RadioGroup.Root
              value={visibility}
              onValueChange={(v) => setVisibility(v as PublishVisibility)}
              size="2"
              disabled={isSubmitting}
            >
              <Flex direction="column" gap="2">
                <Text as="label" className="text-[13px]">
                  <Flex gap="2" align="center">
                    <RadioGroup.Item value="private" />
                    Private
                  </Flex>
                </Text>
                <Text as="label" className="text-[13px]">
                  <Flex gap="2" align="center">
                    <RadioGroup.Item value="public" />
                    Public
                  </Flex>
                </Text>
              </Flex>
            </RadioGroup.Root>
          </Flex>

          <Text color="gray" className="text-[13px]">
            This will create a {visibility} repo on{" "}
            <Text className="font-medium">
              github.com/{githubLogin ?? "your account"}
            </Text>{" "}
            and push the contents of this scratchpad.
          </Text>

          {!hasGhToken && (
            <Text
              color="amber"
              className="rounded-(--radius-2) border border-(--amber-5) bg-(--amber-2) px-3 py-2 text-[13px]"
              role="status"
            >
              Sign in to GitHub via the <code>gh</code> CLI to publish.
            </Text>
          )}

          {offendingPaths !== null && (
            <Flex
              direction="column"
              gap="2"
              className="rounded-(--radius-2) border border-(--red-5) bg-(--red-2) px-3 py-2"
            >
              <Text color="red" className="font-medium text-[13px]">
                Refusing to publish — these files look like secrets or are too
                large:
              </Text>
              <Flex direction="column" gap="1">
                {offendingPaths.slice(0, 10).map((p) => (
                  <Text key={p} className="font-mono text-[12px]">
                    {p}
                  </Text>
                ))}
                {offendingPaths.length > 10 && (
                  <Text color="gray" className="text-[12px]">
                    ... and {offendingPaths.length - 10} more
                  </Text>
                )}
              </Flex>
              <Flex>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={handleRecheck}
                >
                  Re-check
                </Button>
              </Flex>
            </Flex>
          )}

          {errorMessage && offendingPaths === null && (
            <Text
              color="red"
              className="rounded-(--radius-2) border border-(--red-5) bg-(--red-2) px-3 py-2 text-[13px]"
              role="alert"
            >
              {errorMessage}
            </Text>
          )}

          {progressLabel && (
            <Text color="gray" className="text-[13px]" role="status">
              {progressLabel}...
            </Text>
          )}

          <Flex gap="2" justify="end">
            <Button
              size="2"
              variant="soft"
              color="gray"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="2"
              onClick={handleSubmit}
              disabled={submitDisabled}
              loading={isSubmitting}
            >
              Publish
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
