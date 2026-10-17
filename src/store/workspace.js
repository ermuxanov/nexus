import { reactive } from "vue";
import { api } from "../services/api.js";
import { createLatestRequest } from "./latestRequest.js";

export function createWorkspaceStore(service = api) {
  const state = reactive({ status: "idle", summary: null, error: "" });
  const requests = createLatestRequest();
  return {
    state,
    async load() {
      const token = requests.begin();
      state.status = "loading";
      state.error = "";
      try {
        const summary = await service.getWorkspaceSummary();
        if (!requests.isCurrent(token)) return;
        state.summary = summary;
        state.status = "success";
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.status = "error";
        state.error = error.message || "Unable to load workspace data.";
      }
    },
  };
}
export const workspaceStore = createWorkspaceStore();
