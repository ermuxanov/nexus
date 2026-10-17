<script>
import BaseInput from "../../components/ui/BaseInput.vue";
import BaseDateInput from "../../components/ui/BaseDateInput.vue";
import BaseSelect from "../../components/ui/BaseSelect.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import OrderForm from "./OrderForm.vue";
import OrderDetails from "./OrderDetails.vue";
import { createOrdersStore } from "../../store/orders.js";
import { queryOrders, orderDateError } from "../../domain/orders.js";
import { formatDay, formatMoney } from "../../domain/analytics.js";
import { preferencesStore } from "../../store/preferences.js";
import "./orders.scss";

export default {
  name: "OrdersPage",
  components: {
    BaseInput,
    BaseDateInput,
    BaseSelect,
    BaseButton,
    StatusBadge,
    StatePanel,
    AppIcon,
    OrderForm,
    OrderDetails,
  },
  data() {
    const store = createOrdersStore();
    return {
      store,
      orders: store.state,
      filters: { search: "", status: "all", startDate: "", endDate: "" },
      dateDrafts: { startDate: "", endDate: "" },
      dateReset: 0,
      editorOpen: false,
      editingOrder: null,
      detailsOpen: false,
      detailsOrderId: "",
      returnFocus: null,
      saveMessage: "",
      sortBy: "date",
      direction: "desc",
      page: 1,
      pageSize: preferencesStore.state.data.rowsPerPage,
      statuses: [
        { value: "all", label: "All statuses" },
        ...["paid", "pending", "cancelled"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
      ],
      sizes: [10, 20, 50].map((size) => ({ value: String(size), label: `${size} rows` })),
    };
  },
  computed: {
    dateError() {
      return orderDateError(this.filters);
    },
    rangeError() {
      if (orderDateError({ startDate: this.filters.startDate }) || orderDateError({ endDate: this.filters.endDate }))
        return "";
      return this.dateError;
    },
    hasFilters() {
      return (
        this.filters.search !== "" ||
        this.filters.status !== "all" ||
        !!this.filters.startDate ||
        !!this.filters.endDate ||
        !!this.dateDrafts.startDate ||
        !!this.dateDrafts.endDate
      );
    },
    result() {
      return queryOrders(
        this.dateError ? { orders: [], customers: [] } : this.orders.data || { orders: [], customers: [] },
        {
          ...this.filters,
          ...(this.dateError ? { startDate: "", endDate: "" } : {}),
          sortBy: this.sortBy,
          direction: this.direction,
          page: this.page,
          pageSize: Number(this.pageSize),
        },
      );
    },
  },
  watch: {
    filters: {
      deep: true,
      handler() {
        this.page = 1;
      },
    },
    pageSize() {
      this.page = 1;
    },
    sortBy() {
      this.page = 1;
    },
    direction() {
      this.page = 1;
    },
    "orders.data"() {
      this.page = this.result.page;
    },
  },
  mounted() {
    this.store.load();
  },
  beforeUnmount() {
    this.store.cancel();
  },
  beforeRouteLeave() {
    if (this.$refs.orderDetails?.state.deleting) return false;
    const form = this.$refs.orderForm;
    if (form && (form.dirty || form.mutation.saving)) {
      form.requestClose();
      return false;
    }
    return true;
  },
  methods: {
    formatDay,
    formatMoney,
    openEditor(order, event) {
      this.returnFocus = event.currentTarget;
      this.editingOrder = order;
      this.saveMessage = "";
      this.editorOpen = true;
    },
    openDetails(order, event) {
      this.returnFocus = event.currentTarget;
      this.detailsOrderId = order.id;
      this.saveMessage = "";
      this.detailsOpen = true;
    },
    closeDetails() {
      this.detailsOpen = false;
      this.restoreFocus();
    },
    editFromDetails(order) {
      this.detailsOpen = false;
      this.editingOrder = order;
      this.editorOpen = true;
    },
    restoreFocus() {
      this.$nextTick(() =>
        this.returnFocus?.isConnected ? this.returnFocus.focus() : this.$refs.ordersHeading?.focus(),
      );
    },
    closeEditor() {
      this.editorOpen = false;
      this.restoreFocus();
    },
    async orderSaved(order) {
      this.editorOpen = false;
      this.saveMessage = `Order ${order.id} saved successfully.`;
      await this.store.load();
      if (!this.result.rows.some((row) => row.id === order.id))
        this.saveMessage += " Your current filters or page may hide it.";
      this.$nextTick(() => this.$refs.ordersHeading?.focus());
    },
    async orderDeleted(order) {
      this.detailsOpen = false;
      this.saveMessage = `Order ${order.id} deleted successfully.`;
      await this.store.load();
      this.$nextTick(() => this.$refs.ordersHeading?.focus());
    },
    clearFilters() {
      this.filters = { search: "", status: "all", startDate: "", endDate: "" };
      this.dateDrafts = { startDate: "", endDate: "" };
      this.dateReset += 1;
      this.page = 1;
    },
    sort(field) {
      this.direction = this.sortBy === field && this.direction === "asc" ? "desc" : "asc";
      this.sortBy = field;
      this.page = 1;
    },
    sortState(field) {
      return this.sortBy === field ? (this.direction === "asc" ? "ascending" : "descending") : "none";
    },
    sortLabel(field) {
      return `Sort by ${field}, ${this.sortBy === field && this.direction === "asc" ? "descending" : "ascending"}`;
    },
  },
};
</script>

<template>
  <div class="page orders-page">
    <header class="orders-heading">
      <div>
        <h1 ref="ordersHeading" tabindex="-1">Orders</h1>
        <p>Track every order, from pending to paid.</p>
      </div>
      <div class="orders-heading-actions">
        <BaseButton
          variant="primary"
          :disabled="!orders.data || !orders.data.customers.length"
          @click="openEditor(null, $event)"
          >Create order</BaseButton
        ><BaseButton :loading="orders.status === 'loading' || orders.refreshing" @click="store.load()"
          ><AppIcon
            v-if="orders.status !== 'loading' && !orders.refreshing"
            name="retry"
            :size="15"
          />Refresh</BaseButton
        >
      </div>
    </header>
    <p v-if="saveMessage" class="orders-save-message" role="status">{{ saveMessage }}</p>
    <section class="orders-panel" aria-label="Filter orders">
      <div class="orders-filters">
        <BaseInput
          id="orders-search"
          v-model="filters.search"
          type="search"
          label="Search orders"
          placeholder="Order ID or customer name"
        />
        <BaseSelect id="orders-status" v-model="filters.status" label="Status" :options="statuses" />
        <BaseDateInput
          :key="`start-${dateReset}`"
          id="orders-start"
          v-model="filters.startDate"
          label="From date · UTC"
          :max="filters.endDate || undefined"
          @draft-change="dateDrafts.startDate = $event"
        />
        <BaseDateInput
          :key="`end-${dateReset}`"
          id="orders-end"
          v-model="filters.endDate"
          label="To date · UTC"
          :min="filters.startDate || undefined"
          :error="rangeError"
          @draft-change="dateDrafts.endDate = $event"
        />
      </div>
      <div class="orders-filter-footer">
        <span>Inclusive dates · all persisted demo orders</span
        ><BaseButton :disabled="!hasFilters" @click="clearFilters">Clear filters</BaseButton>
      </div>
    </section>
    <section
      class="orders-panel orders-results"
      aria-labelledby="orders-results-title"
      :aria-busy="orders.status === 'loading' || orders.refreshing"
    >
      <div class="orders-results-heading">
        <h2 id="orders-results-title">All orders</h2>
        <p role="status" aria-live="polite">
          {{
            orders.refreshing
              ? "Updating · showing last completed results"
              : orders.data
                ? `${result.total} ${result.total === 1 ? "order" : "orders"} found`
                : "Reading persisted records…"
          }}
        </p>
      </div>
      <div v-if="orders.error && orders.data" class="orders-error" role="alert">
        <span>Refresh failed. Showing last completed results. {{ orders.error }}</span
        ><BaseButton @click="store.load()">Try again</BaseButton>
      </div>
      <StatePanel
        v-if="orders.status === 'idle' || orders.status === 'loading'"
        state="loading"
        title="Loading orders"
        description="Reading orders and customer details…"
      />
      <StatePanel
        v-else-if="orders.status === 'error'"
        state="error"
        title="Orders could not be loaded"
        :description="orders.error"
        @retry="store.load()"
      />
      <StatePanel v-else-if="dateError" state="empty" title="Choose a valid date range" :description="dateError" />
      <StatePanel
        v-else-if="!result.total"
        state="empty"
        :title="hasFilters ? 'No matching orders' : 'No orders yet'"
        :description="
          hasFilters
            ? 'Adjust your search or clear the filters to see more orders.'
            : 'No orders are stored in this demo workspace.'
        "
      />
      <template v-else>
        <p id="orders-scroll-help" class="orders-scroll-help">
          ↔ Scroll horizontally to see all columns on smaller screens.
        </p>
        <div
          class="orders-table-wrap"
          tabindex="0"
          role="region"
          aria-label="Orders table"
          aria-describedby="orders-scroll-help"
        >
          <table>
            <caption class="visually-hidden">
              Orders · amounts in USD · dates in UTC
            </caption>
            <thead>
              <tr>
                <th scope="col">Order ID</th>
                <th scope="col">Customer</th>
                <th scope="col" :aria-sort="sortState('date')">
                  <button :aria-label="sortLabel('date')" @click="sort('date')">
                    Date
                    <span aria-hidden="true">{{ sortBy === "date" ? (direction === "asc" ? "↑" : "↓") : "↕" }}</span>
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col" :aria-sort="sortState('amount')">
                  <button :aria-label="sortLabel('amount')" @click="sort('amount')">
                    Amount · USD
                    <span aria-hidden="true">{{ sortBy === "amount" ? (direction === "asc" ? "↑" : "↓") : "↕" }}</span>
                  </button>
                </th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in result.rows" :key="order.id">
                <th scope="row">
                  <button
                    type="button"
                    class="orders-id-link"
                    :aria-label="`View order ${order.id}`"
                    @click="openDetails(order, $event)"
                  >
                    {{ order.id }}
                  </button>
                </th>
                <td>
                  <strong>{{ order.customer.name }}</strong
                  ><span class="orders-company">{{ order.customer.company }}</span>
                </td>
                <td>
                  <time :datetime="order.createdAt">{{ formatDay(order.createdAt) }}</time>
                </td>
                <td>
                  <StatusBadge :tone="order.status">{{ order.status }}</StatusBadge>
                </td>
                <td>{{ formatMoney(order.totalCents) }}</td>
                <td>
                  <BaseButton :aria-label="`Edit order ${order.id}`" @click="openEditor(order, $event)"
                    >Edit</BaseButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-if="orders.data" class="orders-pagination">
        <p>{{ result.from }}–{{ result.to }} of {{ result.total }} orders</p>
        <BaseSelect id="orders-page-size" v-model="pageSize" label="Rows per page" :options="sizes" />
        <nav aria-label="Orders pagination">
          <BaseButton :disabled="result.page <= 1 || !!dateError" @click="page = result.page - 1">Previous</BaseButton
          ><span>Page {{ result.page }} of {{ result.pageCount }}</span
          ><BaseButton :disabled="result.page >= result.pageCount || !!dateError" @click="page = result.page + 1"
            >Next</BaseButton
          >
        </nav>
      </div>
    </section>
    <OrderForm
      v-if="editorOpen"
      ref="orderForm"
      :order="editingOrder"
      :customers="orders.data.customers"
      @close="closeEditor"
      @saved="orderSaved"
    />
    <OrderDetails
      v-if="detailsOpen"
      ref="orderDetails"
      :order-id="detailsOrderId"
      @close="closeDetails"
      @edit="editFromDetails"
      @deleted="orderDeleted"
    />
  </div>
</template>
