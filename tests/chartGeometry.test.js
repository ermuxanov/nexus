import test from "node:test";
import assert from "node:assert/strict";
import { revenueScale, chartPoints, nearestDay, dateTickIndices } from "../src/domain/chartGeometry.js";

test("revenue axes include zero and cover actual cents with useful tick spacing", () => {
  assert.deepEqual(revenueScale([0, 158000, 2900]), { ceiling: 200000, ticks: [200000, 150000, 100000, 50000, 0] });
  for (const values of [[], [0, 0], [1, 2], [Number.MAX_SAFE_INTEGER]]) {
    const scale = revenueScale(values);
    assert.ok(scale.ceiling >= Math.max(0, ...values));
    assert.equal(scale.ticks.at(-1), 0);
    assert.ok(scale.ticks.every(Number.isSafeInteger));
    assert.ok(scale.ticks.every((value, index) => !index || value < scale.ticks[index - 1]));
  }
  assert.throws(() => revenueScale([-1]));
  assert.throws(() => revenueScale([1.5]));
});

test("chart geometry preserves one point per observed day including zero totals at every size", () => {
  const values = [0, 50000, 0, 200000];
  for (const width of [200, 375, 560, 1000]) {
    const points = chartPoints(values, width, 220, 200000);
    assert.equal(points.length, values.length);
    assert.deepEqual(points[0], { x: 8, y: 212 });
    assert.equal(points.at(-1).x, width - 8);
    assert.equal(points.at(-1).y, 8);
    assert.equal(points[1].y, 161);
    assert.equal(points[2].y, 212);
    assert.deepEqual(values, [0, 50000, 0, 200000]);
    assert.equal(chartPoints([0], width, 200, 100)[0].x, width / 2);
  }
});

test("pointer inspection clamps endpoints and maps every rendered point to its actual day", () => {
  for (const count of [7, 30, 90]) {
    for (const width of [200, 540, 1000]) {
      const points = chartPoints(Array(count).fill(0), width, 220, 100);
      assert.deepEqual(
        points.map((point) => nearestDay(point.x, width, count)),
        Array.from({ length: count }, (_, i) => i),
      );
      assert.equal(nearestDay(-100, width, count), 0);
      assert.equal(nearestDay(width + 100, width, count), count - 1);
    }
  }
  assert.equal(nearestDay(10, 16, 7), 0);
});

test("date axis uses actual bucket indices and keeps endpoints without duplicates", () => {
  assert.deepEqual(dateTickIndices(7), [0, 3, 6]);
  assert.deepEqual(dateTickIndices(90, 2), [0, 89]);
  assert.deepEqual(dateTickIndices(1), [0]);
  assert.deepEqual(dateTickIndices(0), []);
});
