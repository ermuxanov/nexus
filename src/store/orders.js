import { reactive } from "vue";
import { api } from "../services/api.js";
import { validateDatabase } from "../domain/integrity.js";
import { createLatestRequest } from "./latestRequest.js";

export function createOrdersStore(service = api) {
  const state = reactive({ status: "idle", data: null, error: "", refreshing: false });
  const requests = createLatestRequest();
  return {
    state,
    cancel() {
      requests.begin();
    },
    async load() {
      const token = requests.begin();
      state.refreshing = !!state.data;
      state.status = state.data ? "success" : "loading";
      state.error = "";
      try {
        const data = await service.getOrdersSnapshot();
        if (!requests.isCurrent(token)) return;
        validateDatabase(data);
        state.data = data;
        state.status = "success";
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.error = error.message || "Unable to load orders.";
        state.status = state.data ? "success" : "error";
      } finally {
        if (requests.isCurrent(token)) state.refreshing = false;
      }
    },
  };
}
