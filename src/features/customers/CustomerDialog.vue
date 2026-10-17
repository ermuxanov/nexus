<script>
import UModal from "@nuxt/ui/components/Modal.vue";
import BaseInput from "../../components/ui/BaseInput.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import StatePanel from "../../components/ui/StatePanel.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { createCustomerSession } from "../../store/customers.js";
import { customerDraft, validateCustomerDraft, customerMetrics } from "../../domain/customers.js";
import { formatMoney, formatDay } from "../../domain/analytics.js";
import "../orders/order-dialog.scss";

export default {
  name: "CustomerDialog",
  components: { UModal, BaseInput, BaseButton, StatePanel, StatusBadge, AppIcon },
  props: { customerId: { type: String, default: null }, initialEdit: Boolean },
  emits: ["close", "saved", "deleted"],
  data() {
    const session = createCustomerSession();
    return {
      session,
      state: session.state,
      editing: !this.customerId,
      draft: customerDraft(),
      baseline: "",
      submitted: false,
      discard: false,
      confirming: false,
      orderPage: 1,
    };
  },
  computed: {
    customer() {
      return this.state.data?.customer;
    },
    dirty() {
      return this.editing && JSON.stringify(this.draft) !== this.baseline;
    },
    validation() {
      return validateCustomerDraft(this.draft);
    },
    errors() {
      return { ...(this.submitted ? this.validation.errors : {}), ...this.state.fieldErrors };
    },
    metrics() {
      return customerMetrics(this.state.data?.orders || []);
    },
    orderPages() {
      return Math.max(1, Math.ceil((this.state.data?.orders.length || 0) / 5));
    },
    orderRows() {
      return [...(this.state.data?.orders || [])]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
        .slice((this.orderPage - 1) * 5, this.orderPage * 5);
    },
    title() {
      return this.confirming
        ? "Delete customer?"
        : this.editing
          ? this.customerId
            ? "Edit customer"
            : "Create customer"
          : "Customer profile";
    },
  },
  async mounted() {
    window.addEventListener("beforeunload", this.beforeUnload);
    this.baseline = JSON.stringify(this.draft);
    if (this.customerId) {
      await this.reload();
      if (this.initialEdit && this.customer) this.startEdit();
    }
  },
  beforeUnmount() {
    this.session.cancel();
    window.removeEventListener("beforeunload", this.beforeUnload);
  },
  methods: {
    formatMoney,
    formatDay,
    changeOrderPage(page) {
      this.orderPage = Math.min(this.orderPages, Math.max(1, page));
      this.$nextTick(() => this.$refs.history?.focus());
    },
    initials(name) {
      return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    },
    async reload() {
      if (this.state.busy) return;
      this.confirming = false;
      this.editing = false;
      this.orderPage = 1;
      await this.session.load(this.customerId);
    },
    startEdit() {
      this.draft = customerDraft(this.customer);
      this.baseline = JSON.stringify(this.draft);
      this.submitted = false;
      this.state.mutationError = "";
      this.state.fieldErrors = {};
      this.editing = true;
      this.$nextTick(() => this.$refs.form?.querySelector("input")?.focus());
    },
    beforeUnload(event) {
      if (!this.dirty && !this.state.busy) return;
      event.preventDefault();
      event.returnValue = "";
    },
    requestClose() {
      if (this.state.busy) return;
      if (this.discard) {
        this.keepEditing();
        return;
      }
      if (this.confirming) {
        this.cancelDelete();
        return;
      }
      if (this.dirty) {
        this.discard = true;
        this.$nextTick(() => this.$refs.keep?.$el.focus());
      } else this.$emit("close");
    },
    keepEditing() {
      this.discard = false;
      this.$nextTick(() => this.$refs.form?.querySelector("input")?.focus());
    },
    confirmDelete() {
      if (this.metrics.orderCount || this.state.busy) return;
      this.confirming = true;
      this.$nextTick(() => this.$refs.keepCustomer?.$el.focus());
    },
    cancelDelete() {
      this.confirming = false;
      this.state.mutationError = "";
      this.$nextTick(() => this.$refs.delete?.$el.focus());
    },
    async submit() {
      if (this.state.busy || this.discard) return;
      this.submitted = true;
      this.state.fieldErrors = {};
      if (!this.validation.payload) {
        this.$nextTick(() => this.$refs.error?.focus());
        return;
      }
      const saved = await this.session.save(this.validation.payload, this.customer || null);
      if (saved) {
        this.baseline = JSON.stringify(this.draft);
        this.$emit("saved", saved);
      } else this.$nextTick(() => this.$refs.error?.focus());
    },
    async remove() {
      if (!this.confirming || this.state.busy) return;
      const deleted = await this.session.remove();
      if (deleted) this.$emit("deleted", deleted);
      else this.$nextTick(() => this.$refs.error?.focus());
    },
  },
};
</script>

<template>
  <UModal
    :open="true"
    :title="title"
    :description="
      confirming ? 'Review this customer before permanently deleting them.' : 'Contact details and order history · USD'
    "
    :close="false"
    :dismissible="false"
    :transition="false"
    :ui="{
      overlay: 'order-dialog-overlay',
      content: 'order-dialog customer-dialog',
      header: 'order-dialog-header',
      title: 'order-dialog-title',
      description: 'order-dialog-description',
      body: 'order-dialog-body',
      footer: 'order-dialog-footer',
    }"
    @close:prevent="requestClose"
    @update:open="!$event && requestClose"
  >
    <template #actions
      ><button
        type="button"
        class="icon-button"
        aria-label="Close customer dialog"
        :disabled="state.busy"
        @click="requestClose"
      >
        <AppIcon name="close" :size="18" /></button
    ></template>
    <template #body>
      <StatePanel
        v-if="customerId && (state.status === 'idle' || state.status === 'loading')"
        state="loading"
        title="Loading customer"
        description="Reading the latest customer and order history…"
      />
      <StatePanel
        v-else-if="state.status === 'error'"
        state="error"
        title="Customer could not be loaded"
        :description="state.error"
        @retry="reload"
      />
      <StatePanel
        v-else-if="state.status === 'missing'"
        state="empty"
        title="Customer no longer exists"
        description="Close this dialog and refresh the list to see current customers."
      />
      <template v-else>
        <section v-if="discard" class="customer-notice" role="alert" aria-labelledby="customer-discard-title">
          <h3 id="customer-discard-title">Discard unsaved changes?</h3>
          <p>Your changes have not been saved.</p>
          <div class="customer-actions">
            <BaseButton ref="keep" @click="keepEditing">Keep editing</BaseButton
            ><BaseButton variant="destructive" @click="$emit('close')">Discard changes</BaseButton>
          </div>
        </section>
        <div
          v-if="state.mutationError || (submitted && Object.keys(errors).length)"
          ref="error"
          class="customer-notice customer-error"
          role="alert"
          tabindex="-1"
        >
          <p>{{ state.mutationError || "Review the highlighted fields. Your input has been kept." }}</p>
          <BaseButton v-if="!editing && customerId" :disabled="state.busy" @click="reload">Refresh customer</BaseButton>
        </div>
        <form
          v-if="editing"
          id="customer-form"
          ref="form"
          novalidate
          :inert="discard || undefined"
          @submit.prevent="submit"
        >
          <fieldset class="customer-fields" :disabled="state.busy" :aria-busy="state.busy">
            <legend class="visually-hidden">Customer contact details</legend>
            <BaseInput
              id="customer-name"
              v-model="draft.name"
              label="Full name"
              autocomplete="name"
              :error="errors.name"
              maxlength="120"
              placeholder="e.g. Alex Morgan"
            />
            <BaseInput
              id="customer-email"
              v-model="draft.email"
              label="Email address"
              type="email"
              autocomplete="email"
              :error="errors.email"
              maxlength="254"
              placeholder="alex@company.com"
            />
            <BaseInput
              id="customer-company"
              v-model="draft.company"
              label="Company"
              autocomplete="organization"
              :error="errors.company"
              maxlength="160"
              placeholder="Company or independent business"
            />
          </fieldset>
          <p class="customer-caption">All fields are required. Each customer needs a unique email address.</p>
        </form>
        <template v-else-if="customer">
          <section v-if="confirming" class="customer-notice" aria-labelledby="customer-delete-title">
            <h3 id="customer-delete-title">This cannot be undone</h3>
            <p>
              {{ customer.name }} at {{ customer.company }} will be permanently removed. This customer has no linked
              orders.
            </p>
          </section>
          <div class="customer-profile">
            <span class="customer-avatar customer-avatar--large" aria-hidden="true">{{ initials(customer.name) }}</span>
            <div>
              <h3>{{ customer.name }}</h3>
              <p>{{ customer.company }}</p>
              <p>{{ customer.email }}</p>
              <span class="customer-caption">{{ customer.id }}</span>
            </div>
          </div>
          <dl class="customer-profile-metrics">
            <div>
              <dt>Orders</dt>
              <dd>{{ metrics.orderCount }}</dd>
            </div>
            <div>
              <dt>Paid orders</dt>
              <dd>{{ metrics.paidCount }}</dd>
            </div>
            <div>
              <dt>Paid revenue · USD</dt>
              <dd>{{ formatMoney(metrics.revenueCents) }}</dd>
            </div>
          </dl>
          <div class="customer-history-heading">
            <h3>Order history</h3>
            <span>All time · UTC dates</span>
          </div>
          <p v-if="!metrics.orderCount" class="customer-empty-history">
            No orders yet. This customer's first order will appear here.
          </p>
          <template v-else>
            <p id="customer-history-hint" class="customer-caption">
              On smaller screens, scroll horizontally to see all columns.
            </p>
            <div
              ref="history"
              class="customer-table-wrap"
              tabindex="0"
              role="region"
              aria-label="Customer order history"
              aria-describedby="customer-history-hint"
            >
              <table class="customer-history-table">
                <caption class="visually-hidden">
                  {{
                    customer.name
                  }}
                  order history · USD · UTC dates
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Date · UTC</th>
                    <th scope="col">Status</th>
                    <th scope="col">Amount · USD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="order in orderRows" :key="order.id">
                    <th scope="row">{{ order.id }}</th>
                    <td>{{ formatDay(order.createdAt) }}</td>
                    <td>
                      <StatusBadge :tone="order.status">{{ order.status }}</StatusBadge>
                    </td>
                    <td>{{ formatMoney(order.totalCents) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <nav
              v-if="orderPages > 1"
              class="customer-history-pagination"
              aria-label="Customer order history pagination"
            >
              <BaseButton :disabled="orderPage <= 1" @click="changeOrderPage(orderPage - 1)">Previous orders</BaseButton
              ><span role="status">Page {{ orderPage }} of {{ orderPages }}</span
              ><BaseButton :disabled="orderPage >= orderPages" @click="changeOrderPage(orderPage + 1)"
                >Next orders</BaseButton
              >
            </nav>
            <p class="customer-caption">
              Customers with linked orders cannot be deleted. Their order history is preserved.
            </p>
          </template>
        </template>
      </template>
    </template>
    <template #footer>
      <span class="customer-caption">{{
        editing ? "Customer details" : "Paid revenue includes paid orders only."
      }}</span>
      <div v-if="editing" class="customer-actions">
        <BaseButton :disabled="state.busy || discard" @click="requestClose">Cancel</BaseButton
        ><BaseButton variant="primary" type="submit" form="customer-form" :loading="state.busy" :disabled="discard">{{
          customerId ? "Save changes" : "Create customer"
        }}</BaseButton>
      </div>
      <div v-else-if="confirming" class="customer-actions">
        <BaseButton ref="keepCustomer" :disabled="state.busy" @click="cancelDelete">Keep customer</BaseButton
        ><BaseButton variant="destructive" :loading="state.busy" @click="remove">Delete permanently</BaseButton>
      </div>
      <div v-else class="customer-actions">
        <BaseButton
          v-if="customer"
          ref="delete"
          variant="destructive"
          :disabled="metrics.orderCount > 0"
          @click="confirmDelete"
          >Delete customer</BaseButton
        ><BaseButton @click="requestClose">Close</BaseButton
        ><BaseButton v-if="customer" variant="primary" @click="startEdit">Edit customer</BaseButton>
      </div>
    </template>
  </UModal>
</template>
