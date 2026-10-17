import { createDatabaseStorage } from "./storage.js";
import { saveOrderRecord } from "../domain/orderEditor.js";
import { createWriteCoordinator } from "./writeCoordinator.js";
import { deleteOrderRecord } from "../domain/orderDeletion.js";
import { saveCustomerRecord } from "../domain/customers.js";

export function createMockApi(database, delayMs = 300, exclusive = (operation) => operation()) {
  async function read(selector) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return structuredClone(selector(database.read()));
  }
  function mutate(input, id = null, expected = null, remove = false) {
    // The versioned schema is JSON data; serialization also unwraps Vue reactive form/row proxies.
    const payload = JSON.parse(JSON.stringify(input));
    const baseline = expected ? JSON.parse(JSON.stringify(expected)) : null;
    return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
      exclusive((writeDatabase = database) => {
        // Latest read and validated write stay synchronous inside the cross-tab transaction.
        const next = remove
          ? deleteOrderRecord(writeDatabase.read(), id, baseline)
          : saveOrderRecord(writeDatabase.read(), payload, id, baseline);
        writeDatabase.write(next.data);
        return structuredClone(next.record);
      }),
    );
  }
  function mutateCustomer(input, id = null, expected = null, remove = false) {
    const payload = JSON.parse(JSON.stringify(input));
    const baseline = expected ? JSON.parse(JSON.stringify(expected)) : null;
    return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() =>
      exclusive((writeDatabase = database) => {
        const next = saveCustomerRecord(writeDatabase.read(), payload, id, baseline, remove);
        writeDatabase.write(next.data);
        return structuredClone(next.record);
      }),
    );
  }
  return {
    getWorkspaceSummary: () =>
      read((data) => ({ customerCount: data.customers.length, orderCount: data.orders.length })),
    getOrders: () => read((data) => data.orders),
    getOrdersSnapshot: () => read((data) => ({ orders: data.orders, customers: data.customers })),
    getOrderSnapshot: (id) =>
      read((data) => {
        const order = data.orders.find((record) => record.id === id);
        return order ? { order, customer: data.customers.find((customer) => customer.id === order.customerId) } : null;
      }),
    getCustomers: () => read((data) => data.customers),
    getCustomersSnapshot: () => read((data) => ({ customers: data.customers, orders: data.orders })),
    getCustomerSnapshot: (id) =>
      read((data) => {
        const customer = data.customers.find((record) => record.id === id);
        return customer ? { customer, orders: data.orders.filter((order) => order.customerId === id) } : null;
      }),
    createCustomer: (input) => mutateCustomer(input),
    updateCustomer: (id, input, expected) => mutateCustomer(input, id, expected),
    deleteCustomer: (id, expected) => mutateCustomer(null, id, expected, true),
    getAnalyticsSnapshot: () => read((data) => data),
    createOrder: (input) => mutate(input),
    updateOrder: (id, input, expected) => mutate(input, id, expected),
    deleteOrder: (id, expected) => mutate(null, id, expected, true),
  };
}

// Browser storage is acquired lazily: blocked access rejects through the API Promise.
const browserDatabase = {
  read: () => createDatabaseStorage(window.localStorage).read(),
  readSnapshot: () => createDatabaseStorage(window.localStorage).readSnapshot(),
  write: (data, revision, token) => createDatabaseStorage(window.localStorage).write(data, revision, token),
};
export const api = createMockApi(browserDatabase, 300, createWriteCoordinator(browserDatabase));
