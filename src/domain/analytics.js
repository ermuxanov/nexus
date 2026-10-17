import { validateDatabase, ORDER_STATUSES } from "./integrity.js";

const DAY = 86400000;

// Complete UTC days give both periods the same duration and exclude partial-day bias.
export function analyticsPeriods(days, now = new Date()) {
  if (![7, 30, 90].includes(days) || !Number.isFinite(now.getTime())) {
    throw new RangeError("Choose a valid analytics period.");
  }
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = end - days * DAY;
  return { start, end, previousStart: start - days * DAY, days };
}

export function sumCents(orders) {
  return orders.reduce((sum, order) => {
    const value = sum + order.totalCents;
    if (!Number.isSafeInteger(order.totalCents) || order.totalCents < 0 || !Number.isSafeInteger(value)) {
      throw new RangeError("Revenue exceeds the supported integer-cent limit.");
    }
    return value;
  }, 0);
}

export function compareMetric(current, previous) {
  return {
    previous,
    delta: current - previous,
    percent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

function aggregate(orders) {
  const paid = orders.filter((order) => order.status === "paid");
  return {
    revenueCents: sumCents(paid),
    orderCount: orders.length,
    activeCustomers: new Set(paid.map((order) => order.customerId)).size,
    // The mock API contains no visitor/session denominator. Never infer one from customers.
    conversionRate: null,
  };
}

export function buildAnalytics(data, days, now = new Date()) {
  validateDatabase(data);
  const period = analyticsPeriods(days, now);
  const inRange = (start, end) =>
    data.orders.filter((order) => {
      const time = Date.parse(order.createdAt);
      return time >= start && time < end;
    });
  const orders = inRange(period.start, period.end);
  const previous = aggregate(inRange(period.previousStart, period.start));
  const current = aggregate(orders);
  const daily = Array.from({ length: days }, (_, index) => ({
    date: new Date(period.start + index * DAY).toISOString().slice(0, 10),
    revenueCents: 0,
    paidOrders: 0,
  }));
  for (const order of orders.filter((order) => order.status === "paid")) {
    const bucket = daily[Math.floor((Date.parse(order.createdAt) - period.start) / DAY)];
    bucket.revenueCents = sumCents([{ totalCents: bucket.revenueCents }, order]);
    bucket.paidOrders += 1;
  }
  const customers = new Map(data.customers.map((customer) => [customer.id, customer]));
  return {
    period,
    current,
    previous,
    comparisons: Object.fromEntries(
      ["revenueCents", "orderCount", "activeCustomers"].map((key) => [key, compareMetric(current[key], previous[key])]),
    ),
    daily,
    breakdown: ORDER_STATUSES.map((status) => {
      const matching = orders.filter((order) => order.status === status);
      return { status, count: matching.length, amountCents: sumCents(matching) };
    }),
    recentOrders: [...orders]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
      .slice(0, 5)
      .map((order) => ({ ...order, customer: customers.get(order.customerId) })),
  };
}

export function formatMoney(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("Invalid USD amount.");
  // Keep the fractional cents exact even at the upper safe-integer boundary.
  const amount = BigInt(cents);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .formatToParts(amount / 100n)
    .map((part) => (part.type === "fraction" ? String(amount % 100n).padStart(2, "0") : part.value))
    .join("");
}

export function formatDay(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}
