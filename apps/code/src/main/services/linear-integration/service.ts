import { getCloudUrlFromRegion } from "@shared/constants/oauth.js";
import { shell } from "electron";
import { injectable } from "inversify";
import { logger } from "../../utils/logger.js";
import type { CloudRegion, StartLinearFlowOutput } from "./schemas.js";

const log = logger.scope("linear-integration-service");

@injectable()
export class LinearIntegrationService {
  public async startFlow(
    region: CloudRegion,
    projectId: number,
  ): Promise<StartLinearFlowOutput> {
    try {
      const cloudUrl = getCloudUrlFromRegion(region);
      const next = `${cloudUrl}/projects/${projectId}`;
      const authorizeUrl = `${cloudUrl}/api/environments/${projectId}/integrations/authorize/?kind=linear&next=${encodeURIComponent(next)}`;

      log.info("Opening Linear authorization URL in browser");
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
