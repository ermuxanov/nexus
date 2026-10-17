import { reactive } from "vue";
import { api } from "../services/api.js";
import { validateDatabase } from "../domain/integrity.js";
import { createLatestRequest } from "./latestRequest.js";

export function createOrderDetails(service = api) {
  const state = reactive({ status: "idle", data: null, error: "", deleting: false, deleteError: "" });
  const requests = createLatestRequest();
  return {
    state,
    cancel() {
      requests.begin();
    },
    async load(id) {
      if (state.deleting) return;
      const token = requests.begin();
      state.status = "loading";
      state.data = null;
      state.error = "";
      state.deleteError = "";
      try {
        const data = await service.getOrderSnapshot(id);
        if (!requests.isCurrent(token)) return;
        if (data === null) {
          state.status = "missing";
          return;
        }
        if (!data?.order || !data.customer) throw new Error("Invalid order details.");
        validateDatabase({ customers: [data.customer], orders: [data.order] });
        if (data.order.id !== id) throw new Error("The returned order does not match the requested order.");
        state.data = data;
        state.status = "success";
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.error = error.message || "Order details could not be loaded.";
        state.status = "error";
      }
    },
    async remove() {
      if (state.deleting || state.status !== "success" || !state.data) return null;
      state.deleting = true;
      state.deleteError = "";
      try {
        return await service.deleteOrder(state.data.order.id, state.data.order);
      } catch (error) {
        state.deleteError = error.message || "The order could not be deleted. Try again.";
        return null;
      } finally {
        state.deleting = false;
      }
    },
  };
}
