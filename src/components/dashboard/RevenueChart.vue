<script>
import USlider from "@nuxt/ui/components/Slider.vue";
import { formatMoney, formatDay } from "../../domain/analytics.js";
import { revenueScale, chartPoints, nearestDay, dateTickIndices } from "../../domain/chartGeometry.js";

export default {
  name: "RevenueChart",
  components: { USlider },
  props: { days: { type: Array, required: true } },
  data() {
    return { selected: 0, width: 600, height: 220, pointerActive: false, observer: null };
  },
  computed: {
    scale() {
      return revenueScale(this.days.map((day) => day.revenueCents));
    },
    points() {
      return chartPoints(
        this.days.map((day) => day.revenueCents),
        this.width,
        this.height,
        this.scale.ceiling,
      );
    },
    line() {
      return this.points.map((point) => `${point.x},${point.y}`).join(" ");
    },
    selectedDay() {
      return this.days[this.selected];
    },
    selectedPoint() {
      return this.points[this.selected];
    },
    dateTicks() {
      return dateTickIndices(this.days.length, this.width < 300 ? 2 : 3);
    },
    tooltipStyle() {
      return {
        left: `${Math.max(0, Math.min(this.width - 170, this.selectedPoint.x - 85))}px`,
        top: `${this.selectedPoint.y < 95 ? 108 : 8}px`,
      };
    },
    valueText() {
      return `${formatDay(this.selectedDay.date)}: ${formatMoney(this.selectedDay.revenueCents)} revenue, ${this.selectedDay.paidOrders} paid orders`;
    },
    description() {
      return `Daily paid-order revenue in USD from ${formatDay(this.days[0].date)} to ${formatDay(this.days.at(-1).date)}. Straight segments connect actual daily totals, including zero-revenue days. Use the day slider or daily data table for exact amounts.`;
    },
  },
  watch: {
    days(next, previous) {
      if (next.length !== previous?.length || next[0].date !== previous?.[0]?.date) this.selected = 0;
      this.pointerActive = false;
    },
  },
  mounted() {
    this.observer = new ResizeObserver(([entry]) => {
      this.width = Math.max(32, entry.contentRect.width);
      this.height = entry.contentRect.height;
    });
    this.observer.observe(this.$refs.plot);
  },
  beforeUnmount() {
    this.observer?.disconnect();
  },
  methods: {
    formatMoney,
    formatDay,
    shortDate(value) {
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(value),
      );
    },
    axisMoney(value) {
      return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100);
    },
    inspect(event) {
      if (event.type === "pointermove" && event.pointerType !== "mouse" && !event.buttons) return;
      const rect = this.$refs.plot.getBoundingClientRect();
      this.selected = nearestDay(event.clientX - rect.left, rect.width, this.days.length);
      this.pointerActive = true;
    },
    keyboardInspect(value) {
      this.selected = value;
      this.pointerActive = false;
    },
  },
};
</script>

<template>
  <div class="revenue-chart">
    <div class="chart-drawing">
      <div class="chart-y-axis" aria-hidden="true">
        <span
          v-for="(tick, index) in scale.ticks"
          :key="index"
          :style="{ top: `${8 + (1 - tick / scale.ceiling) * (height - 16)}px` }"
          >{{ axisMoney(tick) }}</span
        >
      </div>
      <div
        ref="plot"
        class="chart-plot"
        @pointermove="inspect"
        @pointerdown="inspect"
        @pointerleave="pointerActive = false"
      >
        <svg
          :viewBox="`0 0 ${width} ${height}`"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="revenue-chart-title revenue-chart-description"
        >
          <title id="revenue-chart-title">Revenue by day</title>
          <desc id="revenue-chart-description">{{ description }}</desc>
          <line
            v-for="(tick, index) in scale.ticks"
            :key="index"
            x1="8"
            :x2="width - 8"
            :y1="8 + (1 - tick / scale.ceiling) * (height - 16)"
            :y2="8 + (1 - tick / scale.ceiling) * (height - 16)"
            class="chart-grid"
          />
          <polygon :points="`8,${height - 8} ${line} ${width - 8},${height - 8}`" class="chart-area" />
          <polyline :points="line" class="chart-line" />
          <line :x1="selectedPoint.x" :x2="selectedPoint.x" y1="8" :y2="height - 8" class="chart-guide" />
          <circle :cx="selectedPoint.x" :cy="selectedPoint.y" r="7" class="chart-point-ring" />
          <circle :cx="selectedPoint.x" :cy="selectedPoint.y" r="4.5" class="chart-point" />
        </svg>
        <div v-if="pointerActive" class="chart-tooltip" :style="tooltipStyle" aria-hidden="true">
          <span>{{ formatDay(selectedDay.date) }}</span
          ><strong>{{ formatMoney(selectedDay.revenueCents) }}</strong
          ><span>{{ selectedDay.paidOrders }} paid {{ selectedDay.paidOrders === 1 ? "order" : "orders" }}</span>
        </div>
      </div>
    </div>
    <div class="chart-x-axis" aria-hidden="true">
      <span v-for="index in dateTicks" :key="index">{{ shortDate(days[index].date) }}</span>
    </div>
    <p v-if="days.every((day) => day.revenueCents === 0)" class="chart-zero">
      No paid revenue in this period · zero baseline
    </p>
    <div class="chart-inspector">
      <div class="chart-readout" aria-live="polite" aria-atomic="true">
        <time :datetime="selectedDay.date">{{ formatDay(selectedDay.date) }}</time
        ><span
          >Revenue <b>{{ formatMoney(selectedDay.revenueCents) }}</b></span
        ><span
          ><b>{{ selectedDay.paidOrders }}</b> paid {{ selectedDay.paidOrders === 1 ? "order" : "orders" }}</span
        >
      </div>
      <div class="chart-slider-row">
        <span id="revenue-day-label">Inspect day</span
        ><USlider
          id="revenue-day"
          :model-value="selected"
          :min="0"
          :max="days.length - 1"
          :step="1"
          aria-labelledby="revenue-day-label"
          aria-describedby="revenue-day-help"
          :aria-valuetext="valueText"
          @update:model-value="keyboardInspect"
        />
      </div>
      <div class="chart-inspector-foot">
        <span id="revenue-day-help" class="visually-hidden"
          >Use Arrow keys to inspect days, Home / End to jump to the first or last day.</span
        >
        <details class="chart-data">
          <summary>Daily data</summary>
          <div
            class="analytics-table-wrap"
            tabindex="0"
            role="region"
            aria-label="Daily revenue table, scroll horizontally if needed"
          >
            <table>
              <caption>
                Daily revenue · USD · UTC
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Paid orders</th>
                  <th scope="col">Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in days" :key="day.date">
                  <th scope="row">{{ formatDay(day.date) }}</th>
                  <td>{{ day.paidOrders }}</td>
                  <td>{{ formatMoney(day.revenueCents) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>
