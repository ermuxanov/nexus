import test from "node:test";
import assert from "node:assert/strict";
import { lineTotalCents, orderTotalCents } from "../src/domain/money.js";
import { filterOrders } from "../src/domain/filters.js";
import { validateDatabase } from "../src/domain/integrity.js";
import { createSeed } from "../src/services/seed.js";

test("money totals remain exact integer cents", () => {
  assert.equal(lineTotalCents(3, 1999), 5997);
  assert.equal(
    orderTotalCents([
      { quantity: 3, unitPriceCents: 1999 },
      { quantity: 2, unitPriceCents: 1 },
    ]),
    5999,
  );
  for (const [quantity, price] of [
    [0, 10],
    [1.5, 10],
    [1, -1],
    [1, 2.5],
    [2, Number.MAX_SAFE_INTEGER],
  ]) {
    assert.throws(() => lineTotalCents(quantity, price), RangeError);
  }
  assert.throws(() => orderTotalCents([]), RangeError);
  assert.throws(
    () =>
      orderTotalCents([
        { quantity: 1, unitPriceCents: Number.MAX_SAFE_INTEGER },
        { quantity: 1, unitPriceCents: 1 },
      ]),
    RangeError,
  );
});

test("seed records have unique IDs, linked customers and correct totals", () => {
  const data = createSeed(new Date("2026-10-14T12:00:00Z"));
  assert.equal(validateDatabase(data), data);
  assert.equal(data.orders.length, 32);
  assert.equal(data.customers.length, 8);
  const broken = structuredClone(data);
  broken.orders[0].customerId = "missing";
  assert.throws(() => validateDatabase(broken));
  broken.orders[0] = { ...data.orders[0], totalCents: 1 };
  assert.throws(() => validateDatabase(broken));
  broken.orders[0] = { ...data.orders[0], id: data.orders[1].id };
  assert.throws(() => validateDatabase(broken));
  const duplicateCustomer = structuredClone(data);
  duplicateCustomer.customers[1].email = duplicateCustomer.customers[0].email;
  assert.throws(() => validateDatabase(duplicateCustomer));
});

test("filters combine customer search, status and inclusive dates without mutating data", () => {
  const data = createSeed(new Date("2026-10-14T12:00:00Z"));
  const snapshot = JSON.stringify(data);
  assert.equal(filterOrders(data.orders, { search: "  OLIVIA  " }, data.customers).length, 4);
  assert.equal(filterOrders(data.orders, { startDate: "2026-10-14", endDate: "2026-10-14" }).length, 1);
  assert.equal(filterOrders(data.orders, { search: "NX-1048", status: "paid" }).length, 0);
  assert.equal(filterOrders(data.orders, { search: "NX-1048", status: "cancelled" }).length, 1);
  assert.equal(filterOrders(data.orders, { startDate: "2026-10-15" }).length, 0);
  assert.equal(JSON.stringify(data), snapshot);
});
