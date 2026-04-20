import type { ISecureStorage } from "@posthog/platform/secure-storage";
import { z } from "zod";
import { container } from "../../di/container";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { publicProcedure, router } from "../trpc";

const log = logger.scope("encryptionRouter");

const getSecureStorage = () =>
  container.get<ISecureStorage>(MAIN_TOKENS.SecureStorage);

export const encryptionRouter = router({
  /**
   * Encrypt a string
   */
  encrypt: publicProcedure
    .input(z.object({ stringToEncrypt: z.string() }))
    .query(async ({ input }) => {
      try {
        const secureStorage = getSecureStorage();
        if (secureStorage.isAvailable()) {
          const encrypted = await secureStorage.encryptString(
            input.stringToEncrypt,
          );
          return Buffer.from(encrypted).toString("base64");
        }
        return input.stringToEncrypt;
      } catch (error) {
        log.error("Failed to encrypt string:", error);
        return null;
      }
    }),

  /**
   * Decrypt a string
   */
  decrypt: publicProcedure
    .input(z.object({ stringToDecrypt: z.string() }))
    .query(async ({ input }) => {
      try {
        const secureStorage = getSecureStorage();
        if (secureStorage.isAvailable()) {
          const bytes = new Uint8Array(
            Buffer.from(input.stringToDecrypt, "base64"),
          );
          return await secureStorage.decryptString(bytes);
        }
        return input.stringToDecrypt;
      } catch (error) {
        log.error("Failed to decrypt string:", error);
        return null;
      }
    }),
});
