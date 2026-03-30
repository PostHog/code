import type {
  AuthPreference,
  IAuthPreferenceRepository,
  PersistAuthPreferenceInput,
} from "./auth-preference-repository";

export interface MockAuthPreferenceRepository
  extends IAuthPreferenceRepository {
  _preferences: AuthPreference[];
}

export function createMockAuthPreferenceRepository(): MockAuthPreferenceRepository {
  let preferences: AuthPreference[] = [];

  const clone = (value: AuthPreference): AuthPreference => ({ ...value });

  return {
    get _preferences() {
      return preferences.map(clone);
    },
    set _preferences(value) {
      preferences = value.map(clone);
    },
    get: (accountKey, cloudRegion) => {
      const preference = preferences.find(
        (entry) =>
          entry.accountKey === accountKey && entry.cloudRegion === cloudRegion,
      );
      return preference ? clone(preference) : null;
    },
    save: (input: PersistAuthPreferenceInput) => {
      const timestamp = new Date().toISOString();
      const existingIndex = preferences.findIndex(
        (entry) =>
          entry.accountKey === input.accountKey &&
          entry.cloudRegion === input.cloudRegion,
      );

      const row: AuthPreference = {
        accountKey: input.accountKey,
        cloudRegion: input.cloudRegion,
        lastSelectedProjectId: input.lastSelectedProjectId,
        createdAt:
          existingIndex >= 0 ? preferences[existingIndex].createdAt : timestamp,
        updatedAt: timestamp,
      };

      if (existingIndex >= 0) {
        preferences[existingIndex] = row;
      } else {
        preferences.push(row);
      }

      return clone(row);
    },
  };
}
