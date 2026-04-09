import { trpcClient } from "@renderer/trpc";

export async function getGhUserTokenOrThrow(): Promise<string> {
  const tokenResult = await trpcClient.git.getGhAuthToken.query();
  if (!tokenResult.success || !tokenResult.token) {
    throw new Error(
      tokenResult.error ||
        "Authenticate GitHub CLI with `gh auth login` before starting a cloud task.",
    );
  }
  return tokenResult.token;
}
