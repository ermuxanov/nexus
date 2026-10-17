<script>
import UButton from "@nuxt/ui/components/Button.vue";
export default {
  name: "BaseButton",
  components: { UButton },
  props: {
    variant: { type: String, default: "secondary" },
    loading: Boolean,
    disabled: Boolean,
    type: { type: String, default: "button" },
  },
};
</script>
<template>
  <UButton
    :type="type"
    class="button"
    :class="`button--${variant}`"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :loading="loading"
    color="neutral"
    variant="outline"
  >
    <template #leading><span v-if="loading" class="spinner" aria-hidden="true" /></template>
    <span class="button__content"><slot /></span>
  </UButton>
</template>
