import { validateDatabase } from "./integrity.js";

export class CustomerValidationError extends Error {
  constructor(errors) {
    super("Review the highlighted customer fields.");
    this.name = "CustomerValidationError";
    this.errors = errors;
  }
}

export function customerDraft(customer = null) {
  return { name: customer?.name || "", email: customer?.email || "", company: customer?.company || "" };
}

export function validateCustomerDraft(draft) {
  const errors = {};
  const payload = Object.fromEntries(
    ["name", "email", "company"].map((key) => [key, typeof draft?.[key] === "string" ? draft[key].trim() : ""]),
  );
  if (!payload.name || payload.name.length > 120) errors.name = "Enter a name of 1–120 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254)
    errors.email = "Enter a valid email address, up to 254 characters.";
  if (!payload.company || payload.company.length > 160) errors.company = "Enter a company of 1–160 characters.";
  return { errors, payload: Object.keys(errors).length ? null : payload };
}

export function customerFingerprint(customer) {
  return JSON.stringify([customer.id, customer.name, customer.email, customer.company]);
}

export function highestCustomerSequence(customers, sequence = "0") {
  if (typeof sequence !== "string" || !/^(0|[1-9]\d*)$/.test(sequence)) throw new Error("Invalid customer sequence.");
  let highest = BigInt(sequence);
  for (const { id } of customers) {
    const match = /^cus_(\d+)$/.exec(id);
    if (match && BigInt(match[1]) > highest) highest = BigInt(match[1]);
  }
  return String(highest);
}

export function saveCustomerRecord(data, input, id = null, expected = null, remove = false) {
  validateDatabase(data);
  const original = id ? data.customers.find((customer) => customer.id === id) : null;
  if (id && !original) throw new Error("This customer no longer exists. Close the dialog and refresh the list.");
  if (id && (!expected || customerFingerprint(original) !== customerFingerprint(expected)))
    throw new Error("This customer changed since it was opened. Close the dialog, refresh and review it again.");
  if (remove && (!original || data.orders.some((order) => order.customerId === id)))
    throw new Error("Customers with linked orders cannot be deleted. Their order history must be preserved.");
  let record = original;
  if (!remove) {
    const validation = validateCustomerDraft(input);
    if (!validation.payload) throw new CustomerValidationError(validation.errors);
    if (
      data.customers.some(
        (customer) => customer.id !== id && customer.email.toLowerCase() === validation.payload.email.toLowerCase(),
      )
    )
      throw new CustomerValidationError({ email: "A customer with this email already exists." });
    record = {
      id:
        id ||
        `cus_${String(BigInt(highestCustomerSequence(data.customers, data.customerSequence)) + 1n).padStart(2, "0")}`,
      ...validation.payload,
    };
  }
  const customers = remove
    ? data.customers.filter((customer) => customer.id !== id)
    : id
      ? data.customers.map((customer) => (customer.id === id ? record : customer))
      : [...data.customers, record];
  const next = {
    ...data,
    customers,
    customerSequence: highestCustomerSequence([...data.customers, ...customers], data.customerSequence),
  };
  validateDatabase(next);
  return { data: next, record };
}

export function customerMetrics(orders) {
  const paid = orders.filter((order) => order.status === "paid");
  const cents = paid.reduce((sum, order) => sum + BigInt(order.totalCents), 0n);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Customer revenue exceeds the supported limit.");
  return { orderCount: orders.length, paidCount: paid.length, revenueCents: Number(cents) };
}

export function queryCustomers(
  data,
  { search = "", sortBy = "name", direction = "asc", page = 1, pageSize = 10 } = {},
) {
  if (
    !["name", "orders", "revenue"].includes(sortBy) ||
    !["asc", "desc"].includes(direction) ||
    ![10, 20, 50].includes(pageSize)
  )
    throw new RangeError("Invalid customer sorting or page size.");
  const orders = new Map();
  for (const order of data.orders) {
    if (!orders.has(order.customerId)) orders.set(order.customerId, []);
    orders.get(order.customerId).push(order);
  }
  const term = search.trim().toLowerCase();
  const rows = data.customers
    .filter((customer) =>
      [customer.id, customer.name, customer.email, customer.company].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
    .map((customer) => ({ ...customer, ...customerMetrics(orders.get(customer.id) || []) }));
  const sign = direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const primary =
      sortBy === "name"
        ? a.name.localeCompare(b.name, "en", { sensitivity: "base" })
        : sortBy === "orders"
          ? a.orderCount - b.orderCount
          : a.revenueCents - b.revenueCents;
    return sign * primary || a.id.localeCompare(b.id, "en");
  });
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pageCount, Math.max(1, Number.isInteger(page) ? page : 1));
  const offset = (current - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize),
    total,
    page: current,
    pageCount,
    from: total ? offset + 1 : 0,
    to: Math.min(offset + pageSize, total),
  };
}
