import { Text } from "@components/text";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useAuthStore } from "@/features/auth";
import {
  createTask,
  getGithubRepositories,
  getIntegrations,
  type Integration,
  runTaskInCloud,
} from "@/features/tasks";
import { logger } from "@/lib/logger";
import { useThemeColors } from "@/lib/theme";

const log = logger.scope("task-create");

interface ConnectGitHubPromptProps {
  onConnected?: () => void;
}

function ConnectGitHubPrompt({ onConnected }: ConnectGitHubPromptProps) {
  const { cloudRegion, projectId, getCloudUrlFromRegion } = useAuthStore();
  const themeColors = useThemeColors();

  const handleConnectGitHub = async () => {
    if (!cloudRegion || !projectId) return;
    const baseUrl = getCloudUrlFromRegion(cloudRegion);
    const authorizeUrl = `${baseUrl}/api/environments/${projectId}/integrations/authorize/?kind=github`;

    // Open in-app browser - will auto-detect when user returns
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      "posthog://github/callback",
    );

    // When browser session ends, refresh integrations
    if (
      result.type === "dismiss" ||
      result.type === "cancel" ||
      result.type === "success"
    ) {
      onConnected?.();
    }
  };

  return (
    <View className="mb-4 rounded-lg border border-gray-6 p-4">
      <View className="mb-3 flex-row items-center">
        <Text className="mr-2 text-xl">🔗</Text>
        <Text className="font-semibold text-gray-12">
          Connect GitHub to continue
        </Text>
      </View>
      <Text className="mb-4 text-gray-11 text-sm">
        You need to connect your GitHub account before creating tasks. This
        allows PostHog to work on your repositories.
      </Text>
      <Pressable
        onPress={handleConnectGitHub}
        className="items-center rounded-lg py-3"
        style={{ backgroundColor: themeColors.accent[9] }}
      >
        <Text className="font-semibold text-accent-contrast">
          Connect GitHub
        </Text>
      </Pressable>
    </View>
  );
}

export default function NewTaskScreen() {
  const router = useRouter();
  const themeColors = useThemeColors();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(true);

  const filteredRepositories = useMemo(() => {
    const query = repoSearch.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter((repo) => repo.toLowerCase().includes(query));
  }, [repositories, repoSearch]);

  const loadIntegrations = useCallback(async () => {
    try {
      setLoadingRepos(true);
      const data = await getIntegrations();
      const githubIntegrations = data.filter((i) => i.kind === "github");
      setIntegrations(githubIntegrations);

      if (githubIntegrations.length > 0) {
        const allRepos: string[] = [];
        for (const integration of githubIntegrations) {
          const repos = await getGithubRepositories(integration.id);
          allRepos.push(...repos);
        }
        setRepositories(allRepos.sort());
      }
    } catch (error) {
      log.error("Failed to fetch integrations", error);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const handleCreateTask = useCallback(async () => {
    if (!prompt.trim() || !selectedRepo) return;

    setCreating(true);
    try {
      const githubIntegration = integrations.find((i) => i.kind === "github");

      const trimmedPrompt = prompt.trim();
      const task = await createTask({
        description: trimmedPrompt,
        title: trimmedPrompt.slice(0, 100),
        repository: selectedRepo,
        github_integration: githubIntegration?.id,
      });

      // Pass the prompt as pending_user_message so the cloud agent has
      // something to process on start — matches how the desktop launches
      // new cloud runs. Without this the sandbox starts idle and the UI
      // stays stuck on "Thinking...".
      await runTaskInCloud(task.id, {
        pendingUserMessage: trimmedPrompt,
      });

      // Navigate to task detail (replaces current modal)
      router.replace(`/task/${task.id}`);
    } catch (error) {
      log.error("Failed to create task", error);
    } finally {
      setCreating(false);
    }
  }, [prompt, selectedRepo, integrations, router]);

  const hasGithubIntegration = integrations.length > 0;
  const canSubmit = prompt.trim() && selectedRepo && !creating;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "New task",
          headerStyle: { backgroundColor: themeColors.background },
          headerTintColor: themeColors.gray[12],
          presentation: "modal",
        }}
      />
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          className="flex-1 px-3 pt-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Pressable onPress={Keyboard.dismiss} accessible={false}>
            {loadingRepos ? (
              <View className="mb-4 items-center rounded-lg border border-gray-6 p-4">
                <ActivityIndicator size="small" color={themeColors.accent[9]} />
                <Text className="mt-2 text-gray-11 text-sm">
                  Loading repositories...
                </Text>
              </View>
            ) : !hasGithubIntegration ? (
              <ConnectGitHubPrompt onConnected={loadIntegrations} />
            ) : (
              <>
                <Text className="mb-2 text-gray-9 text-xs">Repository</Text>
                <TextInput
                  className="mb-2 rounded-lg border border-gray-6 px-3 py-2 text-gray-12 text-sm"
                  placeholder="Search repositories"
                  placeholderTextColor={themeColors.gray[9]}
                  value={repoSearch}
                  onChangeText={setRepoSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                <ScrollView
                  className="mb-4 max-h-48 rounded-lg border border-gray-6"
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {filteredRepositories.length === 0 ? (
                    <View className="px-3 py-4">
                      <Text className="text-center text-gray-9 text-sm">
                        {repoSearch
                          ? `No repositories match "${repoSearch}"`
                          : "No repositories available"}
                      </Text>
                    </View>
                  ) : (
                    filteredRepositories.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setSelectedRepo(item)}
                        className={`border-gray-6 border-b px-3 py-3 ${
                          selectedRepo === item ? "bg-accent-3" : ""
                        }`}
                      >
                        <Text
                          className={`text-sm ${
                            selectedRepo === item
                              ? "text-accent-11"
                              : "text-gray-11"
                          }`}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>

                <Text className="mb-2 text-gray-9 text-xs">
                  Task description
                </Text>
                <TextInput
                  className="mb-4 min-h-[100px] rounded-lg border border-gray-6 px-3 py-3 font-mono text-gray-12 text-sm"
                  placeholder="What would you like the agent to do?"
                  placeholderTextColor={themeColors.gray[9]}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  textAlignVertical="top"
                />

                <Pressable
                  onPress={handleCreateTask}
                  disabled={!canSubmit}
                  className={`rounded-lg py-3 ${canSubmit ? "bg-accent-9" : "bg-gray-3"}`}
                >
                  {creating ? (
                    <ActivityIndicator
                      size="small"
                      color={themeColors.accent.contrast}
                    />
                  ) : (
                    <Text
                      className={`text-center font-medium ${
                        canSubmit ? "text-accent-contrast" : "text-gray-9"
                      }`}
                    >
                      Create task
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
