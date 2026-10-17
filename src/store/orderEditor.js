import { reactive } from "vue";
import { api } from "../services/api.js";

export function createOrderEditor(service = api) {
  const state = reactive({ saving: false, error: "" });
  return {
    state,
    async save(payload, original = null) {
      if (state.saving) return null;
      state.saving = true;
      state.error = "";
      try {
        return original
          ? await service.updateOrder(original.id, payload, original)
          : await service.createOrder(payload);
      } catch (error) {
        state.error = error.message || "Order could not be saved. Your input is preserved.";
        return null;
      } finally {
        state.saving = false;
      }
    },
  };
}
