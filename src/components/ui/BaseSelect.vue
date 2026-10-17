<script>
import { h, markRaw } from "vue";
import USelect from "@nuxt/ui/components/Select.vue";
import AppIcon from "./AppIcon.vue";
const checkIcon = markRaw({
  name: "SelectCheckIcon",
  render() {
    return h(AppIcon, { name: "check", size: 16 });
  },
});
export default {
  name: "BaseSelect",
  components: { USelect, AppIcon },
  inheritAttrs: false,
  props: {
    id: { type: String, required: true },
    label: String,
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
  },
  emits: ["update:modelValue"],
  data() {
    return { checkIcon };
  },
};
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label
    ><USelect
      :id="id"
      v-bind="$attrs"
      :model-value="modelValue"
      :items="options"
      :selected-icon="checkIcon"
      color="neutral"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <template #trailing><AppIcon name="chevron" :size="16" class="nexus-select-chevron" /></template>
    </USelect>
  </div>
</template>
