import test from "node:test";
import assert from "node:assert/strict";
import { queryOrders, orderDateError } from "../src/domain/orders.js";
import { createOrdersStore } from "../src/store/orders.js";
import { createSeed } from "../src/services/seed.js";
import { createMockApi } from "../src/services/api.js";

const seed = () => createSeed(new Date("2026-10-15T12:00:00Z"));

test("orders combine case-insensitive ID/customer search, status and inclusive UTC bounds", () => {
  const data = seed();
  const row = data.orders.find((order) => order.status === "paid");
  const customer = data.customers.find((item) => item.id === row.customerId);
  const day = row.createdAt.slice(0, 10);
  const filters = { search: `  ${customer.name.toUpperCase()}  `, status: "paid", startDate: day, endDate: day };
  assert.deepEqual(
    queryOrders(data, filters).rows.map((item) => item.id),
    [row.id],
  );
  assert.equal(queryOrders(data, { ...filters, search: row.id.toLowerCase() }).total, 1);
  assert.equal(queryOrders(data, { ...filters, status: "cancelled" }).total, 0);
  // UTC midnight includes this offset timestamp in the preceding calendar day.
  row.createdAt = "2026-10-15T00:30:00+02:00";
  assert.equal(queryOrders(data, { search: row.id, startDate: "2026-10-14", endDate: "2026-10-14" }).total, 1);
  row.createdAt = "2026-10-15T00:00:00Z";
  assert.equal(queryOrders(data, { search: row.id, endDate: "2026-10-14" }).total, 0);
});

test("orders sort exact cents and dates in both directions with deterministic ID ties, without mutation", () => {
  const data = seed();
  const before = JSON.stringify(data);
  for (const sortBy of ["date", "amount"]) {
    for (const direction of ["asc", "desc"]) {
      const rows = queryOrders(data, { sortBy, direction, pageSize: 50 }).rows;
      const values = rows.map((row) => (sortBy === "amount" ? row.totalCents : Date.parse(row.createdAt)));
      assert.deepEqual(
        values,
        [...values].sort((a, b) => (direction === "asc" ? a - b : b - a)),
      );
    }
  }
  assert.equal(JSON.stringify(data), before);
  const ties = {
    ...data,
    orders: data.orders.slice(0, 3).map((row) => ({ ...row, totalCents: 1, createdAt: "2026-10-15T00:00:00Z" })),
  };
  const expected = ties.orders.map((row) => row.id).sort();
  for (const sortBy of ["date", "amount"]) {
    for (const direction of ["asc", "desc"]) {
      assert.deepEqual(
        queryOrders({ ...ties, orders: [...ties.orders].reverse() }, { sortBy, direction }).rows.map((row) => row.id),
        expected,
      );
    }
  }
  const cents = { ...ties, orders: ties.orders.map((row, index) => ({ ...row, totalCents: index + 1 })) };
  assert.deepEqual(
    queryOrders(cents, { sortBy: "amount", direction: "asc" }).rows.map((row) => row.totalCents),
    [1, 2, 3],
  );
});

test("pagination runs after filtering/sorting and clamps pages for 10/20/50 rows and empty data", () => {
  const data = seed();
  for (const pageSize of [10, 20, 50]) {
    const all = [];
    const pages = Math.ceil(data.orders.length / pageSize);
    for (let page = 1; page <= pages; page++) {
      const result = queryOrders(data, { page, pageSize });
      all.push(...result.rows.map((row) => row.id));
      assert.equal(result.from, (page - 1) * pageSize + 1);
      assert.equal(result.to, Math.min(page * pageSize, data.orders.length));
    }
    assert.equal(new Set(all).size, 32);
    assert.equal(queryOrders(data, { page: 999, pageSize }).page, pages);
  }
  const filtered = queryOrders(data, { search: data.orders[0].id, page: 4 });
  assert.equal(filtered.page, 1);
  assert.equal(filtered.total, 1);
  const empty = queryOrders({ orders: [], customers: [] }, { page: 5 });
  assert.deepEqual([empty.from, empty.to, empty.total, empty.page, empty.pageCount], [0, 0, 0, 1, 1]);
});

test("invalid calendar ranges and unsupported sorting/page sizes are explicit", () => {
  assert.equal(orderDateError({ startDate: "2024-02-29" }), "");
  for (const range of [
    { startDate: "2026-02-29" },
    { endDate: "2026-13-01" },
    { startDate: "2026-10-15", endDate: "2026-10-14" },
  ]) {
    assert.ok(orderDateError(range));
    assert.throws(() => queryOrders(seed(), range), RangeError);
  }
  for (const options of [{ pageSize: 25 }, { sortBy: "customer" }, { direction: "invalid" }])
    assert.throws(() => queryOrders(seed(), options), RangeError);
});

test("orders snapshot is one detached consistent API read", async () => {
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
  const snapshot = await service.getOrdersSnapshot();
  assert.equal(reads, 1);
  snapshot.customers[0].name = "Changed";
  snapshot.orders[0].status = "paid";
  assert.notDeepEqual(snapshot, data);
  assert.notEqual(snapshot.customers[0].name, data.customers[0].name);
});

test("orders reads reject stale success/failure, support retry, validate data and cancel on unmount", async () => {
  const pending = [];
  const store = createOrdersStore({
    getOrdersSnapshot: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  const old = store.load();
  const current = store.load();
  pending[1].resolve(seed());
  await current;
  pending[0].resolve({ orders: [], customers: [] });
  await old;
  assert.equal(store.state.data.orders.length, 32);
  const stale = store.load();
  const newest = store.load();
  pending[3].resolve(seed());
  await newest;
  pending[2].reject(new Error("Stale"));
  await stale;
  assert.equal(store.state.error, "");
  const failed = store.load();
  assert.equal(store.state.refreshing, true);
  pending[4].reject(new Error("Blocked storage"));
  await failed;
  assert.equal(store.state.error, "Blocked storage");
  assert.equal(store.state.data.orders.length, 32);
  const invalid = store.load();
  pending[5].resolve({ orders: [{}], customers: [] });
  await invalid;
  assert.match(store.state.error, /Invalid/);
  const retry = store.load();
  pending[6].resolve(seed());
  await retry;
  assert.equal(store.state.error, "");
  const cancelled = store.load();
  store.cancel();
  pending[7].resolve({ orders: [], customers: [] });
  await cancelled;
  assert.equal(store.state.data.orders.length, 32);
  const firstLoad = createOrdersStore({
    getOrdersSnapshot: async () => {
      throw new Error("Unavailable");
    },
  });
  await firstLoad.load();
  assert.equal(firstLoad.state.status, "error");
  assert.equal(firstLoad.state.data, null);
});
