export function lineTotalCents(quantity, unitPriceCents) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new RangeError("Quantity and price must be valid integers.");
  }
  const result = quantity * unitPriceCents;
  if (!Number.isSafeInteger(result)) throw new RangeError("Amount exceeds the supported limit.");
  return result;
}

export function orderTotalCents(items) {
  if (!Array.isArray(items) || !items.length) throw new RangeError("An order needs at least one item.");
  return items.reduce((sum, item) => {
    const total = sum + lineTotalCents(item.quantity, item.unitPriceCents);
    if (!Number.isSafeInteger(total)) throw new RangeError("Amount exceeds the supported limit.");
    return total;
  }, 0);
}
