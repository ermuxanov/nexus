import { reactive } from "vue";
import { DEFAULT_PREFERENCES } from "../domain/preferences.js";
import { createPreferencesStorage } from "../services/preferences.js";

export function createPreferencesStore(storage = createPreferencesStorage()) {
  const state = reactive({ data: { ...DEFAULT_PREFERENCES }, status: "idle", error: "" });
  return {
    state,
    load() {
      try {
        state.data = storage.read();
        state.status = "success";
        state.error = "";
        return true;
      } catch (error) {
        state.status = "error";
        state.error = error.message || "Workspace preferences could not be loaded.";
        return false;
      }
    },
    save(data) {
      try {
        state.data = storage.write(data, state.data);
        state.status = "success";
        state.error = "";
        return true;
      } catch (error) {
        state.error = error.message || "Settings could not be saved. Your changes have been kept.";
        return false;
      }
    },
  };
}

export const preferencesStore = createPreferencesStore();
