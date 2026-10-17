<script>
import UModal from "@nuxt/ui/components/Modal.vue";
import BaseInput from "../../components/ui/BaseInput.vue";
import BaseSelect from "../../components/ui/BaseSelect.vue";
import BaseDateInput from "../../components/ui/BaseDateInput.vue";
import BaseButton from "../../components/ui/BaseButton.vue";
import AppIcon from "../../components/ui/AppIcon.vue";
import { orderDraft, validateOrderDraft } from "../../domain/orderEditor.js";
import { formatMoney } from "../../domain/analytics.js";
import { createOrderEditor } from "../../store/orderEditor.js";
import "./order-dialog.scss";
import "./order-form.scss";

export default {
  name: "OrderForm",
  components: { UModal, BaseInput, BaseSelect, BaseDateInput, BaseButton, AppIcon },
  props: { order: { type: Object, default: null }, customers: { type: Array, required: true } },
  emits: ["close", "saved"],
  data() {
    const draft = orderDraft(this.order);
    const editor = createOrderEditor();
    return {
      draft,
      baseline: JSON.stringify(draft),
      editor,
      mutation: editor.state,
      submitted: false,
      discard: false,
      rowKeys: draft.items.map((_, index) => index),
      nextKey: draft.items.length,
    };
  },
  computed: {
    title() {
      return this.order ? `Edit order ${this.order.id}` : "Create order";
    },
    dirty() {
      return JSON.stringify(this.draft) !== this.baseline;
    },
    validation() {
      return validateOrderDraft(this.draft, this.customers, this.order);
    },
    errors() {
      return this.submitted ? this.validation.errors : {};
    },
    customerOptions() {
      return this.customers.map((customer) => ({
        value: customer.id,
        label: `${customer.name} · ${customer.company}`,
      }));
    },
    statusOptions() {
      return ["pending", "paid", "cancelled"].map((value) => ({
        value,
        label: value[0].toUpperCase() + value.slice(1),
      }));
    },
    total() {
      return this.validation.totalCents === null ? "—" : formatMoney(this.validation.totalCents);
    },
  },
  mounted() {
    window.addEventListener("beforeunload", this.beforeUnload);
  },
  beforeUnmount() {
    window.removeEventListener("beforeunload", this.beforeUnload);
  },
  methods: {
    beforeUnload(event) {
      if (this.dirty || this.mutation.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    requestClose() {
      if (this.mutation.saving) return;
      if (!this.dirty) {
        this.$emit("close");
        return;
      }
      this.discard = true;
      this.$nextTick(() => this.$refs.keepEditing?.$el.focus());
    },
    keepEditing() {
      this.discard = false;
      this.$nextTick(() => this.$refs.form.querySelector("input, [role='combobox']")?.focus());
    },
    addItem() {
      this.draft.items.push({ name: "", quantity: "1", price: "" });
      this.rowKeys.push(this.nextKey++);
      this.$nextTick(() => this.$refs.form.querySelector(`#item-${this.rowKeys.at(-1)}-name`)?.focus());
    },
    removeItem(index) {
      this.draft.items.splice(index, 1);
      this.rowKeys.splice(index, 1);
      this.$nextTick(() => this.$refs.addItem?.$el.focus());
    },
    async submit() {
      if (this.mutation.saving || this.discard) return;
      this.submitted = true;
      if (!this.validation.payload) {
        this.$nextTick(() => this.$refs.validationSummary?.focus());
        return;
      }
      const saved = await this.editor.save(this.validation.payload, this.order);
      if (saved) {
        this.baseline = JSON.stringify(this.draft);
        this.$emit("saved", saved);
      } else this.$nextTick(() => this.$refs.saveError?.focus());
    },
  },
};
</script>

<template>
  <UModal
    :open="true"
    :title="title"
    description="Order details and line items · USD · UTC dates"
    :close="false"
    :dismissible="false"
    :transition="false"
    :ui="{
      overlay: 'order-dialog-overlay',
      content: 'order-dialog',
      header: 'order-dialog-header',
      title: 'order-dialog-title',
      description: 'order-dialog-description',
      body: 'order-dialog-body',
      footer: 'order-dialog-footer',
    }"
    @close:prevent="requestClose"
    @update:open="!$event && requestClose()"
  >
    <template #actions
      ><button
        type="button"
        class="icon-button"
        aria-label="Close order form"
        :disabled="mutation.saving"
        @click="requestClose"
      >
        <AppIcon name="close" :size="18" /></button
    ></template>
    <template #body>
      <section v-if="discard" class="order-discard" role="alert" aria-labelledby="discard-heading">
        <h3 id="discard-heading">Discard unsaved changes?</h3>
        <p>Your changes have not been saved.</p>
        <div>
          <BaseButton ref="keepEditing" @click="keepEditing">Keep editing</BaseButton
          ><BaseButton @click="$emit('close')">Discard changes</BaseButton>
        </div>
      </section>
      <form id="order-editor-form" ref="form" novalidate :inert="discard || undefined" @submit.prevent="submit">
        <div
          v-if="submitted && Object.keys(errors).length"
          ref="validationSummary"
          class="order-form-error"
          role="alert"
          tabindex="-1"
        >
          Review the highlighted fields. Your input has been kept.
        </div>
        <div v-if="mutation.error" ref="saveError" class="order-form-error" role="alert" tabindex="-1">
          {{ mutation.error }} Your input is preserved; correct the issue and try saving again.
        </div>
        <p class="order-form-meta">{{ order ? `Order ID · ${order.id}` : "Order ID is generated when saved." }}</p>
        <fieldset :disabled="mutation.saving" class="order-form-fields" :aria-busy="mutation.saving">
          <legend class="visually-hidden">Order details</legend>
          <div class="order-form-grid">
            <div>
              <BaseSelect
                id="order-customer"
                v-model="draft.customerId"
                label="Customer"
                placeholder="Choose a customer"
                :options="customerOptions"
                :aria-invalid="!!errors.customerId"
                :aria-describedby="errors.customerId ? 'order-customer-error' : undefined"
              />
              <p v-if="errors.customerId" id="order-customer-error" class="order-field-error">
                {{ errors.customerId }}
              </p>
            </div>
            <BaseDateInput
              id="order-date"
              v-model="draft.date"
              label="Order date · UTC"
              :error="errors.date"
              @draft-change="draft.date = $event"
            />
            <div>
              <BaseSelect
                id="order-status"
                v-model="draft.status"
                label="Status"
                :options="statusOptions"
                :aria-invalid="!!errors.status"
              />
              <p v-if="errors.status" class="order-field-error">{{ errors.status }}</p>
            </div>
            <p class="order-date-note">
              New or changed dates use 00:00 UTC. An unchanged edit keeps its original timestamp.
            </p>
          </div>
          <div class="order-items-heading">
            <h3>Line items</h3>
            <span>Unit prices in USD</span>
          </div>
          <p v-if="errors.items" class="order-field-error" role="alert">{{ errors.items }}</p>
          <fieldset v-for="(item, index) in draft.items" :key="rowKeys[index]" class="order-line">
            <legend>Item {{ index + 1 }}</legend>
            <BaseInput
              :id="`item-${rowKeys[index]}-name`"
              v-model="item.name"
              label="Item name"
              :error="errors[`items.${index}.name`]"
            />
            <BaseInput
              :id="`item-${rowKeys[index]}-quantity`"
              v-model="item.quantity"
              label="Quantity"
              inputmode="numeric"
              :error="errors[`items.${index}.quantity`]"
            />
            <BaseInput
              :id="`item-${rowKeys[index]}-price`"
              v-model="item.price"
              label="Unit price · USD"
              inputmode="decimal"
              placeholder="0.00"
              :error="errors[`items.${index}.price`]"
            />
            <BaseButton
              :disabled="draft.items.length === 1"
              :aria-label="`Remove item ${index + 1}`"
              @click="removeItem(index)"
              >Remove</BaseButton
            >
          </fieldset>
          <BaseButton ref="addItem" @click="addItem">Add item</BaseButton>
        </fieldset>
      </form>
    </template>
    <template #footer
      ><div class="order-form-total" aria-live="polite">
        <span>Total · USD</span><strong>{{ total }}</strong>
      </div>
      <div class="order-form-actions">
        <BaseButton :disabled="mutation.saving || discard" @click="requestClose">Cancel</BaseButton
        ><BaseButton
          type="submit"
          variant="primary"
          form="order-editor-form"
          :loading="mutation.saving"
          :disabled="discard || !customers.length"
          >{{ order ? "Save changes" : "Create order" }}</BaseButton
        >
      </div></template
    >
  </UModal>
</template>
