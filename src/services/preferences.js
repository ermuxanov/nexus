import { DEFAULT_PREFERENCES, validatePreferences, preferenceFingerprint } from "../domain/preferences.js";
import { StorageError } from "./storage.js";

export const PREFERENCES_KEY = "nexus.preferences.v1";

export function createPreferencesStorage(getStorage = () => window.localStorage) {
  return {
    read() {
      let raw;
      try {
        raw = getStorage().getItem(PREFERENCES_KEY);
      } catch (cause) {
        throw new StorageError("Workspace preferences could not be read. Allow browser storage and try again.", cause);
      }
      if (raw === null) return { ...DEFAULT_PREFERENCES };
      try {
        const envelope = JSON.parse(raw);
        const validation = validatePreferences(envelope?.data);
        if (envelope?.version !== 1 || !validation.data) throw new Error("Invalid preferences");
        return validation.data;
      } catch (cause) {
        throw new StorageError(
          "Saved workspace preferences are invalid or unsupported. Existing preferences have been preserved.",
          cause,
        );
      }
    },
    write(input, expected) {
      const validation = validatePreferences(input);
      if (!validation.data) throw new Error("Review the highlighted settings.");
      if (preferenceFingerprint(this.read()) !== preferenceFingerprint(expected))
        throw new Error("Settings changed in another tab. Reload saved settings and review them before saving.");
      try {
        getStorage().setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, data: validation.data }));
      } catch (cause) {
        throw new StorageError(
          "Settings could not be saved. Your changes have been kept; allow browser storage and try again.",
          cause,
        );
      }
      return validation.data;
    },
  };
}
