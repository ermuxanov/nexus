<script>
import BaseInput from "../../components/ui/BaseInput.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import BaseSelect from "../../components/ui/BaseSelect.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import CustomerDialog from "./CustomerDialog.vue";
import { createCustomersStore } from "../../store/customers.js";
import { queryCustomers, customerMetrics } from "../../domain/customers.js";
import { formatMoney } from "../../domain/analytics.js";
import { preferencesStore } from "../../store/preferences.js";
import "./customers.scss";

export default {
  name: "CustomersPage",
  components: { BaseInput, BaseButton, BaseSelect, AppIcon, StatePanel, CustomerDialog },
  data() {
    const store = createCustomersStore();
    return {
      store,
      state: store.state,
      search: "",
      sortBy: "name",
      direction: "asc",
      page: 1,
      pageSize: preferencesStore.state.data.rowsPerPage,
      dialog: null,
      dialogKey: 0,
      returnFocus: null,
      message: "",
      sizes: [10, 20, 50].map((size) => ({ value: String(size), label: `${size} rows` })),
    };
  },
  computed: {
    result() {
      return queryCustomers(this.state.data || { customers: [], orders: [] }, {
        search: this.search,
        sortBy: this.sortBy,
        direction: this.direction,
        page: this.page,
        pageSize: Number(this.pageSize),
      });
    },
    summary() {
      const data = this.state.data || { customers: [], orders: [] };
      return {
        total: data.customers.length,
        withOrders: new Set(data.orders.map((order) => order.customerId)).size,
        ...customerMetrics(data.orders),
      };
    },
  },
  watch: {
    search() {
      this.page = 1;
    },
    pageSize() {
      this.page = 1;
    },
    "state.data"() {
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
    const dialog = this.$refs.dialog;
    if (dialog && (dialog.state.busy || dialog.dirty)) {
      dialog.requestClose();
      return false;
    }
    return true;
  },
  methods: {
    formatMoney,
    initials(name) {
      return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
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
    open(customer, event, edit = false) {
      this.returnFocus = event.currentTarget;
      this.message = "";
      this.dialogKey++;
      this.dialog = { id: customer?.id || null, edit };
    },
    close() {
      this.dialog = null;
      this.$nextTick(() => (this.returnFocus?.isConnected ? this.returnFocus.focus() : this.$refs.heading?.focus()));
    },
    async changed(customer, removed = false) {
      this.dialog = null;
      this.message = `${customer.name} ${removed ? "deleted" : "saved"} successfully.`;
      await this.store.load();
      if (!removed && !this.result.rows.some((row) => row.id === customer.id))
        this.message += " Your current search or page may hide this customer.";
      this.$nextTick(() => this.$refs.heading?.focus());
    },
  },
};
</script>

<template>
  <div class="page customers-page">
    <header class="customers-heading">
      <div>
        <h1 ref="heading" tabindex="-1">Customers</h1>
        <p>The people behind your business.</p>
      </div>
      <div class="customer-actions">
        <BaseButton variant="primary" :disabled="!state.data" @click="open(null, $event)"
          ><AppIcon name="plus" :size="16" />Create customer</BaseButton
        ><BaseButton :loading="state.status === 'loading' || state.refreshing" @click="store.load()"
          ><AppIcon v-if="state.status !== 'loading' && !state.refreshing" name="retry" :size="16" />Refresh</BaseButton
        >
      </div>
    </header>
    <p v-if="message" class="customer-success" role="status">{{ message }}</p>
    <div v-if="state.data" class="customer-summary" :aria-busy="state.refreshing">
      <article>
        <span>Total customers</span><strong>{{ summary.total }}</strong>
        <p>Across your workspace</p>
      </article>
      <article>
        <span>With orders</span><strong>{{ summary.withOrders }}</strong>
        <p>Customers with order history</p>
      </article>
      <article>
        <span>Paid revenue · USD</span><strong>{{ formatMoney(summary.revenueCents) }}</strong>
        <p>All time · paid orders only</p>
      </article>
    </div>
    <section
      class="customers-panel"
      aria-labelledby="customer-directory-title"
      :aria-busy="state.status === 'loading' || state.refreshing"
    >
      <div class="customer-directory-heading">
        <div>
          <h2 id="customer-directory-title">Customer directory</h2>
          <p role="status">
            {{
              state.refreshing
                ? "Updating · showing last completed results"
                : state.data
                  ? `${result.total} ${result.total === 1 ? "customer" : "customers"} found`
                  : "Reading saved customers…"
            }}
          </p>
        </div>
        <div class="customer-search">
          <BaseInput
            id="customers-search"
            v-model="search"
            type="search"
            label="Search customers"
            placeholder="Name, email, company or ID"
          /><BaseButton v-if="search" @click="search = ''">Clear search</BaseButton>
        </div>
      </div>
      <div v-if="state.error && state.data" class="customer-notice customer-error" role="alert">
        <p>Refresh failed. Showing last completed results. {{ state.error }}</p>
        <BaseButton @click="store.load()">Try again</BaseButton>
      </div>
      <StatePanel
        v-if="state.status === 'idle' || state.status === 'loading'"
        state="loading"
        title="Loading customers"
        description="Reading customer details and order history…"
      />
      <StatePanel
        v-else-if="state.status === 'error'"
        state="error"
        title="Customers could not be loaded"
        :description="state.error"
        @retry="store.load()"
      />
      <StatePanel
        v-else-if="!result.total"
        state="empty"
        :title="search ? 'No matching customers' : 'Your next relationship starts here'"
        :description="
          search
            ? 'Try another name, email or company, or clear your search.'
            : 'Create your first customer to start building their order history.'
        "
      />
      <template v-else>
        <p id="customer-scroll-hint" class="customer-list-scroll-hint">
          Scroll horizontally to see all customer details.
        </p>
        <div
          class="customer-table-wrap"
          tabindex="0"
          role="region"
          aria-label="Customer directory table"
          aria-describedby="customer-scroll-hint"
        >
          <table class="customer-directory-table">
            <caption class="visually-hidden">
              Customer directory · all-time paid revenue in USD
            </caption>
            <thead>
              <tr>
                <th scope="col" :aria-sort="sortState('name')">
                  <button type="button" :aria-label="sortLabel('name')" @click="sort('name')">
                    Customer
                    <span aria-hidden="true">{{ sortBy === "name" ? (direction === "asc" ? "↑" : "↓") : "↕" }}</span>
                  </button>
                </th>
                <th scope="col">Company</th>
                <th scope="col" :aria-sort="sortState('orders')">
                  <button type="button" :aria-label="sortLabel('orders')" @click="sort('orders')">
                    Orders
                    <span aria-hidden="true">{{ sortBy === "orders" ? (direction === "asc" ? "↑" : "↓") : "↕" }}</span>
                  </button>
                </th>
                <th scope="col" :aria-sort="sortState('revenue')">
                  <button type="button" :aria-label="sortLabel('revenue')" @click="sort('revenue')">
                    Paid revenue · USD
                    <span aria-hidden="true">{{ sortBy === "revenue" ? (direction === "asc" ? "↑" : "↓") : "↕" }}</span>
                  </button>
                </th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="customer in result.rows" :key="customer.id">
                <th scope="row">
                  <div class="customer-identity">
                    <span class="customer-avatar" aria-hidden="true">{{ initials(customer.name) }}</span>
                    <div>
                      <button
                        type="button"
                        class="customer-name-link"
                        :aria-label="`View customer ${customer.name}`"
                        @click="open(customer, $event)"
                      >
                        {{ customer.name }}</button
                      ><span class="customer-email">{{ customer.email }}</span>
                    </div>
                  </div>
                </th>
                <td class="customers-company-cell">{{ customer.company }}</td>
                <td class="customer-number">{{ customer.orderCount }}</td>
                <td class="customer-number">{{ formatMoney(customer.revenueCents) }}</td>
                <td>
                  <BaseButton :aria-label="`Edit customer ${customer.name}`" @click="open(customer, $event, true)"
                    >Edit</BaseButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-if="state.data" class="customer-pagination">
        <p>{{ result.from }}–{{ result.to }} of {{ result.total }} customers</p>
        <BaseSelect id="customers-page-size" v-model="pageSize" label="Rows per page" :options="sizes" />
        <nav aria-label="Customers pagination">
          <BaseButton :disabled="result.page <= 1" @click="page = result.page - 1">Previous</BaseButton
          ><span>Page {{ result.page }} of {{ result.pageCount }}</span
          ><BaseButton :disabled="result.page >= result.pageCount" @click="page = result.page + 1">Next</BaseButton>
        </nav>
      </div>
    </section>
    <CustomerDialog
      v-if="dialog"
      :key="dialogKey"
      ref="dialog"
      :customer-id="dialog.id"
      :initial-edit="dialog.edit"
      @close="close"
      @saved="changed($event)"
      @deleted="changed($event, true)"
    />
  </div>
</template>
