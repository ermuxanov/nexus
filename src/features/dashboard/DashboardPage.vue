<script>
import BaseButton from "../../components/ui/BaseButton.vue";
import BaseSelect from "../../components/ui/BaseSelect.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import RevenueChart from "../../components/dashboard/RevenueChart.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { createAnalyticsStore } from "../../store/analytics.js";
import { formatMoney, formatDay } from "../../domain/analytics.js";
import { preferencesStore } from "../../store/preferences.js";
import "./dashboard.scss";

export default {
  name: "DashboardPage",
  components: { BaseButton, BaseSelect, StatePanel, StatusBadge, RevenueChart, AppIcon },
  data() {
    const store = createAnalyticsStore();
    return {
      store,
      analytics: store.state,
      days: preferencesStore.state.data.reportingDays,
      lastResult: null,
      ranges: [7, 30, 90].map((value) => ({ value: String(value), label: `Last ${value} complete days` })),
    };
  },
  computed: {
    result() {
      return this.analytics.result || this.lastResult;
    },
    cards() {
      if (!this.result) return [];
      const { current, comparisons } = this.result;
      return [
        {
          label: "Revenue",
          value: formatMoney(current.revenueCents),
          comparison: this.comparison(comparisons.revenueCents, true),
          note: "Paid orders · USD",
        },
        {
          label: "Orders",
          value: current.orderCount.toLocaleString("en-US"),
          comparison: this.comparison(comparisons.orderCount),
          note: "All order statuses",
        },
        {
          label: "Active customers",
          value: current.activeCustomers.toLocaleString("en-US"),
          comparison: this.comparison(comparisons.activeCustomers),
          note: "Customers with paid orders",
        },
        {
          label: "Conversion",
          value: "N/A",
          comparison: { label: "Traffic not measured", direction: "unavailable", previous: "" },
          note: "No visitor / session data",
        },
      ];
    },
    periodLabel() {
      return `${formatDay(this.result.period.start)} – ${formatDay(this.result.period.end - 1)}`;
    },
    previousLabel() {
      return `${formatDay(this.result.period.previousStart)} – ${formatDay(this.result.period.start - 1)}`;
    },
  },
  watch: {
    "analytics.result"(value) {
      if (value) this.lastResult = value;
    },
    days() {
      this.load();
    },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    this.store.cancel();
  },
  methods: {
    formatMoney,
    formatDay,
    load() {
      return this.store.load(Number(this.days));
    },
    comparison(value, money = false) {
      const previous = money ? formatMoney(value.previous) : value.previous.toLocaleString("en-US");
      if (value.percent === null) return { label: "No prior baseline", previous, direction: "unavailable" };
      if (value.percent === 0) return { label: "No change", previous, direction: "flat" };
      const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(
        value.percent,
      );
      return { label: `${percent}%`, previous, direction: value.percent > 0 ? "up" : "down" };
    },
  },
};
</script>

<template>
  <div class="page dashboard-page">
    <div class="dashboard-heading">
      <div>
        <h1>Business overview</h1>
        <div v-if="result" class="analytics-period" role="status">
          <span>{{ periodLabel }} <b>UTC</b></span
          ><span>vs {{ previousLabel }}</span>
        </div>
        <p v-else>Revenue, orders, and customer activity.</p>
        <p class="dashboard-update-status" role="status">
          {{
            analytics.refreshing || (analytics.status === "loading" && result)
              ? "Updating · showing last completed results"
              : ""
          }}
        </p>
      </div>
      <div class="dashboard-controls">
        <BaseSelect id="analytics-period" v-model="days" label="Reporting period" :options="ranges" /><BaseButton
          :loading="analytics.status === 'loading' || analytics.refreshing"
          @click="load"
          ><AppIcon
            v-if="!analytics.refreshing && analytics.status !== 'loading'"
            name="retry"
            :size="15"
          />Refresh</BaseButton
        >
      </div>
    </div>
    <StatePanel
      v-if="!result && (analytics.status === 'idle' || analytics.status === 'loading')"
      state="loading"
      title="Loading analytics"
      description="Calculating your reporting period…"
    />
    <StatePanel
      v-else-if="!result && analytics.status === 'error'"
      state="error"
      title="Analytics could not be loaded"
      :description="analytics.error"
      @retry="load"
    />
    <div
      v-else-if="result"
      class="dashboard-results"
      :aria-busy="analytics.refreshing || analytics.status === 'loading'"
      :inert="analytics.status === 'loading' || undefined"
    >
      <div v-if="analytics.error" class="analytics-refresh-error" role="alert">
        <span>Update failed. Showing last completed results. {{ analytics.error }}</span
        ><BaseButton @click="load">Try again</BaseButton>
      </div>
      <section class="kpi-grid" aria-label="Key performance indicators">
        <article v-for="card in cards" :key="card.label" class="analytics-panel kpi-card">
          <h2>{{ card.label }}</h2>
          <p class="kpi-value">{{ card.value }}</p>
          <p class="kpi-comparison" :class="`kpi-comparison--${card.comparison.direction}`">
            <span v-if="['up', 'down'].includes(card.comparison.direction)" aria-hidden="true">{{
              card.comparison.direction === "up" ? "↗" : "↘"
            }}</span>
            {{ card.comparison.label
            }}<span v-if="card.comparison.previous" class="kpi-previous"
              ><span class="kpi-comparison-separator" aria-hidden="true"> · </span
              >{{ card.comparison.previous }} prior</span
            >
          </p>
          <p class="analytics-muted">{{ card.note }}</p>
        </article>
      </section>
      <StatePanel
        v-if="!result.current.orderCount"
        state="empty"
        title="No orders in this period"
        description="Try a longer reporting period or refresh after demo data changes. Metrics below reflect this empty period."
      />
      <div class="analytics-grid">
        <section class="analytics-panel revenue-panel" aria-labelledby="revenue-heading">
          <div class="analytics-panel-heading">
            <div>
              <h2 id="revenue-heading">Revenue analytics</h2>
              <p class="analytics-muted">Paid orders · daily totals · USD</p>
            </div>
            <strong>{{ formatMoney(result.current.revenueCents) }}</strong>
          </div>
          <RevenueChart :days="result.daily" />
        </section>
        <section class="analytics-panel" aria-labelledby="sales-heading">
          <div class="analytics-panel-heading">
            <div>
              <h2 id="sales-heading">Sales overview</h2>
              <p class="analytics-muted">{{ result.current.orderCount }} orders in this period</p>
            </div>
          </div>
          <div v-for="row in result.breakdown" :key="row.status" class="sales-row" :class="`sales-row--${row.status}`">
            <div>
              <StatusBadge :tone="row.status">{{ row.status }}</StatusBadge
              ><span
                >{{ row.count }} {{ row.count === 1 ? "order" : "orders" }} ·
                {{ result.current.orderCount ? Math.round((row.count / result.current.orderCount) * 100) : 0 }}% of
                orders</span
              >
            </div>
            <strong>{{ formatMoney(row.amountCents) }}</strong
            ><progress
              :value="row.count"
              :max="Math.max(1, result.current.orderCount)"
              :aria-label="`${row.status} share of orders`"
              :aria-valuetext="`${row.count} of ${result.current.orderCount} orders, ${result.current.orderCount ? Math.round((row.count / result.current.orderCount) * 100) : 0}%`"
            />
          </div>
          <p class="analytics-footnote">Paid = earned revenue.<br />Pending & cancelled amounts are excluded.</p>
        </section>
      </div>
      <section class="analytics-panel recent-panel" aria-labelledby="recent-heading">
        <div class="analytics-panel-heading">
          <div>
            <h2 id="recent-heading">Recent orders</h2>
          </div>
          <RouterLink class="dashboard-link" to="/orders">Orders workspace →</RouterLink>
        </div>
        <StatePanel
          v-if="!result.recentOrders.length"
          state="empty"
          title="No recent orders"
          description="No orders were created in the selected period."
        />
        <template v-else>
          <p id="recent-scroll-help" class="table-scroll-hint">
            <span aria-hidden="true">↔</span> Scroll horizontally to see all columns
          </p>
          <div
            class="analytics-table-wrap"
            tabindex="0"
            role="region"
            aria-label="Recent orders table, scroll horizontally if needed"
            aria-describedby="recent-scroll-help"
          >
            <table>
              <caption class="visually-hidden">
                Latest five orders in the reporting period, dates in UTC
              </caption>
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col">Amount · USD</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="order in result.recentOrders" :key="order.id">
                  <th scope="row">{{ order.id }}</th>
                  <td>
                    <strong>{{ order.customer.name }}</strong
                    ><span class="customer-company">{{ order.customer.company }}</span>
                  </td>
                  <td>{{ formatDay(order.createdAt) }}</td>
                  <td>
                    <StatusBadge :tone="order.status">{{ order.status }}</StatusBadge>
                  </td>
                  <td>{{ formatMoney(order.totalCents) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
      <details class="analytics-methodology">
        <summary>About these numbers <span>Local demo · USD · complete UTC days</span></summary>
        <p>
          Revenue includes paid orders only, grouped by order creation date; payment timestamps are unavailable. Active
          customers are unique customers with at least one paid order in the selected period, including zero-dollar paid
          orders. Conversion is unavailable because visitor/session counts are not measured. Comparisons use the
          preceding {{ result.period.days }} complete UTC days. Today is excluded from both metrics and recent orders.
        </p>
      </details>
    </div>
  </div>
</template>
