<script>
import AppIcon from "./AppIcon.vue";
import BaseButton from "./BaseButton.vue";
export default {
  name: "StatePanel",
  components: { AppIcon, BaseButton },
  props: { state: { type: String, default: "empty" }, title: String, description: String },
  emits: ["retry"],
};
</script>
<template>
  <div class="state-panel" :role="state === 'error' ? 'alert' : 'status'" :aria-busy="state === 'loading' || undefined">
    <span v-if="state === 'loading'" class="spinner" /><AppIcon
      v-else
      :name="state === 'error' ? 'info' : 'layers'"
      :size="26"
    />
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <BaseButton v-if="state === 'error'" @click="$emit('retry')"
      ><AppIcon name="retry" :size="16" />Try again</BaseButton
    >
  </div>
</template>
