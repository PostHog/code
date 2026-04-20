import type { IUrlLauncher } from "@posthog/platform/url-launcher";
import { getCloudUrlFromRegion } from "@shared/utils/urls.js";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../utils/logger.js";
import type { CloudRegion, StartLinearFlowOutput } from "./schemas.js";

const log = logger.scope("linear-integration-service");

@injectable()
export class LinearIntegrationService {
  constructor(
    @inject(MAIN_TOKENS.UrlLauncher)
    private readonly urlLauncher: IUrlLauncher,
  ) {}

  public async startFlow(
    region: CloudRegion,
    projectId: number,
  ): Promise<StartLinearFlowOutput> {
    try {
      const cloudUrl = getCloudUrlFromRegion(region);
      const next = `${cloudUrl}/project/${projectId}`;
      const authorizeUrl = `${cloudUrl}/api/environments/${projectId}/integrations/authorize/?kind=linear&next=${encodeURIComponent(next)}`;

      log.info("Opening Linear authorization URL in browser");
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
