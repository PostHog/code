import type { SagaLogger } from "@posthog/shared";
import { logger } from "@utils/logger";

/**
 * Adapts our scoped logger to the `SagaLogger` interface expected by sagas
 * from `@posthog/shared`.
 */
export function createSagaLogger(scope: string): SagaLogger {
  const log = logger.scope(scope);
  return {
    info: (message, data) => log.info(message, data),
    debug: (message, data) => log.debug(message, data),
    warn: (message, data) => log.warn(message, data),
    error: (message, data) => log.error(message, data),
  };
}
