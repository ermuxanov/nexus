import test from "node:test";
import assert from "node:assert/strict";
import { analyticsPeriods, buildAnalytics, compareMetric, formatMoney, sumCents } from "../src/domain/analytics.js";
import { createAnalyticsStore } from "../src/store/analytics.js";
import { createMockApi } from "../src/services/api.js";

const now = new Date("2026-10-15T16:23:00Z");
const customers = ["a", "b", "c"].map((id) => ({ id, name: id, email: `${id}@test.example`, company: "Test" }));
function order(id, createdAt, status = "paid", totalCents = 101, customerId = "a") {
  return {
    id,
    createdAt,
    status,
    totalCents,
    customerId,
    currency: "USD",
    items: [{ name: "Plan", quantity: 1, unitPriceCents: totalCents }],
  };
}
function data(orders = []) {
  return { customers, orders };
}

test("UTC periods are equal, adjacent and cross month/year/leap boundaries", () => {
  for (const days of [7, 30, 90]) {
    const period = analyticsPeriods(days, new Date("2024-03-01T23:59:59-05:00"));
    assert.equal(period.end, Date.parse("2024-03-02T00:00:00Z"));
    assert.equal(period.end - period.start, days * 86400000);
    assert.equal(period.start - period.previousStart, days * 86400000);
  }
  assert.equal(analyticsPeriods(7, new Date("2026-01-02Z")).start, Date.parse("2025-12-26Z"));
  assert.throws(() => analyticsPeriods(8, now));
  assert.throws(() => analyticsPeriods(7, new Date("invalid")));
});

test("KPIs count paid revenue and distinct paying customers; conversion has no fabricated denominator", () => {
  const result = buildAnalytics(
    data([
      order("1", "2026-10-09T12:00:00Z", "paid", 101),
      order("2", "2026-10-10T12:00:00Z", "paid", 202),
      order("3", "2026-10-11T12:00:00Z", "pending", 500, "b"),
      order("4", "2026-10-12T12:00:00Z", "cancelled", 700, "c"),
      order("5", "2026-10-13T12:00:00Z", "paid", 0, "b"),
    ]),
    7,
    now,
  );
  assert.deepEqual(result.current, { revenueCents: 303, orderCount: 5, activeCustomers: 2, conversionRate: null });
  assert.deepEqual(
    result.breakdown.map(({ count, amountCents }) => [count, amountCents]),
    [
      [3, 303],
      [1, 500],
      [1, 700],
    ],
  );
  assert.equal(
    result.daily.reduce((total, day) => total + day.revenueCents, 0),
    303,
  );
  assert.equal(
    result.daily.reduce((total, day) => total + day.paidOrders, 0),
    3,
  );
});

test("date filtering uses inclusive start, exclusive end and separates comparison orders", () => {
  const input = data([
    order("old", "2026-09-30T23:59:59.999Z"),
    order("previous-start", "2026-10-01T00:00:00Z", "paid", 200),
    order("previous-end", "2026-10-07T23:59:59.999Z", "paid", 300),
    order("start", "2026-10-08T00:00:00Z", "paid", 100),
    order("end", "2026-10-14T23:59:59.999Z", "paid", 200),
    order("today", "2026-10-15T00:00:00Z"),
    order("future", "2027-01-01T00:00:00Z"),
  ]);
  const snapshot = structuredClone(input);
  const result = buildAnalytics(input, 7, now);
  assert.equal(result.previous.revenueCents, 500);
  assert.equal(result.current.revenueCents, 300);
  assert.deepEqual(result.comparisons.revenueCents, { previous: 500, delta: -200, percent: -40 });
  assert.equal(result.daily[0].revenueCents, 100);
  assert.equal(result.daily.at(-1).revenueCents, 200);
  assert.equal(result.daily[1].revenueCents, 0);
  assert.deepEqual(
    result.recentOrders.map((row) => row.id),
    ["end", "start"],
  );
  assert.deepEqual(input, snapshot);
});

test("7/30/90 filters include only their corresponding dates", () => {
  const input = data(
    [order("7", "2026-10-14Z"), order("30", "2026-09-20Z"), order("90", "2026-08-01Z")].map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  );
  for (const [days, count] of [
    [7, 1],
    [30, 2],
    [90, 3],
  ]) {
    const result = buildAnalytics(input, days, now);
    assert.equal(result.current.orderCount, count);
    assert.equal(result.daily.length, days);
  }
});

test("empty periods retain zero metrics, filled day buckets and unavailable growth", () => {
  const result = buildAnalytics(data(), 30, now);
  assert.equal(result.current.revenueCents, 0);
  assert.equal(result.current.orderCount, 0);
  assert.equal(result.current.activeCustomers, 0);
  assert.equal(result.current.conversionRate, null);
  assert.equal(result.daily.length, 30);
  assert.ok(result.daily.every((day) => day.revenueCents === 0 && day.paidOrders === 0));
  assert.equal(result.recentOrders.length, 0);
  assert.deepEqual(compareMetric(0, 0), { previous: 0, delta: 0, percent: null });
  assert.deepEqual(compareMetric(100, 0), { previous: 0, delta: 100, percent: null });
  assert.equal(compareMetric(0, 100).percent, -100);
  assert.equal(compareMetric(200, 100).percent, 100);
  assert.equal(compareMetric(100, 100).percent, 0);
});

test("cent aggregation is exact, formats USD and rejects overflow or corrupt records", () => {
  assert.equal(sumCents([{ totalCents: 10 }, { totalCents: 20 }]), 30);
  assert.equal(formatMoney(30), "$0.30");
  assert.equal(formatMoney(123456), "$1,234.56");
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER), "$90,071,992,547,409.91");
  assert.throws(() => formatMoney(0.5), RangeError);
  assert.throws(() => sumCents([{ totalCents: Number.MAX_SAFE_INTEGER }, { totalCents: 1 }]), RangeError);
  assert.throws(() => buildAnalytics(data([order("bad", "2026-10-14T00:00:00Z", "paid", 1.5)]), 7, now));
  assert.throws(() => buildAnalytics(data([{ ...order("bad", "2026-10-14T00:00:00Z"), currency: "EUR" }]), 7, now));
});

test("recent orders are the latest five with linked customer names", () => {
  const result = buildAnalytics(
    data(
      Array.from({ length: 7 }, (_, index) =>
        order(String(index), `2026-10-${String(8 + index).padStart(2, "0")}T00:00:00Z`),
      ),
    ),
    7,
    now,
  );
  assert.deepEqual(
    result.recentOrders.map((row) => row.id),
    ["6", "5", "4", "3", "2"],
  );
  assert.equal(result.recentOrders[0].customer.name, "a");
});

test("snapshot API reads once and returns detached consistent data", async () => {
  let reads = 0;
  const input = data();
  const api = createMockApi(
    {
      read() {
        reads += 1;
        return input;
      },
    },
    0,
  );
  const result = await api.getAnalyticsSnapshot();
  assert.equal(reads, 1);
  result.customers[0].name = "changed";
  assert.equal(input.customers[0].name, "a");
});

test("analytics ignores stale successes and failures, exposes retry and invalidates on unmount", async () => {
  const responses = [];
  const store = createAnalyticsStore(
    { getAnalyticsSnapshot: () => new Promise((resolve, reject) => responses.push({ resolve, reject })) },
    () => now,
  );
  const first = store.load(90);
  const second = store.load(7);
  responses[1].resolve(data());
  await second;
  responses[0].resolve(data([order("old", "2026-10-14T00:00:00Z")]));
  await first;
  assert.equal(store.state.result.period.days, 7);
  assert.equal(store.state.result.current.orderCount, 0);
  const stale = store.load(30);
  const current = store.load(7);
  responses[3].resolve(data());
  await current;
  responses[2].reject(new Error("stale"));
  await stale;
  assert.equal(store.state.status, "success");
  const failure = store.load(90);
  responses[4].reject(new Error("Storage blocked"));
  await failure;
  assert.equal(store.state.status, "error");
  assert.equal(store.state.error, "Storage blocked");
  const retry = store.load(30);
  responses[5].resolve(data());
  await retry;
  assert.equal(store.state.status, "success");
  const cancelled = store.load(90);
  store.cancel();
  responses[6].resolve(data());
  await cancelled;
  assert.equal(store.state.result, null);
});

test("same-period refresh retains clearly dated results; range changes discard old results even on failure", async () => {
  const responses = [];
  const store = createAnalyticsStore(
    { getAnalyticsSnapshot: () => new Promise((resolve, reject) => responses.push({ resolve, reject })) },
    () => now,
  );
  const initial = store.load(30);
  responses[0].resolve(data([order("one", "2026-10-14T00:00:00Z")]));
  await initial;
  const refresh = store.load(30);
  assert.equal(store.state.refreshing, true);
  assert.equal(store.state.status, "success");
  assert.equal(store.state.result.current.orderCount, 1);
  responses[1].reject(new Error("Offline"));
  await refresh;
  assert.equal(store.state.refreshing, false);
  assert.equal(store.state.error, "Offline");
  assert.equal(store.state.result.period.days, 30);
  const rangeChange = store.load(7);
  assert.equal(store.state.result, null);
  assert.equal(store.state.status, "loading");
  responses[2].reject(new Error("Blocked"));
  await rangeChange;
  assert.equal(store.state.status, "error");
  assert.equal(store.state.result, null);
});
