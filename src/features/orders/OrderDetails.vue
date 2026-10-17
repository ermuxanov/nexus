<script>
import UModal from "@nuxt/ui/components/Modal.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { createOrderDetails } from "../../store/orderDetails.js";
import { formatMoney } from "../../domain/analytics.js";
import { lineTotalCents } from "../../domain/money.js";
import "./order-dialog.scss";
import "./order-details.scss";

export default {
  name: "OrderDetails",
  components: { UModal, BaseButton, StatusBadge, StatePanel, AppIcon },
  props: { orderId: { type: String, required: true } },
  emits: ["close", "edit", "deleted"],
  data() {
    const details = createOrderDetails();
    return { details, state: details.state, confirming: false };
  },
  computed: {
    order() {
      return this.state.data?.order;
    },
    customer() {
      return this.state.data?.customer;
    },
    title() {
      return this.confirming ? `Delete order ${this.orderId}?` : `Order ${this.orderId}`;
    },
    timestamp() {
      if (!this.order) return "";
      return (
        new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(this.order.createdAt)) + " UTC"
      );
    },
  },
  watch: {
    orderId: {
      immediate: true,
      handler() {
        this.reload();
      },
    },
  },
  mounted() {
    window.addEventListener("beforeunload", this.beforeUnload);
  },
  beforeUnmount() {
    this.details.cancel();
    window.removeEventListener("beforeunload", this.beforeUnload);
  },
  methods: {
    formatMoney,
    lineTotalCents,
    reload() {
      if (this.state.deleting) return;
      this.confirming = false;
      this.details.load(this.orderId);
    },
    beforeUnload(event) {
      if (!this.state.deleting) return;
      event.preventDefault();
      event.returnValue = "";
    },
    requestClose() {
      if (this.state.deleting) return;
      if (this.confirming) this.cancelDelete();
      else this.$emit("close");
    },
    confirmDelete() {
      this.confirming = true;
      this.$nextTick(() => this.$refs.cancelDelete?.$el.focus());
    },
    cancelDelete() {
      if (this.state.deleting) return;
      this.confirming = false;
      this.state.deleteError = "";
      this.$nextTick(() => this.$refs.deleteButton?.$el.focus());
    },
    async remove() {
      if (!this.confirming || this.state.deleting) return;
      const deleted = await this.details.remove();
      if (deleted) this.$emit("deleted", deleted);
      else this.$nextTick(() => this.$refs.deleteError?.focus());
    },
  },
};
</script>

<template>
  <UModal
    :open="true"
    :title="title"
    :description="
      confirming
        ? 'Review this order before permanently deleting it.'
        : 'Customer, line items and total · USD · UTC dates'
    "
    :close="false"
    :dismissible="false"
    :transition="false"
    :ui="{
      overlay: 'order-dialog-overlay',
      content: 'order-dialog order-details-dialog',
      header: 'order-dialog-header',
      title: 'order-dialog-title',
      description: 'order-dialog-description',
      body: 'order-dialog-body',
      footer: 'order-dialog-footer',
    }"
    @close:prevent="requestClose"
    @update:open="!$event && requestClose()"
  >
    <template #actions>
      <button
        type="button"
        class="icon-button"
        aria-label="Close order details"
        :disabled="state.deleting"
        @click="requestClose"
      >
        <AppIcon name="close" :size="18" />
      </button>
    </template>
    <template #body>
      <StatePanel
        v-if="state.status === 'idle' || state.status === 'loading'"
        state="loading"
        title="Loading order"
        description="Reading the latest saved order and customer…"
      />
      <StatePanel
        v-else-if="state.status === 'error'"
        state="error"
        title="Order could not be loaded"
        :description="state.error"
        @retry="reload"
      />
      <StatePanel
        v-else-if="state.status === 'missing'"
        state="empty"
        title="Order no longer exists"
        description="Close the details and refresh the listing to see current orders."
      />
      <template v-else-if="order">
        <section v-if="confirming" class="order-delete-notice" aria-labelledby="order-delete-heading">
          <h3 id="order-delete-heading">This cannot be undone</h3>
          <p>
            Order {{ order.id }} for {{ customer.name }} will be removed from this workspace. Its amount will no longer
            contribute to Overview totals.
          </p>
        </section>
        <div v-if="state.deleteError" ref="deleteError" class="order-delete-error" role="alert" tabindex="-1">
          <p>{{ state.deleteError }}</p>
          <BaseButton :disabled="state.deleting" @click="reload">Refresh order</BaseButton>
        </div>
        <dl class="order-details-meta">
          <div>
            <dt>Customer</dt>
            <dd>
              {{ customer.name }}<span>{{ customer.company }}</span>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge :tone="order.status">{{ order.status }}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt>Customer email</dt>
            <dd>{{ customer.email }}</dd>
          </div>
          <div>
            <dt>Order date · UTC</dt>
            <dd>
              <time :datetime="order.createdAt">{{ timestamp }}</time>
            </dd>
          </div>
        </dl>
        <section class="order-details-items" aria-labelledby="order-items-title">
          <h3 id="order-items-title">Line items</h3>
          <p id="order-items-help" class="order-details-scroll-help">
            On smaller screens, scroll horizontally to see quantities and exact USD amounts.
          </p>
          <div
            class="order-details-table"
            tabindex="0"
            role="region"
            aria-label="Order line items"
            aria-describedby="order-items-help"
          >
            <table>
              <caption class="visually-hidden">
                {{
                  `${order.id} line items · amounts in USD`
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit price · USD</th>
                  <th scope="col">Line total · USD</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in order.items" :key="index">
                  <th scope="row">{{ item.name }}</th>
                  <td>{{ item.quantity }}</td>
                  <td>{{ formatMoney(item.unitPriceCents) }}</td>
                  <td>{{ formatMoney(lineTotalCents(item.quantity, item.unitPriceCents)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
    <template #footer>
      <div v-if="order" class="order-details-total">
        <span>Total · USD</span><strong>{{ formatMoney(order.totalCents) }}</strong>
      </div>
      <div v-if="confirming" class="order-details-actions">
        <BaseButton ref="cancelDelete" :disabled="state.deleting" @click="cancelDelete">Keep order</BaseButton>
        <BaseButton variant="destructive" :loading="state.deleting" @click="remove">Delete permanently</BaseButton>
      </div>
      <div v-else class="order-details-actions">
        <BaseButton v-if="order" ref="deleteButton" variant="destructive" @click="confirmDelete"
          >Delete order</BaseButton
        >
        <BaseButton @click="requestClose">Close</BaseButton>
        <BaseButton v-if="order" variant="primary" @click="$emit('edit', order)">Edit order</BaseButton>
      </div>
    </template>
  </UModal>
</template>
