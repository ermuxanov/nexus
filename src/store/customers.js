import { reactive } from "vue";
import { api } from "../services/api.js";
import { validateDatabase } from "../domain/integrity.js";
import { createLatestRequest } from "./latestRequest.js";
import { customerMetrics } from "../domain/customers.js";

export function createCustomersStore(service = api) {
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
        const data = await service.getCustomersSnapshot();
        if (!requests.isCurrent(token)) return;
        validateDatabase(data);
        customerMetrics(data.orders);
        state.data = data;
        state.status = "success";
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.error = error.message || "Customers could not be loaded.";
        state.status = state.data ? "success" : "error";
      } finally {
        if (requests.isCurrent(token)) state.refreshing = false;
      }
    },
  };
}

export function createCustomerSession(service = api) {
  const state = reactive({ status: "idle", data: null, error: "", busy: false, mutationError: "", fieldErrors: {} });
  const requests = createLatestRequest();
  async function mutate(operation) {
    if (state.busy) return null;
    state.busy = true;
    state.mutationError = "";
    state.fieldErrors = {};
    try {
      return await operation();
    } catch (error) {
      state.mutationError = error.message || "The customer could not be saved. Your input has been kept.";
      state.fieldErrors = error.errors || {};
      return null;
    } finally {
      state.busy = false;
    }
  }
  return {
    state,
    cancel() {
      requests.begin();
    },
    async load(id) {
      if (state.busy) return;
      const token = requests.begin();
      state.status = "loading";
      state.data = null;
      state.error = "";
      state.mutationError = "";
      try {
        const data = await service.getCustomerSnapshot(id);
        if (!requests.isCurrent(token)) return;
        if (data === null) {
          state.status = "missing";
          return;
        }
        if (!data?.customer || !Array.isArray(data.orders) || data.customer.id !== id)
          throw new Error("Invalid customer details.");
        validateDatabase({ customers: [data.customer], orders: data.orders });
        customerMetrics(data.orders);
        state.data = data;
        state.status = "success";
      } catch (error) {
        if (!requests.isCurrent(token)) return;
        state.error = error.message || "Customer details could not be loaded.";
        state.status = "error";
      }
    },
    save(payload, original = null) {
      if (original && (state.status !== "success" || original.id !== state.data?.customer.id))
        return Promise.resolve(null);
      return mutate(() =>
        original ? service.updateCustomer(original.id, payload, original) : service.createCustomer(payload),
      );
    },
    remove() {
      if (state.status !== "success" || !state.data || state.data.orders.length) return Promise.resolve(null);
      return mutate(() => service.deleteCustomer(state.data.customer.id, state.data.customer));
    },
  };
}
