import { validateDatabase } from "./integrity.js";
import { highestOrderSequence, orderFingerprint } from "./orderEditor.js";

export function deleteOrderRecord(data, id, expected) {
  validateDatabase(data);
  const record = data.orders.find((order) => order.id === id);
  if (!record) throw new Error("This order no longer exists. Close the details and refresh the listing.");
  if (!expected || orderFingerprint(record) !== orderFingerprint(expected))
    throw new Error("This order changed since it was opened. Refresh the order and review it before deleting.");
  const next = {
    ...data,
    orderSequence: highestOrderSequence(data.orders, data.orderSequence),
    orders: data.orders.filter((order) => order.id !== id),
  };
  validateDatabase(next);
  return { data: next, record };
}
