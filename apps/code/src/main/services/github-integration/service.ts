import type { IUrlLauncher } from "@posthog/platform/url-launcher";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import type { CloudRegion, StartGitHubFlowOutput } from "./schemas";

const log = logger.scope("github-integration-service");

@injectable()
export class GitHubIntegrationService {
  constructor(
    @inject(MAIN_TOKENS.UrlLauncher) private readonly urlLauncher: IUrlLauncher,
  ) {}

  public async startFlow(
    region: CloudRegion,
    projectId: number,
  ): Promise<StartGitHubFlowOutput> {
    try {
      const cloudUrl = getCloudUrlFromRegion(region);
      const next = `${cloudUrl}/project/${projectId}`;
      const authorizeUrl = `${cloudUrl}/api/environments/${projectId}/integrations/authorize/?kind=github&next=${encodeURIComponent(next)}`;

      log.info("Opening GitHub authorization URL in browser");
      await this.urlLauncher.launch(authorizeUrl);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
