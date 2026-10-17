import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";
import { createSeed } from "../src/services/seed.js";
import { createDatabaseStorage, DATABASE_KEY } from "../src/services/storage.js";
import { createMockApi } from "../src/services/api.js";
import { validateDatabase } from "../src/domain/integrity.js";
import {
  customerDraft,
  validateCustomerDraft,
  saveCustomerRecord,
  queryCustomers,
  customerMetrics,
} from "../src/domain/customers.js";
import { createCustomersStore, createCustomerSession } from "../src/store/customers.js";

const seed = () => createSeed(new Date("2026-10-17T12:00:00Z"));
const draft = { name: "Alex Morgan", email: "alex@example.com", company: "Morgan Studio" };
function fixture() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const database = createDatabaseStorage(storage, seed);
  database.read();
  return { database, storage, service: createMockApi(database, 0) };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("customer validation trims fields and rejects blank, malformed and oversized values", () => {
  assert.deepEqual(customerDraft(), { name: "", email: "", company: "" });
  assert.deepEqual(
    validateCustomerDraft({ name: " Alex Morgan ", email: " alex@example.com ", company: " Morgan Studio " }).payload,
    draft,
  );
  for (const invalid of [
    {},
    { ...draft, name: " " },
    { ...draft, company: " " },
    { ...draft, email: "bad" },
    { ...draft, name: "x".repeat(121) },
    { ...draft, company: "x".repeat(161) },
  ]) {
    assert.equal(validateCustomerDraft(invalid).payload, null);
  }
});

test("customer writes are immutable, preserve order data, enforce unique emails and original fingerprints", () => {
  const data = seed();
  const before = JSON.stringify(data);
  const created = saveCustomerRecord(data, draft);
  assert.equal(created.record.id, "cus_09");
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(created.data.orders, data.orders);
  assert.throws(() => saveCustomerRecord(created.data, { ...draft, email: "ALEX@example.com" }), /highlighted/);
  const updated = saveCustomerRecord(
    created.data,
    { ...draft, name: "Alex Updated" },
    created.record.id,
    created.record,
  );
  assert.equal(updated.record.name, "Alex Updated");
  assert.throws(() => saveCustomerRecord(updated.data, draft, created.record.id, created.record), /changed since/);
  assert.throws(() => saveCustomerRecord(updated.data, null, created.record.id, created.record, true), /changed since/);
  assert.throws(() => saveCustomerRecord(updated.data, draft, "missing", created.record), /no longer exists/);
});

test("deletion rejects linked orders and newly linked orders against the latest snapshot", async () => {
  const { database, service } = fixture();
  const linked = database.read().customers[0];
  await assert.rejects(service.deleteCustomer(linked.id, linked), /linked orders/);
  const customer = await service.createCustomer(draft);
  const current = database.read();
  const template = current.orders[0];
  database.write({ ...current, orders: [...current.orders, { ...template, id: "NX-9999", customerId: customer.id }] });
  await assert.rejects(service.deleteCustomer(customer.id, customer), /linked orders/);
  assert.ok(database.read().customers.some((item) => item.id === customer.id));
});

test("unlinked customer deletion preserves records and monotonic IDs across reload and repeated deletion", async () => {
  const { database, service } = fixture();
  const customer = await service.createCustomer(draft);
  const originalOrders = database.read().orders;
  const removed = await service.deleteCustomer(customer.id, reactive(customer));
  assert.equal(removed.id, customer.id);
  assert.equal(await service.getCustomerSnapshot(customer.id), null);
  assert.deepEqual(database.read().orders, originalOrders);
  await assert.rejects(service.deleteCustomer(customer.id, customer), /no longer exists/);
  const next = await service.createCustomer(draft);
  assert.equal(next.id, "cus_10");
  for (const customerSequence of [null, 1, "01", "-1", "0"])
    assert.throws(() => validateDatabase({ ...database.read(), customerSequence }), /customer sequence/);
});

test("customer mutations use the same exclusive persistence gate as orders and return detached data", async () => {
  const { database } = fixture();
  let inside = false;
  let calls = 0;
  const service = createMockApi(
    {
      read() {
        assert.equal(inside, true);
        return database.read();
      },
      write(data) {
        assert.equal(inside, true);
        database.write(data);
      },
    },
    0,
    (operation) => {
      calls++;
      inside = true;
      try {
        return operation();
      } finally {
        inside = false;
      }
    },
  );
  const customer = await service.createCustomer(draft);
  const saved = await service.updateCustomer(customer.id, { ...draft, name: "Updated" }, customer);
  saved.name = "Detached";
  assert.equal(database.read().customers.at(-1).name, "Updated");
  await service.deleteCustomer(customer.id, database.read().customers.at(-1));
  assert.equal(calls, 3);
});

test("customer details use one detached snapshot with only linked orders", async () => {
  const data = seed();
  let reads = 0;
  const service = createMockApi(
    {
      read() {
        reads++;
        return data;
      },
    },
    0,
  );
  const details = await service.getCustomerSnapshot(data.customers[0].id);
  assert.equal(reads, 1);
  assert.ok(details.orders.every((order) => order.customerId === details.customer.id));
  details.customer.name = "Detached";
  details.orders[0].items[0].name = "Detached";
  assert.notEqual(data.customers[0].name, "Detached");
  assert.notEqual(data.orders[0].items[0].name, "Detached");
  assert.equal(await service.getCustomerSnapshot("missing"), null);
});

test("customer search combines identity fields and summaries count paid orders only with exact cents", () => {
  const data = seed();
  const customer = data.customers[0];
  for (const search of [customer.id.toUpperCase(), customer.name.toUpperCase(), customer.email, customer.company])
    assert.ok(queryCustomers(data, { search }).rows.some((row) => row.id === customer.id));
  const row = queryCustomers(data, { search: customer.email }).rows[0];
  const linked = data.orders.filter((order) => order.customerId === customer.id);
  assert.deepEqual(
    { orderCount: row.orderCount, paidCount: row.paidCount, revenueCents: row.revenueCents },
    customerMetrics(linked),
  );
  assert.equal(
    row.revenueCents,
    linked.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.totalCents, 0),
  );
  assert.deepEqual(customerMetrics([]), { orderCount: 0, paidCount: 0, revenueCents: 0 });
  assert.throws(
    () =>
      customerMetrics([
        { status: "paid", totalCents: Number.MAX_SAFE_INTEGER },
        { status: "paid", totalCents: 1 },
      ]),
    /supported limit/,
  );
});

test("sorting and pagination are stable, clamp after deletion, and do not mutate data", () => {
  let data = seed();
  for (let index = 0; index < 13; index++)
    data = saveCustomerRecord(data, { ...draft, name: `Test ${index}`, email: `test${index}@example.com` }).data;
  const before = JSON.stringify(data);
  for (const sortBy of ["name", "orders", "revenue"])
    for (const direction of ["asc", "desc"]) {
      const result = queryCustomers(data, { sortBy, direction, pageSize: 50 });
      assert.equal(result.total, 21);
      if (sortBy !== "name")
        assert.ok(
          result.rows.every(
            (row, index, rows) =>
              !index ||
              (direction === "asc" ? 1 : -1) *
                (row[sortBy === "orders" ? "orderCount" : "revenueCents"] -
                  rows[index - 1][sortBy === "orders" ? "orderCount" : "revenueCents"]) >=
                0,
          ),
        );
    }
  assert.equal(JSON.stringify(data), before);
  const removed = saveCustomerRecord(data, null, data.customers.at(-1).id, data.customers.at(-1), true);
  assert.equal(queryCustomers(removed.data, { page: 3 }).page, 2);
  assert.equal(queryCustomers(data, { search: "missing" }).from, 0);
  assert.throws(() => queryCustomers(data, { sortBy: "bad" }), /Invalid/);
});

test("storage failures and duplicate email leave persistence intact and drafts retryable", async () => {
  const { database, storage, service } = fixture();
  const session = createCustomerSession(service);
  const before = storage.getItem(DATABASE_KEY);
  const originalWrite = storage.setItem;
  storage.setItem = () => {
    throw new Error("Denied");
  };
  assert.equal(await session.save(draft), null);
  assert.ok(session.state.mutationError);
  assert.equal(session.state.busy, false);
  assert.equal(storage.getItem(DATABASE_KEY), before);
  storage.setItem = originalWrite;
  const customer = await session.save(draft);
  assert.ok(customer);
  assert.equal(await session.save({ ...draft, email: draft.email.toUpperCase() }), null);
  assert.ok(session.state.fieldErrors.email);
  await session.load(customer.id);
  storage.setItem = () => {
    throw new Error("Denied");
  };
  assert.equal(await session.remove(), null);
  assert.ok(database.read().customers.some((item) => item.id === customer.id));
  storage.setItem = originalWrite;
  assert.ok(await session.remove());
});

test("directory latest reads reject stale success/failure, retain prior data on refresh errors and cancel", async () => {
  const pending = [];
  const store = createCustomersStore({
    getCustomersSnapshot() {
      const item = deferred();
      pending.push(item);
      return item.promise;
    },
  });
  const first = store.load(),
    second = store.load();
  pending[1].resolve(seed());
  await second;
  pending[0].reject(new Error("Stale"));
  await first;
  assert.equal(store.state.error, "");
  const retry = store.load();
  pending[2].reject(new Error("Blocked"));
  await retry;
  assert.equal(store.state.status, "success");
  assert.match(store.state.error, /Blocked/);
  const cancelled = store.load();
  store.cancel();
  pending[3].resolve({ invalid: true });
  await cancelled;
  assert.match(store.state.error, /Blocked|^$/);
  const invalid = store.load();
  pending[4].resolve({ customers: [], orders: seed().orders });
  await invalid;
  assert.match(store.state.error, /relationship/);
});

test("customer session guards stale details, wrong relationships, missing records and duplicate mutations", async () => {
  const pending = [];
  const data = seed();
  const session = createCustomerSession({
    getCustomerSnapshot() {
      const item = deferred();
      pending.push(item);
      return item.promise;
    },
  });
  const first = session.load("cus_01"),
    second = session.load("cus_02");
  pending[1].resolve({ customer: data.customers[1], orders: [] });
  await second;
  pending[0].resolve({ customer: data.customers[0], orders: [] });
  await first;
  assert.equal(session.state.data.customer.id, "cus_02");
  const invalid = session.load("cus_01");
  pending[2].resolve({ customer: data.customers[0], orders: [data.orders[1]] });
  await invalid;
  assert.equal(session.state.status, "error");
  const missing = session.load("missing");
  pending[3].resolve(null);
  await missing;
  assert.equal(session.state.status, "missing");
  assert.equal(await session.remove(), null);
  const waiting = deferred();
  let calls = 0;
  const mutation = createCustomerSession({
    createCustomer() {
      calls++;
      return waiting.promise;
    },
  });
  const saving = mutation.save(draft);
  assert.equal(await mutation.save(draft), null);
  await mutation.load("cus_01");
  assert.equal(calls, 1);
  waiting.resolve({ id: "cus_09", ...draft });
  assert.ok(await saving);
  assert.equal(mutation.state.busy, false);
});
