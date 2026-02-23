import { Box, Button, Flex, Heading, Text, TextField } from "@radix-ui/themes";
import { useState } from "react";
import { PostHogWebClient } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";

export function LoginForm() {
  const { apiHost: storedHost, setCredentials } = useAuthStore();
  const [apiHost, setApiHost] = useState(storedHost);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const client = new PostHogWebClient(token, apiHost);
      await client.getCurrentUser();
      setCredentials(apiHost, token);
    } catch {
      setError("Invalid credentials. Please check your API host and token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex
      align="center"
      justify="center"
      style={{ height: "100vh", backgroundColor: "var(--gray-1)" }}
    >
      <Box
        className="w-full max-w-md rounded-xl border border-gray-4 p-8"
        style={{ backgroundColor: "var(--gray-2)" }}
      >
        <Flex direction="column" gap="5">
          <Flex direction="column" gap="1" align="center">
            <Heading size="5" weight="bold">
              Twig Cloud Agents
            </Heading>
            <Text size="2" color="gray">
              Connect to your PostHog instance
            </Text>
          </Flex>

          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="4">
              <Flex direction="column" gap="1">
                <Text size="1" weight="medium" color="gray">
                  API Host
                </Text>
                <TextField.Root
                  value={apiHost}
                  onChange={(e) => setApiHost(e.target.value)}
                  placeholder="https://us.posthog.com"
                />
              </Flex>

              <Flex direction="column" gap="1">
                <Text size="1" weight="medium" color="gray">
                  Personal API Key
                </Text>
                <TextField.Root
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="phx_..."
                />
              </Flex>

              {error && (
                <Text size="1" color="red">
                  {error}
                </Text>
              )}

              <Button type="submit" disabled={loading || !token}>
                {loading ? "Connecting..." : "Connect"}
              </Button>
            </Flex>
          </form>
        </Flex>
      </Box>
    </Flex>
  );
}
