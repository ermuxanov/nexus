import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";
import { createSeed } from "../src/services/seed.js";
import { createDatabaseStorage, DATABASE_KEY } from "../src/services/storage.js";
import { createMockApi } from "../src/services/api.js";
import { deleteOrderRecord } from "../src/domain/orderDeletion.js";
import { validateDatabase } from "../src/domain/integrity.js";
import { validateOrderDraft, orderDraft } from "../src/domain/orderEditor.js";
import { buildAnalytics } from "../src/domain/analytics.js";
import { queryOrders } from "../src/domain/orders.js";
import { createOrderDetails } from "../src/store/orderDetails.js";

const seed = () => createSeed(new Date("2026-10-15T12:00:00Z"));
function fixture(initial = seed()) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const database = createDatabaseStorage(storage, () => initial);
  const data = database.read();
  return { data, storage, database, service: createMockApi(database, 0) };
}
const snapshot = (data, index = 0) => ({
  order: data.orders[index],
  customer: data.customers.find((customer) => customer.id === data.orders[index].customerId),
});

test("details use one detached consistent read and distinguish a missing order", async () => {
  const data = seed();
  let reads = 0;
  const service = createMockApi(
    {
      read: () => {
        reads++;
        return data;
      },
    },
    0,
  );
  const result = await service.getOrderSnapshot(data.orders[0].id);
  assert.equal(reads, 1);
  assert.equal(result.order.customerId, result.customer.id);
  result.order.items[0].name = "Detached";
  result.customer.name = "Detached";
  assert.notEqual(data.orders[0].items[0].name, "Detached");
  assert.notEqual(data.customers.find((customer) => customer.id === result.customer.id).name, "Detached");
  assert.equal(await service.getOrderSnapshot("missing"), null);
});

test("deletion removes only the expected order without mutating its source or customers", () => {
  const data = seed();
  const before = JSON.stringify(data);
  const target = data.orders[0];
  const removed = deleteOrderRecord(data, target.id, target);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(removed.record, target);
  assert.equal(removed.data.orders.length, data.orders.length - 1);
  assert.deepEqual(
    removed.data.orders,
    data.orders.filter((order) => order.id !== target.id),
  );
  assert.deepEqual(removed.data.customers, data.customers);
  assert.doesNotThrow(() => validateDatabase(removed.data));
  assert.throws(() => deleteOrderRecord(data, target.id, null), /changed since/);
});

test("stale or repeated deletes never remove another version, and execute inside the write coordinator", async () => {
  const { data, database, storage } = fixture();
  let locked = false;
  const service = createMockApi(
    {
      read() {
        assert.equal(locked, true);
        return database.read();
      },
      write(next) {
        assert.equal(locked, true);
        database.write(next);
      },
    },
    0,
    (operation) => {
      locked = true;
      try {
        return operation();
      } finally {
        locked = false;
      }
    },
  );
  const original = data.orders[0];
  const payload = validateOrderDraft(orderDraft(original), data.customers, original).payload;
  const changed = await service.updateOrder(
    original.id,
    { ...payload, status: original.status === "paid" ? "pending" : "paid" },
    original,
  );
  const before = storage.getItem(DATABASE_KEY);
  await assert.rejects(service.deleteOrder(original.id, original), /changed since/);
  assert.equal(storage.getItem(DATABASE_KEY), before);
  const removed = await service.deleteOrder(changed.id, reactive(changed));
  assert.equal(removed.id, original.id);
  const after = storage.getItem(DATABASE_KEY);
  await assert.rejects(service.deleteOrder(changed.id, changed), /no longer exists/);
  assert.equal(storage.getItem(DATABASE_KEY), after);
});

test("deleting the last paid order updates empty listing and every analytics aggregate", async () => {
  const initial = seed();
  initial.orders = [{ ...initial.orders[0], createdAt: "2026-10-14T12:00:00.000Z", status: "paid" }];
  const { data, service } = fixture(initial);
  const now = new Date("2026-10-16T00:00:00Z");
  const before = buildAnalytics(data, 7, now);
  const order = data.orders[0];
  await service.deleteOrder(order.id, order);
  const after = buildAnalytics(await service.getAnalyticsSnapshot(), 7, now);
  assert.equal(before.current.revenueCents, order.totalCents);
  assert.deepEqual(after.current, { revenueCents: 0, orderCount: 0, activeCustomers: 0, conversionRate: null });
  assert.deepEqual(after.recentOrders, []);
  assert.ok(after.daily.every((day) => day.revenueCents === 0 && day.paidOrders === 0));
  assert.ok(after.breakdown.every((part) => part.amountCents === 0 && part.count === 0));
  const result = queryOrders(await service.getOrdersSnapshot(), { page: 3 });
  assert.deepEqual([result.total, result.from, result.to, result.page, result.pageCount], [0, 0, 0, 1, 1]);
  assert.equal(await service.getOrderSnapshot(order.id), null);
});

test("deleting the final row of a page clamps pagination without changing filters or sort", async () => {
  const initial = seed();
  initial.orders = initial.orders.slice(0, 21);
  const { service } = fixture(initial);
  const filters = { page: 3, pageSize: 10, sortBy: "amount", direction: "asc" };
  const before = queryOrders(await service.getOrdersSnapshot(), filters);
  await service.deleteOrder(before.rows[0].id, before.rows[0]);
  const after = queryOrders(await service.getOrdersSnapshot(), filters);
  assert.deepEqual([after.total, after.page, after.pageCount, after.from, after.to], [20, 2, 2, 11, 20]);
  assert.ok(after.rows.every((order, index, rows) => !index || order.totalCents >= rows[index - 1].totalCents));
});

test("deleted highest IDs are never reused and invalid persisted sequences are rejected", async () => {
  const { data, database, service } = fixture();
  const highest = [...data.orders].sort((a, b) => Number(b.id.slice(3)) - Number(a.id.slice(3)))[0];
  await service.deleteOrder(highest.id, highest);
  const payload = validateOrderDraft(orderDraft(highest), data.customers, highest).payload;
  const first = await service.createOrder(payload);
  assert.ok(BigInt(first.id.slice(3)) > BigInt(highest.id.slice(3)));
  await service.deleteOrder(first.id, first);
  const second = await service.createOrder(payload);
  assert.ok(BigInt(second.id.slice(3)) > BigInt(first.id.slice(3)));
  for (const orderSequence of [null, 1, "-1", "01", "1"]) {
    assert.throws(() => validateDatabase({ ...database.read(), orderSequence }), /order sequence/);
  }
});

test("failed delete preserves persistence and loaded details, then permits retry", async () => {
  const { storage, service, data, database } = fixture();
  const details = createOrderDetails(service);
  await details.load(data.orders[0].id);
  const before = storage.getItem(DATABASE_KEY);
  const originalWrite = storage.setItem;
  storage.setItem = () => {
    throw new Error("Quota denied");
  };
  assert.equal(await details.remove(), null);
  assert.match(details.state.deleteError, /could not be saved/);
  assert.equal(details.state.deleting, false);
  assert.equal(details.state.data.order.id, data.orders[0].id);
  assert.equal(storage.getItem(DATABASE_KEY), before);
  storage.setItem = originalWrite;
  assert.ok(await details.remove());
  assert.equal(details.state.deleteError, "");
  assert.equal(database.read().orders.length, data.orders.length - 1);
});

test("details reads ignore stale success/failure, validate relationships, handle missing/retry and cancel", async () => {
  const data = seed();
  const pending = [];
  const details = createOrderDetails({
    getOrderSnapshot: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  const old = details.load(data.orders[0].id);
  const current = details.load(data.orders[1].id);
  pending[1].resolve(snapshot(data, 1));
  await current;
  pending[0].resolve(snapshot(data));
  await old;
  assert.equal(details.state.data.order.id, data.orders[1].id);
  const stale = details.load(data.orders[0].id);
  const newest = details.load(data.orders[1].id);
  pending[3].resolve(snapshot(data, 1));
  await newest;
  pending[2].reject(new Error("stale"));
  await stale;
  assert.equal(details.state.error, "");
  const invalid = details.load(data.orders[0].id);
  pending[4].resolve(snapshot(data, 1));
  await invalid;
  assert.equal(details.state.status, "error");
  const missing = details.load("missing");
  pending[5].resolve(null);
  await missing;
  assert.equal(details.state.status, "missing");
  assert.equal(details.state.data, null);
  const cancelled = details.load(data.orders[0].id);
  details.cancel();
  pending[6].resolve(snapshot(data));
  await cancelled;
  assert.equal(details.state.data, null);
  const retry = details.load(data.orders[0].id);
  pending[7].resolve(snapshot(data));
  await retry;
  assert.equal(details.state.status, "success");
});

test("duplicate delete submissions and reads during deletion are blocked", async () => {
  const data = seed();
  let finish;
  let deletes = 0;
  let reads = 0;
  const details = createOrderDetails({
    getOrderSnapshot: async () => {
      reads++;
      return snapshot(data);
    },
    deleteOrder: () => {
      deletes++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  assert.equal(await details.remove(), null);
  await details.load(data.orders[0].id);
  const first = details.remove();
  assert.equal(details.state.deleting, true);
  assert.equal(await details.remove(), null);
  await details.load(data.orders[1].id);
  assert.equal(reads, 1);
  assert.equal(deletes, 1);
  finish(data.orders[0]);
  assert.equal((await first).id, data.orders[0].id);
  assert.equal(details.state.deleting, false);
});

test("details reject malformed relationships and expose current read failures", async () => {
  const data = seed();
  const original = snapshot(data);
  const unrelated = data.customers.find((customer) => customer.id !== original.customer.id);
  const cases = [
    async () => ({ ...original, customer: unrelated }),
    async () => ({}),
    async () => undefined,
    async () => {
      throw new Error("Browser storage blocked");
    },
  ];
  for (const getOrderSnapshot of cases) {
    const details = createOrderDetails({ getOrderSnapshot });
    await details.load(original.order.id);
    assert.equal(details.state.status, "error");
    assert.equal(details.state.data, null);
    assert.ok(details.state.error);
    assert.equal(await details.remove(), null);
  }
});
