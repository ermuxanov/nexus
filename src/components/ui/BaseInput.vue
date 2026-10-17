<script>
export default {
  name: "BaseInput",
  inheritAttrs: false,
  props: {
    id: { type: String, required: true },
    label: String,
    modelValue: { type: [String, Number], default: "" },
    error: String,
    hint: String,
  },
  emits: ["update:modelValue"],
};
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label
    ><input
      :id="id"
      v-bind="$attrs"
      :value="modelValue"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? `${id}-message` : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <p v-if="error || hint" :id="`${id}-message`" :class="{ field__error: error }">{{ error || hint }}</p>
  </div>
</template>
