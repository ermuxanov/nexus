import { ORDER_STATUSES, validateDatabase } from "./integrity.js";
import { orderTotalCents } from "./money.js";
import { orderDateError } from "./orders.js";

export class OrderValidationError extends Error {
  constructor(errors) {
    super("Review the highlighted order fields.");
    this.name = "OrderValidationError";
    this.errors = errors;
  }
}

export function priceToCents(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new RangeError("Enter a non-negative USD price with up to 2 decimals.");
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Price exceeds the supported limit.");
  return Number(cents);
}
export function centsToPrice(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export function orderDraft(order, now = new Date()) {
  return {
    customerId: order?.customerId || "",
    date: new Date(order?.createdAt || now).toISOString().slice(0, 10),
    status: order?.status || "pending",
    items: order
      ? order.items.map((item) => ({
          name: item.name,
          quantity: String(item.quantity),
          price: centsToPrice(item.unitPriceCents),
        }))
      : [{ name: "", quantity: "1", price: "" }],
  };
}
export function validateOrderDraft(draft, customers, original = null) {
  const errors = {};
  if (!customers.some((customer) => customer.id === draft.customerId))
    errors.customerId = "Choose an existing customer.";
  if (!ORDER_STATUSES.includes(draft.status)) errors.status = "Choose a valid status.";
  if (!draft.date || orderDateError({ startDate: draft.date })) errors.date = "Enter a valid order date (YYYY-MM-DD).";
  const items = [];
  let financialError = false;
  if (!draft.items.length) errors.items = "Add at least one line item.";
  draft.items.forEach((item, index) => {
    const name = item.name.trim();
    if (!name) errors[`items.${index}.name`] = "Enter an item name.";
    let quantity, unitPriceCents;
    try {
      if (!/^[1-9]\d*$/.test(String(item.quantity))) throw new Error();
      quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity)) throw new Error();
    } catch {
      errors[`items.${index}.quantity`] = "Use a whole quantity of at least 1.";
      financialError = true;
    }
    try {
      unitPriceCents = priceToCents(item.price);
    } catch (error) {
      errors[`items.${index}.price`] = error.message;
      financialError = true;
    }
    items.push({ name, quantity, unitPriceCents });
  });
  let totalCents = null;
  if (!financialError && items.length) {
    try {
      totalCents = orderTotalCents(items);
    } catch (error) {
      errors.items = error.message;
    }
  }
  let payload = null;
  if (!Object.keys(errors).length) {
    const unchangedDate = original && new Date(original.createdAt).toISOString().slice(0, 10) === draft.date;
    payload = {
      customerId: draft.customerId,
      status: draft.status,
      createdAt: unchangedDate ? original.createdAt : `${draft.date}T00:00:00.000Z`,
      currency: "USD",
      items,
      totalCents,
    };
  }
  return { errors, payload, totalCents };
}

export function highestOrderSequence(orders, sequence = "0") {
  if (typeof sequence !== "string" || !/^(0|[1-9]\d*)$/.test(sequence)) throw new RangeError("Invalid order sequence.");
  let maximum = BigInt(sequence);
  for (const { id } of orders) {
    const match = /^NX-(\d+)$/.exec(id);
    if (match && BigInt(match[1]) > maximum) maximum = BigInt(match[1]);
  }
  return String(maximum);
}
export function nextOrderId(orders, sequence = "0") {
  return `NX-${String(BigInt(highestOrderSequence(orders, sequence)) + 1n).padStart(4, "0")}`;
}
export function orderFingerprint(order) {
  return JSON.stringify([
    order.id,
    order.customerId,
    order.createdAt,
    order.status,
    order.currency,
    order.items.map(({ name, quantity, unitPriceCents }) => [name, quantity, unitPriceCents]),
    order.totalCents,
  ]);
}
export function saveOrderRecord(data, input, id = null, expected = null) {
  validateDatabase(data);
  const original = id ? data.orders.find((order) => order.id === id) : null;
  if (id && !original) throw new Error("This order no longer exists. Refresh the listing.");
  if (id && (!expected || orderFingerprint(original) !== orderFingerprint(expected)))
    throw new Error("This order changed since it was opened. Close the editor, refresh, and reopen it before saving.");
  if (!input || !Array.isArray(input.items)) throw new OrderValidationError({ items: "Add valid line items." });
  if (
    input.currency !== "USD" ||
    typeof input.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(input.createdAt) ||
    orderDateError({ startDate: input.createdAt.slice(0, 10) }) ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    throw new Error("Choose a valid UTC order date and USD currency.");
  // Revalidate at the persistence boundary, never trust a client-provided total.
  const record = {
    id: id || nextOrderId(data.orders, data.orderSequence),
    customerId: input.customerId,
    createdAt: new Date(input.createdAt).toISOString(),
    status: input.status,
    currency: "USD",
    items: input.items.map((item) => ({
      name: typeof item.name === "string" ? item.name.trim() : "",
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    totalCents: orderTotalCents(input.items),
  };
  const next = {
    ...data,
    orders: id ? data.orders.map((order) => (order.id === id ? record : order)) : [...data.orders, record],
  };
  next.orderSequence = highestOrderSequence(next.orders, data.orderSequence);
  validateDatabase(next);
  // Bound the entire workspace so every date/status subset remains safe for analytics.
  const workspaceTotal = next.orders.reduce((sum, order) => sum + BigInt(order.totalCents), 0n);
  if (workspaceTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("The workspace total exceeds the supported limit. Reduce the order amount and try again.");
  }
  return { data: next, record };
}
