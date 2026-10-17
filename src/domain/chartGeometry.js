// Presentation only. No interpolation of business data or financial aggregation.
export function revenueScale(values) {
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) throw new RangeError("Invalid chart cents.");
  const maximum = Math.max(100, ...values);
  const target = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= target);
  const ceiling = Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(maximum / step) * step);
  const count = Math.ceil(maximum / step);
  const ticks = Array.from({ length: count + 1 }, (_, index) => Math.max(0, ceiling - index * step));
  ticks[ticks.length - 1] = 0;
  return { ceiling, ticks };
}
export function chartPoints(values, width, height, ceiling, inset = 8) {
  return values.map((value, index) => ({
    x: inset + (values.length > 1 ? index / (values.length - 1) : 0.5) * Math.max(0, width - inset * 2),
    y: inset + (1 - value / ceiling) * (height - inset * 2),
  }));
}
export function nearestDay(x, width, count, inset = 8) {
  if (count <= 1 || width <= inset * 2) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(((x - inset) / (width - inset * 2)) * (count - 1))));
}
export function dateTickIndices(count, slots = 3) {
  if (!count) return [];
  return [...new Set(Array.from({ length: slots }, (_, index) => Math.round(((count - 1) * index) / (slots - 1))))];
}
