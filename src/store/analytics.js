import { reactive } from "vue";
import { api } from "../services/api.js";
import { buildAnalytics } from "../domain/analytics.js";
import { createLatestRequest } from "./latestRequest.js";

export function createAnalyticsStore(service = api, clock = () => new Date()) {
  const state = reactive({ status: "idle", result: null, error: "", refreshing: false });
  const requests = createLatestRequest();
  return {
    state,
    cancel() {
      requests.begin();
    },
    async load(days) {
      const token = requests.begin();
      const now = clock();
      const keepResult = state.result?.period.days === days;
      state.refreshing = keepResult;
      state.status = keepResult ? "success" : "loading";
      state.error = "";
      if (!keepResult) state.result = null;
      try {
        const data = await service.getAnalyticsSnapshot();
        if (!requests.isCurrent(token)) return;
        state.result = buildAnalytics(data, days, now);
        state.status = "success";
        state.refreshing = false;
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.status = keepResult ? "success" : "error";
        state.refreshing = false;
        state.error = error.message || "Unable to load analytics.";
      }
    },
  };
}
