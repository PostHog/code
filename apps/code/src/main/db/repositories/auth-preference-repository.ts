import { and, eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { authPreferences } from "../schema";
import type { DatabaseService } from "../service";

export type AuthPreference = typeof authPreferences.$inferSelect;
export type NewAuthPreference = typeof authPreferences.$inferInsert;

export interface PersistAuthPreferenceInput {
  accountKey: string;
  cloudRegion: "us" | "eu" | "dev";
  lastSelectedProjectId: number | null;
}

export interface IAuthPreferenceRepository {
  get(
    accountKey: string,
    cloudRegion: "us" | "eu" | "dev",
  ): AuthPreference | null;
  save(input: PersistAuthPreferenceInput): AuthPreference;
}

const now = () => new Date().toISOString();

@injectable()
export class AuthPreferenceRepository implements IAuthPreferenceRepository {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  get(
    accountKey: string,
    cloudRegion: "us" | "eu" | "dev",
  ): AuthPreference | null {
    return (
      this.db
        .select()
        .from(authPreferences)
        .where(
          and(
            eq(authPreferences.accountKey, accountKey),
            eq(authPreferences.cloudRegion, cloudRegion),
          ),
        )
        .limit(1)
        .get() ?? null
    );
  }

  save(input: PersistAuthPreferenceInput): AuthPreference {
    const timestamp = now();
    const existing = this.get(input.accountKey, input.cloudRegion);

    const row: NewAuthPreference = {
      accountKey: input.accountKey,
      cloudRegion: input.cloudRegion,
      lastSelectedProjectId: input.lastSelectedProjectId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    if (existing) {
      this.db
        .update(authPreferences)
        .set(row)
        .where(
          and(
            eq(authPreferences.accountKey, input.accountKey),
            eq(authPreferences.cloudRegion, input.cloudRegion),
          ),
        )
        .run();
    } else {
      this.db.insert(authPreferences).values(row).run();
    }

    const saved = this.get(input.accountKey, input.cloudRegion);
    if (!saved) {
      throw new Error("Failed to persist auth preference");
    }
    return saved;
  }
}
