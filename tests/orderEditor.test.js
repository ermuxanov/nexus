import test from "node:test";
import assert from "node:assert/strict";
import { reactive } from "vue";
import { orderDraft, validateOrderDraft, priceToCents, centsToPrice, nextOrderId } from "../src/domain/orderEditor.js";
import { createOrderEditor } from "../src/store/orderEditor.js";
import { createMockApi } from "../src/services/api.js";
import { createDatabaseStorage, DATABASE_KEY } from "../src/services/storage.js";
import { createSeed } from "../src/services/seed.js";
import { buildAnalytics } from "../src/domain/analytics.js";

const seed = () => createSeed(new Date("2026-10-15T12:00:00Z"));
const valid = () => ({
  customerId: "cus_01",
  date: "2026-10-14",
  status: "paid",
  items: [{ name: "Service", quantity: "3", price: "19.99" }],
});
function fixture() {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const database = createDatabaseStorage(storage, seed);
  const data = database.read();
  return { storage, database, data, service: createMockApi(database, 0) };
}
test("USD decimal parsing is exact, allows zero, rejects rounding and unsafe values", () => {
  assert.equal(priceToCents("19.99"), 1999);
  assert.equal(priceToCents("0.01"), 1);
  assert.equal(priceToCents("0"), 0);
  assert.equal(priceToCents("1.2"), 120);
  assert.equal(priceToCents(centsToPrice(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  for (const value of ["", "-1", "1.001", "1e2", "1,000", "Infinity", "90071992547409.92"])
    assert.throws(() => priceToCents(value));
});
test("form validates relationships, status, real dates, names, integer quantity and financial overflow", () => {
  const data = seed();
  const form = valid();
  const original = structuredClone(form);
  const result = validateOrderDraft(form, data.customers);
  assert.equal(result.totalCents, 5997);
  assert.equal(result.payload.createdAt, "2026-10-14T00:00:00.000Z");
  assert.deepEqual(form, original);
  const bad = {
    customerId: "missing",
    status: "unknown",
    date: "2026-02-30",
    items: [{ name: " ", quantity: "1.5", price: "-2" }],
  };
  const errors = validateOrderDraft(bad, data.customers);
  assert.equal(errors.payload, null);
  for (const key of ["customerId", "status", "date", "items.0.name", "items.0.quantity", "items.0.price"])
    assert.ok(errors.errors[key]);
  assert.ok(validateOrderDraft({ ...form, items: [] }, data.customers).errors.items);
  assert.ok(
    validateOrderDraft(
      { ...form, items: [{ name: "Overflow", quantity: "2", price: centsToPrice(Number.MAX_SAFE_INTEGER) }] },
      data.customers,
    ).errors.items,
  );
});
test("editing preserves timestamps on unchanged dates and exact cents in the draft", () => {
  const data = seed();
  const order = data.orders[0];
  const draft = orderDraft(order);
  assert.equal(validateOrderDraft(draft, data.customers, order).payload.createdAt, order.createdAt);
  assert.equal(priceToCents(draft.items[0].price), order.items[0].unitPriceCents);
  draft.date = "2026-10-13";
  assert.equal(validateOrderDraft(draft, data.customers, order).payload.createdAt, "2026-10-13T00:00:00.000Z");
});
test("IDs remain unique with gaps, custom IDs, zero padding and arbitrarily large numeric suffixes", () => {
  assert.equal(nextOrderId([]), "NX-0001");
  assert.equal(nextOrderId([{ id: "NX-0002" }, { id: "custom" }, { id: "NX-9" }]), "NX-0010");
  assert.equal(nextOrderId([{ id: "NX-9007199254740999" }]), "NX-9007199254741000");
});
test("create/update persist schema v1, recompute totals, preserve identity, and refresh analytics", async () => {
  const { database, data, service, storage } = fixture();
  const payload = validateOrderDraft(valid(), data.customers).payload;
  payload.totalCents = 1; // Persistence must ignore a client total.
  const [first, second] = await Promise.all([service.createOrder(payload), service.createOrder(payload)]);
  assert.notEqual(first.id, second.id);
  assert.equal(first.totalCents, 5997);
  assert.equal(database.read().orders.length, 34);
  assert.equal(JSON.parse(storage.getItem(DATABASE_KEY)).version, 1);
  const updated = await service.updateOrder(
    first.id,
    { ...payload, status: "pending", items: [{ name: "Changed", quantity: 2, unitPriceCents: 1 }] },
    first,
  );
  assert.equal(updated.id, first.id);
  assert.equal(updated.totalCents, 2);
  assert.equal(updated.status, "pending");
  const before = buildAnalytics(data, 7, new Date("2026-10-16T00:00:00Z"));
  const after = buildAnalytics(await service.getAnalyticsSnapshot(), 7, new Date("2026-10-16T00:00:00Z"));
  assert.equal(after.current.revenueCents - before.current.revenueCents, second.totalCents);
});
test("writes reject missing customers, invalid line values and stale edits without altering records", async () => {
  const { database, data, service } = fixture();
  const payload = validateOrderDraft(valid(), data.customers).payload;
  const before = JSON.stringify(database.read());
  await assert.rejects(service.createOrder({ ...payload, customerId: "missing" }));
  await assert.rejects(service.createOrder({ ...payload, items: [{ name: "Bad", quantity: 1, unitPriceCents: 0.5 }] }));
  await assert.rejects(service.createOrder({ ...payload, createdAt: "2026-02-30T00:00:00Z" }));
  assert.equal(JSON.stringify(database.read()), before);
  const original = data.orders[0];
  await service.updateOrder(original.id, payload, original);
  await assert.rejects(
    service.updateOrder(original.id, { ...payload, status: "cancelled" }, original),
    /changed since/,
  );
  await assert.rejects(service.updateOrder("missing", payload, original), /no longer exists/);
});

test("workspace limit accepts the exact boundary and rejects further writes across statuses and dates", async () => {
  const { database, data, service, storage } = fixture();
  const existingTotal = data.orders.reduce((sum, order) => sum + order.totalCents, 0);
  const payload = validateOrderDraft(valid(), data.customers).payload;
  const remaining = Number.MAX_SAFE_INTEGER - existingTotal;
  await service.createOrder({ ...payload, items: [{ name: "Boundary", quantity: 1, unitPriceCents: remaining }] });
  const before = storage.getItem(DATABASE_KEY);
  for (const status of ["paid", "pending", "cancelled"]) {
    await assert.rejects(
      service.createOrder({
        ...payload,
        status,
        createdAt: "2099-01-01T00:00:00.000Z",
        items: [{ name: "One more cent", quantity: 1, unitPriceCents: 1 }],
      }),
      /workspace total exceeds/,
    );
    assert.equal(storage.getItem(DATABASE_KEY), before);
  }
  for (const days of [7, 30, 90]) {
    assert.doesNotThrow(() => buildAnalytics(database.read(), days, new Date("2026-10-16T00:00:00Z")));
  }
});

test("editing replaces rather than double-counts totals and rejected overflow can be corrected", async () => {
  const { database, data, service, storage } = fixture();
  const existingTotal = data.orders.reduce((sum, order) => sum + order.totalCents, 0);
  const payload = validateOrderDraft(valid(), data.customers).payload;
  const remaining = Number.MAX_SAFE_INTEGER - existingTotal;
  const boundaryPayload = { ...payload, items: [{ name: "Boundary", quantity: 1, unitPriceCents: remaining }] };
  const saved = await service.createOrder(boundaryPayload);
  const unchanged = await service.updateOrder(saved.id, boundaryPayload, saved);
  assert.equal(unchanged.totalCents, remaining);
  const before = storage.getItem(DATABASE_KEY);
  const editor = createOrderEditor(service);
  const tooLarge = { ...payload, items: [{ name: "Too large", quantity: 1, unitPriceCents: remaining + 1 }] };
  assert.equal(await editor.save(tooLarge, unchanged), null);
  assert.match(editor.state.error, /workspace total exceeds/);
  assert.equal(storage.getItem(DATABASE_KEY), before);
  const corrected = await editor.save(payload, unchanged);
  assert.equal(corrected.totalCents, 5997);
  assert.equal(editor.state.error, "");
  assert.equal(database.read().orders.length, data.orders.length + 1);
});

test("reactive listing rows and form payloads save through the API without proxy clone failures", async () => {
  const { database, data, service } = fixture();
  const original = reactive({ ...data.orders[0], customer: data.customers[0] });
  const payload = reactive(validateOrderDraft(valid(), data.customers).payload);
  const editor = createOrderEditor(service);
  const saved = await editor.save(payload, original);
  assert.equal(editor.state.error, "");
  assert.equal(saved.id, original.id);
  assert.equal(saved.totalCents, 5997);
  assert.equal(database.read().orders.find((order) => order.id === original.id).status, "paid");
});
test("storage failures never report success and the same draft can be retried", async () => {
  const { database, storage, data, service } = fixture();
  const originalWrite = storage.setItem;
  const before = JSON.stringify(database.read());
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  const editor = createOrderEditor(service);
  const payload = validateOrderDraft(valid(), data.customers).payload;
  assert.equal(await editor.save(payload), null);
  assert.match(editor.state.error, /could not be saved/);
  assert.equal(editor.state.saving, false);
  assert.equal(JSON.stringify(database.read()), before);
  storage.setItem = originalWrite;
  assert.ok(await editor.save(payload));
  assert.equal(editor.state.error, "");
});
test("submission guard admits one in-flight mutation, keeps input, and re-enables after failure", async () => {
  let finish;
  let calls = 0;
  const service = {
    createOrder: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const editor = createOrderEditor(service);
  const payload = { example: "unchanged" };
  const first = editor.save(payload);
  assert.equal(await editor.save(payload), null);
  assert.equal(calls, 1);
  finish({ id: "NX-1049" });
  assert.equal((await first).id, "NX-1049");
  assert.deepEqual(payload, { example: "unchanged" });
  assert.equal(editor.state.saving, false);
});
