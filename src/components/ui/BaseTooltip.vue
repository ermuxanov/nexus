<script>
import UTooltip from "@nuxt/ui/components/Tooltip.vue";
export default {
  name: "BaseTooltip",
  components: { UTooltip },
  props: { text: { type: String, required: true }, disabled: Boolean, side: { type: String, default: "bottom" } },
};
</script>
<template>
  <UTooltip :text="text" :disabled="disabled" :content="{ side }"><slot /></UTooltip>
</template>
