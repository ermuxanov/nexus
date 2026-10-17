<script>
import { defineAsyncComponent, h, markRaw } from "vue";
import UPopover from "@nuxt/ui/components/Popover.vue";
import { parseDate } from "@internationalized/date";
import BaseButton from "./BaseButton.vue";
import AppIcon from "./AppIcon.vue";
import "./base-date.scss";

function calendarValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}
const previousIcon = markRaw({
  render() {
    return h(AppIcon, { name: "chevron", size: 16, style: { transform: "rotate(180deg)" } });
  },
});
const nextIcon = markRaw({
  render() {
    return h(AppIcon, { name: "chevron", size: 16 });
  },
});

export default {
  name: "BaseDateInput",
  components: {
    UCalendar: defineAsyncComponent({
      loader: () => import("@nuxt/ui/components/Calendar.vue"),
      delay: 0,
      loadingComponent: {
        render() {
          return h("p", { class: "nexus-calendar-loading", role: "status" }, "Loading calendar…");
        },
      },
      errorComponent: {
        render() {
          return h(
            "p",
            { class: "nexus-calendar-loading", role: "alert" },
            "Calendar unavailable. Enter the date in the field above.",
          );
        },
      },
    }),
    UPopover,
    BaseButton,
    AppIcon,
  },
  props: {
    id: { type: String, required: true },
    label: String,
    modelValue: { type: String, default: "" },
    min: String,
    max: String,
    error: String,
  },
  emits: ["update:modelValue", "draft-change"],
  data() {
    return {
      open: false,
      draft: this.modelValue,
      editing: false,
      touched: false,
      previousIcon,
      nextIcon,
      utcToday: parseDate(new Date().toISOString().slice(0, 10)),
    };
  },
  computed: {
    value() {
      return calendarValue(this.modelValue);
    },
    minValue() {
      return calendarValue(this.min);
    },
    maxValue() {
      return calendarValue(this.max);
    },
    message() {
      if (this.editing) return "";
      return (
        this.error || (this.touched && this.draft && !calendarValue(this.draft) ? "Use a valid date: YYYY-MM-DD." : "")
      );
    },
    todayDisabled() {
      return (
        (this.minValue && this.utcToday.compare(this.minValue) < 0) ||
        (this.maxValue && this.utcToday.compare(this.maxValue) > 0)
      );
    },
  },
  watch: {
    modelValue(value) {
      if (value !== this.draft) {
        this.draft = value;
        this.touched = false;
      }
    },
  },
  methods: {
    input(value) {
      this.draft = value;
      this.editing = true;
      this.$emit("draft-change", value);
    },
    commit() {
      this.editing = false;
      this.touched = true;
      this.$emit("update:modelValue", this.draft);
    },
    select(value) {
      this.draft = value?.toString() || "";
      this.editing = false;
      this.touched = false;
      this.$emit("draft-change", this.draft);
      this.$emit("update:modelValue", this.draft);
      this.open = false;
    },
  },
};
</script>
<template>
  <div class="field nexus-date-field">
    <label :for="id">{{ label }}</label>
    <div class="nexus-date-input">
      <input
        :id="id"
        type="text"
        :value="draft"
        placeholder="YYYY-MM-DD"
        maxlength="10"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="!!message"
        :aria-describedby="`${id}-format${message ? ` ${id}-message` : ''}`"
        @input="input($event.target.value)"
        @focus="editing = true"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.down.prevent="open = true"
      />
      <UPopover
        v-model:open="open"
        :content="{ align: 'start', 'aria-label': `${label} calendar` }"
        :ui="{ content: 'nexus-date-popover' }"
      >
        <button type="button" class="nexus-date-trigger" :aria-label="`Open ${label} calendar`">
          <AppIcon name="calendar" :size="18" />
        </button>
        <template #content>
          <p class="nexus-date-caption">{{ label }} <span>YYYY-MM-DD</span></p>
          <UCalendar
            :model-value="value"
            :default-placeholder="value || minValue || maxValue || utcToday"
            :min-value="minValue"
            :max-value="maxValue"
            locale="en-US"
            :week-starts-on="1"
            :year-controls="false"
            :view-control="false"
            initial-focus
            prevent-deselect
            :prev-month-icon="previousIcon"
            :next-month-icon="nextIcon"
            :prev-month="{ class: 'nexus-calendar-nav' }"
            :next-month="{ class: 'nexus-calendar-nav' }"
            :ui="{ root: 'nexus-calendar' }"
            @update:model-value="select"
          />
          <div class="nexus-date-actions">
            <BaseButton :disabled="!draft" @click="select(undefined)">Clear</BaseButton
            ><BaseButton :disabled="!!todayDisabled" @click="select(utcToday)">Today · UTC</BaseButton>
          </div>
        </template>
      </UPopover>
    </div>
    <span :id="`${id}-format`" class="visually-hidden"
      >Enter a date as YYYY-MM-DD and press Enter or leave the field to apply. Use Arrow Down to open the
      calendar.</span
    >
    <p v-if="message" :id="`${id}-message`" class="field__error">{{ message }}</p>
  </div>
</template>
