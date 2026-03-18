import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { shell } from "electron";
import { injectable } from "inversify";
import { logger } from "../../utils/logger";
import type { CloudRegion, StartGitHubFlowOutput } from "./schemas";

const log = logger.scope("github-integration-service");

@injectable()
export class GitHubIntegrationService {
  public async startFlow(
    region: CloudRegion,
    projectId: number,
  ): Promise<StartGitHubFlowOutput> {
    try {
      const cloudUrl = getCloudUrlFromRegion(region);
      const next = `${cloudUrl}/projects/${projectId}`;
      const authorizeUrl = `${cloudUrl}/api/environments/${projectId}/integrations/authorize/?kind=github&next=${encodeURIComponent(next)}`;

      log.info("Opening GitHub authorization URL in browser");
      await shell.openExternal(authorizeUrl);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
