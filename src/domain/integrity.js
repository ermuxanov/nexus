import { orderTotalCents } from "./money.js";

export const ORDER_STATUSES = ["paid", "pending", "cancelled"];
export function validateDatabase(data) {
  if (!data || !Array.isArray(data.customers) || !Array.isArray(data.orders)) throw new Error("Invalid demo database.");
  const customerIds = new Set();
  const emails = new Set();
  let maximumCustomerSequence = 0n;
  for (const customer of data.customers) {
    if (
      typeof customer.id !== "string" ||
      !customer.id ||
      customerIds.has(customer.id) ||
      typeof customer.name !== "string" ||
      !customer.name.trim() ||
      typeof customer.company !== "string" ||
      typeof customer.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
      emails.has(customer.email.toLowerCase())
    )
      throw new Error("Invalid or duplicate customer.");
    customerIds.add(customer.id);
    emails.add(customer.email.toLowerCase());
    const match = /^cus_(\d+)$/.exec(customer.id);
    if (match && BigInt(match[1]) > maximumCustomerSequence) maximumCustomerSequence = BigInt(match[1]);
  }
  if (
    data.customerSequence !== undefined &&
    (typeof data.customerSequence !== "string" ||
      !/^(0|[1-9]\d*)$/.test(data.customerSequence) ||
      BigInt(data.customerSequence) < maximumCustomerSequence)
  )
    throw new Error("Invalid customer sequence.");
  const orderIds = new Set();
  let maximumSequence = 0n;
  for (const order of data.orders) {
    if (
      typeof order.id !== "string" ||
      !order.id ||
      orderIds.has(order.id) ||
      !customerIds.has(order.customerId) ||
      !ORDER_STATUSES.includes(order.status) ||
      typeof order.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(order.createdAt) ||
      !Number.isFinite(Date.parse(order.createdAt)) ||
      order.currency !== "USD"
    )
      throw new Error("Invalid order or customer relationship.");
    if (
      !Array.isArray(order.items) ||
      order.items.some((item) => typeof item.name !== "string" || !item.name.trim()) ||
      orderTotalCents(order.items) !== order.totalCents
    )
      throw new Error("Order total does not match its items.");
    orderIds.add(order.id);
    const match = /^NX-(\d+)$/.exec(order.id);
    if (match && BigInt(match[1]) > maximumSequence) maximumSequence = BigInt(match[1]);
  }
  if (
    data.orderSequence !== undefined &&
    (typeof data.orderSequence !== "string" ||
      !/^(0|[1-9]\d*)$/.test(data.orderSequence) ||
      BigInt(data.orderSequence) < maximumSequence)
  )
    throw new Error("Invalid order sequence.");
  return data;
}
