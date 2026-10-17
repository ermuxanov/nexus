import { filterOrders } from "./filters.js";

const DAY = 86400000;
function dateBoundary(value) {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError("Choose a valid calendar date.");
  }
  return time;
}

export function orderDateError({ startDate = "", endDate = "" } = {}) {
  try {
    const start = dateBoundary(startDate);
    const end = dateBoundary(endDate);
    return start !== null && end !== null && start > end ? "End date must be on or after start date." : "";
  } catch (error) {
    return error.message;
  }
}

// Inclusive UTC calendar dates; order timestamps and financial values stay unformatted.
export function queryOrders(
  data,
  {
    search = "",
    status = "all",
    startDate = "",
    endDate = "",
    sortBy = "date",
    direction = "desc",
    page = 1,
    pageSize = 10,
  } = {},
) {
  const error = orderDateError({ startDate, endDate });
  if (error) throw new RangeError(error);
  if (
    ![10, 20, 50].includes(pageSize) ||
    !["date", "amount"].includes(sortBy) ||
    !["asc", "desc"].includes(direction)
  ) {
    throw new RangeError("Invalid order sorting or page size.");
  }
  const start = dateBoundary(startDate);
  const end = dateBoundary(endDate);
  const customers = new Map(data.customers.map((customer) => [customer.id, customer]));
  const matching = filterOrders(data.orders, { search, status }, data.customers).filter((order) => {
    const time = Date.parse(order.createdAt);
    return (start === null || time >= start) && (end === null || time < end + DAY);
  });
  const sign = direction === "asc" ? 1 : -1;
  matching.sort((a, b) => {
    const primary =
      sortBy === "amount" ? a.totalCents - b.totalCents : Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return sign * primary || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const total = matching.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pageCount, Math.max(1, Number.isInteger(page) ? page : 1));
  const offset = (current - 1) * pageSize;
  return {
    rows: matching
      .slice(offset, offset + pageSize)
      .map((order) => ({ ...order, customer: customers.get(order.customerId) })),
    total,
    page: current,
    pageCount,
    from: total ? offset + 1 : 0,
    to: Math.min(offset + pageSize, total),
  };
}
